import { readFile } from "node:fs/promises";
import path from "node:path";
import { COUNTRIES } from "@/lib/data/countries";
import { setAttributes, withSpan } from "@/lib/otel";
import type { ManifestSource } from "@/lib/sources/manifest";
import { dbEnabled } from "@/services/database";
import { completeText, getLlmConfig, getProvider } from "@/services/llm";
import { upsertIndicatorsDb } from "@/services/repo/indicators";
import type { Indicator } from "@/types";
import { upsertIndicators } from "./store";
import type { IngestStats } from "./worldbank";

const MAX_INPUT_CHARS = 60_000;

const VALID_ISO = new Set(COUNTRIES.map((c) => c.iso3));

interface AiRow {
  country?: string;
  metric?: string;
  year?: number;
  value?: number;
  unit?: string;
  source?: string;
}

function validate(rows: AiRow[], fallbackSource: string): { rows: Indicator[]; skipped: string[] } {
  const out: Indicator[] = [];
  const skipped: string[] = [];
  rows.forEach((r, i) => {
    const iso = (r.country ?? "").trim().toUpperCase();
    if (!VALID_ISO.has(iso)) {
      skipped.push(`row ${i}: bad country ${r.country}`);
      return;
    }
    const metric = (r.metric ?? "").trim();
    if (!metric) {
      skipped.push(`row ${i}: blank metric`);
      return;
    }
    const year = Number(r.year);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      skipped.push(`row ${i}: bad year ${r.year}`);
      return;
    }
    const value = Number(r.value);
    if (!Number.isFinite(value)) {
      skipped.push(`row ${i}: bad value ${r.value}`);
      return;
    }
    out.push({
      id: `${iso}-${metric}-${Math.trunc(year)}`,
      countryIso3: iso,
      metric,
      value,
      unit: r.unit?.trim() ?? "",
      year: Math.trunc(year),
      source: r.source?.trim() || fallbackSource,
      confidence: "low",
    });
  });
  return { rows: out, skipped: skipped.slice(0, 20) };
}

export interface RunAiExtractOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
}

export async function runAiExtract(
  source: ManifestSource,
  opts: RunAiExtractOpts = {},
): Promise<IngestStats> {
  return withSpan(
    "ingest.ai-extract",
    async () => {
      const startedAt = new Date().toISOString();
      const t0 = Date.now();
      const provider = getProvider();
      const cfg = getLlmConfig();
      if (!provider.available()) {
        return {
          source: `ai-extract:${source.cacheKey}`,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          rowsUpserted: 0,
          errors: [`LLM provider (${provider.name}) unavailable: ${provider.unavailableReason()}`],
        };
      }
      if (!source.url.startsWith("local://")) {
        throw new Error(`ai-extract runner requires local:// URL, got ${source.url}`);
      }
      const rel = source.url.slice("local://".length);
      const localPath = path.join(process.cwd(), "agent-resources", rel);
      const text = await readFile(localPath, "utf-8");
      const truncated = text.slice(0, MAX_INPUT_CHARS);
      const isoList = Array.from(VALID_ISO).join(",");

      const result = await completeText({
        maxTokens: 4000,
        classification: "internal",
        step: "ai-extract",
        actor: opts.actor,
        actorDept: opts.actorDept,
        reqId: opts.reqId,
        system: `You extract structured country indicators from unstructured text (PDF/DOCX dumps).

Output STRICT JSON only — an array of objects shaped:
{"country":"<ISO3>","metric":"<snake_case>","year":<int>,"value":<number>,"unit":"<short>","source":"<source>"}

Rules:
- country MUST be ISO 3166-1 alpha-3 from this list: ${isoList}
- metric: snake_case like gdp_usd_nominal, population, oil_production_kbd, renewables_share_pct
- year: 1900-2100 integer
- value: numeric, no commas, no units in the number (use the unit field)
- unit: short like "USD", "%", "kbd", "twh", "" if dimensionless
- source: short citation if mentioned in text, else ""
- Skip anything you cannot confidently extract — empty array is acceptable
- Return [] (empty array) if no extractable indicators

Reply with JSON array only — no prose, no markdown fence.`,
        messages: [
          {
            role: "user",
            content: `Source: ${source.name}\nCoverage: ${source.coverage}\n\nText:\n${truncated}`,
          },
        ],
      });

      const blockText = result.text;
      const m = blockText.match(/\[[\s\S]*\]/);
      let parsed: AiRow[] = [];
      let parseError: string | null = null;
      if (m) {
        try {
          parsed = JSON.parse(m[0]) as AiRow[];
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
        }
      } else {
        parseError = "no JSON array in AI response";
      }

      const { rows, skipped } = validate(parsed, source.name);
      const upserted = upsertIndicators(rows);
      if (dbEnabled() && rows.length > 0) {
        await withSpan("ingest.ai-extract.db.upsert", () => upsertIndicatorsDb(rows), {
          "ingest.rows": rows.length,
        });
      }
      const finishedAt = new Date().toISOString();
      const errors: string[] = [];
      if (parseError) errors.push(parseError);
      errors.push(...skipped);
      setAttributes({
        "ingest.upserted": upserted,
        "ingest.skipped": skipped.length,
        "ingest.input_chars": truncated.length,
        "ingest.duration_ms": Date.now() - t0,
        "ai.provider": cfg.provider,
        "ai.model": cfg.model,
      });
      return {
        source: `ai-extract:${source.cacheKey}`,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        rowsUpserted: upserted,
        errors,
      };
    },
    { "ingest.source": source.name, "ingest.cacheKey": source.cacheKey },
  );
}
