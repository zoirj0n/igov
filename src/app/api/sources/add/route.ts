import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { invalidateManifestCache } from "@/lib/sources/manifest";
import { appendUserSource, slugify } from "@/lib/sources/userSources";
import { logAudit } from "@/services/audit";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import { z } from "zod";

interface ParsedSpreadsheet {
  kind: "spreadsheet";
  csv: string;
  sheets: number;
  rows: number;
  headerSample: string[];
}

interface ParsedDocument {
  kind: "document";
  text: string;
  pages?: number;
  words: number;
  preview: string;
}

const MAX_DOC_CHARS = 4_000_000;

function clipText(s: string): string {
  return s.length > MAX_DOC_CHARS ? `${s.slice(0, MAX_DOC_CHARS)}\n\n[truncated]` : s;
}

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

async function parsePdf(bytes: Buffer): Promise<ParsedDocument> {
  const data = new Uint8Array(bytes);
  const parser = new PDFParse({ data });
  try {
    const out = await parser.getText();
    const text = clipText(out.text ?? "");
    return {
      kind: "document",
      text,
      pages: out.total ?? out.pages?.length,
      words: countWords(text),
      preview: text.slice(0, 240).replace(/\s+/g, " ").trim(),
    };
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(bytes: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  const text = clipText(result.value ?? "");
  return {
    kind: "document",
    text,
    words: countWords(text),
    preview: text.slice(0, 240).replace(/\s+/g, " ").trim(),
  };
}

function parseSpreadsheet(bytes: Buffer): ParsedSpreadsheet {
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("xlsx workbook has no sheets");
  }
  const parts: string[] = [];
  let rows = 0;
  let headerSample: string[] = [];
  for (const name of sheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    const lineCount = csv ? csv.split("\n").filter((l) => l.length > 0).length : 0;
    rows += lineCount;
    if (sheetNames.length > 1) parts.push(`### Sheet: ${name}\n${csv}`);
    else parts.push(csv);
    if (headerSample.length === 0 && csv) {
      const first = csv.split("\n")[0] ?? "";
      headerSample = first
        .split(",")
        .slice(0, 12)
        .map((s) => s.trim());
    }
  }
  return {
    kind: "spreadsheet",
    csv: parts.join("\n\n"),
    sheets: sheetNames.length,
    rows,
    headerSample,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_CATEGORIES = [
  "international-datasets",
  "economic-indicators",
  "energy-statistics",
  "energy-and-sustainability",
  "sustainability-reports",
  "competitiveness-indexes",
  "trade-and-agreements",
  "public-international-reports",
  "government-publications",
  "regional-sources",
  "executive-materials",
];

const UrlBodySchema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url().max(500),
  category: z.string().min(2).max(60),
  coverage: z.string().max(400).default(""),
  bestUse: z.string().max(400).default(""),
});

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "analyst")) {
    return NextResponse.json({ error: "forbidden: analyst or higher required" }, { status: 403 });
  }

  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const name = String(form.get("name") ?? "").trim();
      const category = String(form.get("category") ?? "").trim();
      const coverage = String(form.get("coverage") ?? "").trim();
      const bestUse = String(form.get("bestUse") ?? "").trim();
      const file = form.get("file");
      if (!name || !category || !(file instanceof File)) {
        return NextResponse.json({ error: "name, category, file required" }, { status: 400 });
      }
      if (!KNOWN_CATEGORIES.includes(category)) {
        return NextResponse.json({ error: `unknown category: ${category}` }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` },
          { status: 413 },
        );
      }
      const cacheKey = slugify(name);
      const origExt = (file.name.split(".").pop() ?? "bin").slice(0, 8).toLowerCase();
      const uploadDir = path.join(process.cwd(), "agent-resources", "uploads");
      await mkdir(uploadDir, { recursive: true });
      const origPath = path.join(uploadDir, `${cacheKey}.${origExt}`);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(origPath, bytes);

      if (origExt === "doc") {
        return NextResponse.json(
          {
            error:
              "legacy .doc not supported. Save as .docx (Word: File → Save As → Word Document) or export to PDF and re-upload.",
          },
          { status: 415 },
        );
      }

      const isSpreadsheet =
        origExt === "xlsx" || origExt === "xls" || origExt === "xlsm" || origExt === "ods";
      const isPdf = origExt === "pdf";
      const isDocx = origExt === "docx";
      let importUrl = `local://uploads/${cacheKey}.${origExt}`;
      let importPath = origPath;
      let spreadsheet: ParsedSpreadsheet | null = null;
      let document: ParsedDocument | null = null;
      let parseError: string | null = null;

      if (isSpreadsheet) {
        try {
          spreadsheet = parseSpreadsheet(bytes);
          const csvPath = path.join(uploadDir, `${cacheKey}.csv`);
          await writeFile(csvPath, spreadsheet.csv, "utf-8");
          importUrl = `local://uploads/${cacheKey}.csv`;
          importPath = csvPath;
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
          logAudit(user, "source.add.upload.xlsx_parse_failed", "source", {
            resourceId: cacheKey,
            meta: { error: parseError },
          });
        }
      } else if (isPdf || isDocx) {
        try {
          document = isPdf ? await parsePdf(bytes) : await parseDocx(bytes);
          const txtPath = path.join(uploadDir, `${cacheKey}.txt`);
          await writeFile(txtPath, document.text, "utf-8");
          importUrl = `local://uploads/${cacheKey}.txt`;
          importPath = txtPath;
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
          logAudit(user, `source.add.upload.${origExt}_parse_failed`, "source", {
            resourceId: cacheKey,
            meta: { error: parseError },
          });
        }
      }

      let defaultCoverage: string;
      if (spreadsheet) {
        defaultCoverage = `Uploaded ${origExt.toUpperCase()} · ${spreadsheet.sheets} sheet(s) · ${spreadsheet.rows} rows`;
      } else if (document) {
        const pageStr = document.pages ? ` · ${document.pages} page(s)` : "";
        defaultCoverage = `Uploaded ${origExt.toUpperCase()}${pageStr} · ${document.words} words`;
      } else {
        defaultCoverage = `Uploaded ${origExt.toUpperCase()} file (${bytes.length} bytes)`;
      }

      const entry = {
        cacheKey,
        name,
        url: importUrl,
        coverage: coverage || defaultCoverage,
        bestUse: bestUse || `User-uploaded reference by ${user.email}`,
        category,
        addedBy: user.email,
        addedAt: new Date().toISOString(),
        origin: "upload" as const,
        localPath: importPath,
      };
      await appendUserSource(entry);
      invalidateManifestCache();
      logAudit(user, "source.add.upload", "source", {
        resourceId: cacheKey,
        meta: {
          category,
          bytes: bytes.length,
          filename: file.name,
          origExt,
          extractedAs: spreadsheet ? "csv" : document ? "txt" : null,
          sheets: spreadsheet?.sheets,
          rows: spreadsheet?.rows,
          pages: document?.pages,
          words: document?.words,
          parseError,
        },
      });
      return NextResponse.json({
        ok: true,
        source: entry,
        extracted: spreadsheet
          ? {
              kind: "spreadsheet",
              sheets: spreadsheet.sheets,
              rows: spreadsheet.rows,
              headerSample: spreadsheet.headerSample,
            }
          : document
            ? {
                kind: "document",
                pages: document.pages,
                words: document.words,
                preview: document.preview,
              }
            : undefined,
        parseError: parseError ?? undefined,
      });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const parsed = UrlBodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    if (!KNOWN_CATEGORIES.includes(parsed.data.category)) {
      return NextResponse.json(
        { error: `unknown category: ${parsed.data.category}` },
        { status: 400 },
      );
    }
    const cacheKey = slugify(parsed.data.name);
    const entry = {
      cacheKey,
      name: parsed.data.name,
      url: parsed.data.url,
      coverage: parsed.data.coverage || `URL source added by ${user.email}`,
      bestUse: parsed.data.bestUse || "User-added reference",
      category: parsed.data.category,
      addedBy: user.email,
      addedAt: new Date().toISOString(),
      origin: "url" as const,
    };
    await appendUserSource(entry);
    invalidateManifestCache();
    logAudit(user, "source.add.url", "source", {
      resourceId: cacheKey,
      meta: { category: parsed.data.category, url: parsed.data.url },
    });
    return NextResponse.json({ ok: true, source: entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAudit(user, "source.add.error", "source", { meta: { error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
