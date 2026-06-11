"use client";

import { Modal } from "@/components/shared/Modal";
import { Skeleton } from "@/components/shared/Skeleton";
import { AppShell } from "@/components/shell/AppShell";
import { hasRole, useAuthedUser } from "@/lib/auth/client";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useMemo, useState } from "react";

interface Source {
  name: string;
  url: string;
  coverage: string;
  bestUse: string;
  cacheKey: string;
}

interface Category {
  label: string;
  dir: string;
  sources: Source[];
}

interface Manifest {
  version: string;
  sourceCsv: string;
  categories: Record<string, Category>;
}

export default function SourcesPage() {
  useDocumentTitle("Sources");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, ImportResultBadge>>({});
  const [ragDocs, setRagDocs] = useState<
    Record<string, { chunks: number; lastIngestedAt: string }>
  >({});
  const [ragBusy, setRagBusy] = useState<string | null>(null);
  const { push } = useToast();
  const { user } = useAuthedUser();
  const canImport = hasRole(user, "analyst");
  const canAuto = hasRole(user, "admin");
  const canAdd = hasRole(user, "analyst");
  const canRag = hasRole(user, "admin");
  const [addOpen, setAddOpen] = useState(false);

  function reload(): void {
    fetch("/api/sources")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: Manifest | null) => d && setManifest(d))
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sources")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as Manifest;
      })
      .then((d) => {
        if (cancelled) return;
        setManifest(d);
        const firstKey = Object.keys(d.categories)[0];
        if (firstKey) setActiveCat(firstKey);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    fetch("/api/sources/import/results")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: { results?: Record<string, HydrateRec> } | null) => {
        if (!d?.results || cancelled) return;
        const hydrated: Record<string, ImportResultBadge> = {};
        for (const [key, rec] of Object.entries(d.results)) {
          hydrated[key] = toBadge(rec);
        }
        setLastResult(hydrated);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canRag) return;
    let cancelled = false;
    refreshRagDocs(cancelled);
    return () => {
      cancelled = true;
    };
  }, [canRag]);

  function refreshRagDocs(cancelled = false): void {
    if (!canRag) return;
    fetch("/api/admin/rag/docs")
      .then(async (r) => (r.ok ? r.json() : null))
      .then(
        (
          d: { docs?: Array<{ docId: string; chunkCount: number; lastIngestedAt: string }> } | null,
        ) => {
          if (!d?.docs || cancelled) return;
          const map: Record<string, { chunks: number; lastIngestedAt: string }> = {};
          const PREFIX = "doc:source:";
          for (const doc of d.docs) {
            if (doc.docId.startsWith(PREFIX)) {
              const key = doc.docId.slice(PREFIX.length);
              map[key] = { chunks: doc.chunkCount, lastIngestedAt: doc.lastIngestedAt };
            }
          }
          setRagDocs(map);
        },
      )
      .catch(() => {});
  }

  async function ragIngest(cacheKey: string): Promise<void> {
    setRagBusy(cacheKey);
    try {
      const res = await fetch("/api/admin/rag/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "source", cacheKey, classification: "internal" }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: `RAG: ingested ${cacheKey}`,
        detail: `${data.chunks} chunks · ${data.embedded} embedded · ${data.embedVendor}/${data.embedModel} · ${data.durationMs}ms`,
      });
      refreshRagDocs();
    } catch (err) {
      push({
        kind: "error",
        title: "RAG ingest failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRagBusy(null);
    }
  }

  async function runImport(cacheKey: string): Promise<void> {
    setImporting(cacheKey);
    try {
      const res = await fetch("/api/sources/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cacheKey, force: true }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      const runner: string = data?.classification?.runner ?? "none";
      const skipped = Boolean(data?.ingest?.skipped);
      const rows: number = data?.ingest?.rowsUpserted ?? 0;
      const errors: number = Array.isArray(data?.ingest?.errors) ? data.ingest.errors.length : 0;
      const errSample: string[] = Array.isArray(data?.ingest?.errors) ? data.ingest.errors : [];
      const freshSkip = errSample.some(
        (e: string) => typeof e === "string" && e.startsWith("fresh:"),
      );
      const reason = data?.ingest?.reason ?? data?.classification?.reason ?? errSample[0];
      setLastResult((prev) => ({
        ...prev,
        [cacheKey]: {
          runner,
          rows,
          errors,
          skipped,
          bytes: data?.bytes ?? 0,
          ts: Date.now(),
          reason,
          freshSkip,
        },
      }));
      push({
        kind: skipped || runner === "none" ? "warn" : errors > 0 ? "warn" : "success",
        title: `Imported ${data.source.name}`,
        detail: skipped
          ? `Skipped · ${data?.ingest?.reason ?? data?.classification?.reason ?? "no runner"}`
          : `${runner} · ${rows} rows${errors ? ` · ${errors} skipped` : ""} · ${data.bytes} bytes`,
      });
    } catch (err) {
      push({
        kind: "error",
        title: "Import failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(null);
    }
  }

  async function runAuto(force: boolean): Promise<void> {
    setAutoRunning(true);
    push({
      kind: "info",
      title: "Auto-import started",
      detail: force
        ? "Re-fetching all sources (force)"
        : "Fetching only stale sources (>24h cache)",
    });
    try {
      const res = await fetch("/api/admin/import/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force, max: 15 }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "Auto-import complete",
        detail: `${data.classified}/${data.sources} classified · ${data.rowsUpserted} rows · ${data.ms}ms`,
      });
      const r2 = await fetch("/api/sources/import/results");
      if (r2.ok) {
        const d2 = await r2.json();
        const hydrated: Record<string, ImportResultBadge> = {};
        for (const [key, rec] of Object.entries(d2.results as Record<string, HydrateRec>)) {
          hydrated[key] = toBadge(rec);
        }
        setLastResult(hydrated);
      }
    } catch (err) {
      push({
        kind: "error",
        title: "Auto-import failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAutoRunning(false);
    }
  }

  const filtered = useMemo(() => {
    if (!manifest) return null;
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches: { category: string; categoryLabel: string; source: Source }[] = [];
    for (const [slug, cat] of Object.entries(manifest.categories)) {
      for (const s of cat.sources) {
        if (
          s.name.toLowerCase().includes(q) ||
          s.coverage.toLowerCase().includes(q) ||
          s.bestUse.toLowerCase().includes(q)
        ) {
          matches.push({ category: slug, categoryLabel: cat.label, source: s });
        }
      }
    }
    return matches;
  }, [manifest, query]);

  const categoryEntries = manifest ? Object.entries(manifest.categories) : [];
  const activeCategory = activeCat && manifest ? manifest.categories[activeCat] : null;
  const totalSources = manifest
    ? Object.values(manifest.categories).reduce((n, c) => n + c.sources.length, 0)
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">Source catalog</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              {totalSources} trusted data sources · {categoryEntries.length} categories · audited
              every fetch
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, coverage, or best use…"
              className="w-72 rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none focus:shadow-pop"
              aria-label="search sources"
            />
            {canAdd && (
              <button type="button" onClick={() => setAddOpen(true)} className="btn-ghost text-xs">
                + Add source
              </button>
            )}
            {canAuto && (
              <div className="inline-flex overflow-hidden rounded-md shadow-card">
                <button
                  type="button"
                  onClick={() => runAuto(false)}
                  disabled={autoRunning}
                  className="btn-primary rounded-none border-e border-white/20 text-xs"
                  title="Import only sources whose cache is >24h old"
                >
                  {autoRunning ? "Importing…" : "Import stale"}
                </button>
                <button
                  type="button"
                  onClick={() => runAuto(true)}
                  disabled={autoRunning}
                  className="btn-primary rounded-none text-xs"
                  title="Force re-fetch all 15 sources regardless of cache"
                >
                  Force all
                </button>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-signal-risk/30 bg-signal-risk/5 px-3 py-2 text-xs text-signal-risk">
            {error}
          </div>
        )}

        {!manifest && !error && (
          <div className="card space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {manifest && filtered && (
          <section className="card overflow-hidden">
            <header className="border-b border-ink-100 px-5 py-3 text-sm font-medium text-ink-800">
              {filtered.length} match{filtered.length === 1 ? "" : "es"} for “{query}”
            </header>
            <ul className="divide-y divide-ink-100">
              {filtered.length === 0 && (
                <li className="px-5 py-8 text-center text-xs text-ink-400">No matches.</li>
              )}
              {filtered.map(({ source, categoryLabel, category }) => (
                <li
                  key={`${category}-${source.cacheKey}`}
                  className="px-5 py-3 transition hover:bg-ink-150"
                >
                  <SourceRow
                    source={source}
                    categoryLabel={categoryLabel}
                    onImport={runImport}
                    importing={importing}
                    canImport={canImport}
                    last={lastResult[source.cacheKey]}
                    ragInfo={ragDocs[source.cacheKey]}
                    canRag={canRag}
                    ragBusy={ragBusy === source.cacheKey}
                    onRagIngest={ragIngest}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {manifest && !filtered && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
            <nav className="card space-y-0.5 p-2">
              {categoryEntries.map(([slug, cat]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setActiveCat(slug)}
                  className={
                    activeCat === slug
                      ? "flex w-full items-center justify-between rounded-md bg-ink-100 px-3 py-2 text-sm font-medium text-ink-800"
                      : "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-150 hover:text-ink-800"
                  }
                >
                  <span className="truncate">{cat.label}</span>
                  <span className="ms-2 shrink-0 rounded-xs bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-400">
                    {cat.sources.length}
                  </span>
                </button>
              ))}
            </nav>

            <section className="card">
              {!activeCategory ? (
                <div className="px-5 py-8 text-center text-sm text-ink-400">Pick a category.</div>
              ) : (
                <>
                  <header className="border-b border-ink-100 px-5 py-3">
                    <h2 className="section-title">{activeCategory.label}</h2>
                    <div className="mt-1 font-mono text-2xs text-ink-400">
                      {activeCategory.sources.length} sources · {activeCategory.dir}
                    </div>
                  </header>
                  <ul className="divide-y divide-ink-100">
                    {activeCategory.sources.map((s) => (
                      <li key={s.cacheKey} className="px-5 py-3 transition hover:bg-ink-150">
                        <SourceRow
                          source={s}
                          categoryLabel={activeCategory.label}
                          onImport={runImport}
                          importing={importing}
                          canImport={canImport}
                          last={lastResult[s.cacheKey]}
                          ragInfo={ragDocs[s.cacheKey]}
                          canRag={canRag}
                          ragBusy={ragBusy === s.cacheKey}
                          onRagIngest={ragIngest}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}
      </div>
      <AddSourceModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={
          manifest
            ? Object.entries(manifest.categories).map(([slug, c]) => ({ slug, label: c.label }))
            : []
        }
        onAdded={() => {
          setAddOpen(false);
          reload();
          push({ kind: "success", title: "Source added", detail: "Visible in catalog." });
        }}
        onImportNow={(cacheKey) => {
          setAddOpen(false);
          reload();
          runImport(cacheKey);
        }}
      />
    </AppShell>
  );
}

function AddSourceModal({
  open,
  onClose,
  categories,
  onAdded,
  onImportNow,
}: {
  open: boolean;
  onClose: () => void;
  categories: { slug: string; label: string }[];
  onAdded: () => void;
  onImportNow: (cacheKey: string) => void;
}) {
  const { push } = useToast();
  const [mode, setMode] = useState<"url" | "upload">("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "international-datasets");
  const [coverage, setCoverage] = useState("");
  const [bestUse, setBestUse] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [extract, setExtract] = useState<UploadExtractPreview | null>(null);
  const [addedKey, setAddedKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("url");
      setName("");
      setUrl("");
      setCoverage("");
      setBestUse("");
      setFile(null);
      setBusy(false);
      setExtract(null);
      setAddedKey(null);
      if (categories[0]) setCategory(categories[0].slug);
    }
  }, [open, categories]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      let res: Response;
      if (mode === "upload") {
        if (!file) throw new Error("file required");
        const form = new FormData();
        form.set("name", name);
        form.set("category", category);
        form.set("coverage", coverage);
        form.set("bestUse", bestUse);
        form.set("file", file);
        res = await fetch("/api/sources/add", { method: "POST", body: form });
      } else {
        if (!url.trim()) throw new Error("URL required");
        res = await fetch("/api/sources/add", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, url, category, coverage, bestUse }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      const newKey = data?.source?.cacheKey ?? null;
      setAddedKey(newKey);
      if (mode === "upload" && data?.extracted) {
        setExtract(data.extracted as UploadExtractPreview);
        setBusy(false);
        return;
      }
      if (mode === "url" && newKey) {
        setExtract(null);
        setBusy(false);
        return;
      }
      onAdded();
    } catch (err) {
      push({
        kind: "error",
        title: "Add source failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add source" width="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="inline-flex rounded-md border border-ink-150 bg-ink-100 p-0.5 text-xs shadow-card">
          {(["url", "upload"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded-sm bg-accent px-3.5 py-1.5 font-medium text-white"
                  : "rounded-sm px-3.5 py-1.5 text-ink-500 transition hover:text-ink-800"
              }
            >
              {m === "url" ? "From URL" : "Upload file"}
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor="as-name"
            className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
          >
            Name
          </label>
          <input
            id="as-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. IMD Smart City Report 2026"
            className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
          />
        </div>

        {mode === "url" && (
          <div>
            <label
              htmlFor="as-url"
              className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
            >
              URL
            </label>
            <input
              id="as-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.org/dataset.csv"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {mode === "upload" && <FileDropZone file={file} onFile={setFile} />}

        <div>
          <label
            htmlFor="as-cat"
            className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
          >
            Category
          </label>
          <select
            id="as-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="as-cov"
              className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
            >
              Coverage (optional)
            </label>
            <input
              id="as-cov"
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              placeholder="What's in it"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="as-best"
              className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
            >
              Best use (optional)
            </label>
            <input
              id="as-best"
              value={bestUse}
              onChange={(e) => setBestUse(e.target.value)}
              placeholder="When to use it"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {extract && (
          <div className="rounded-md border border-signal-ok/30 bg-signal-ok/5 p-3 text-xs">
            <div className="mb-1 font-medium text-ink-800">Parsed successfully</div>
            {extract.kind === "spreadsheet" ? (
              <div className="space-y-0.5 text-ink-600">
                <div>
                  {extract.sheets} sheet(s) · {extract.rows} rows
                </div>
                {extract.headerSample && extract.headerSample.length > 0 && (
                  <div className="font-mono text-2xs text-ink-500">
                    headers: {extract.headerSample.join(", ")}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 text-ink-600">
                <div>
                  {extract.pages ? `${extract.pages} page(s) · ` : ""}
                  {extract.words ?? 0} words
                </div>
                {extract.preview && (
                  <div className="line-clamp-3 italic text-ink-500">"{extract.preview}"</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          {addedKey ? (
            <>
              <button type="button" onClick={onAdded} className="btn-ghost text-xs">
                Done
              </button>
              <button
                type="button"
                onClick={() => addedKey && onImportNow(addedKey)}
                className="btn-primary text-xs"
              >
                Import now →
              </button>
            </>
          ) : (
            <button type="submit" disabled={busy} className="btn-primary text-xs">
              {busy ? "Adding…" : "Add source"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

interface UploadExtractPreview {
  kind: "spreadsheet" | "document";
  sheets?: number;
  rows?: number;
  headerSample?: string[];
  pages?: number;
  words?: number;
  preview?: string;
}

const ACCEPT_EXTS = [
  ".csv",
  ".tsv",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".ods",
  ".pdf",
  ".docx",
  ".txt",
  ".json",
];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function FileDropZone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputId = "as-file";

  function pick(f: File | null): void {
    setErr(null);
    if (!f) {
      onFile(null);
      return;
    }
    const lower = f.name.toLowerCase();
    if (!ACCEPT_EXTS.some((ext) => lower.endsWith(ext))) {
      setErr(`Unsupported type. Accepted: ${ACCEPT_EXTS.join(", ")}`);
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setErr(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB, max 8 MB)`);
      return;
    }
    onFile(f);
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
      >
        File (max 8 MB)
      </label>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center text-xs transition ${
          dragging
            ? "border-accent bg-accent/5 text-accent"
            : file
              ? "border-signal-ok/40 bg-signal-ok/5 text-ink-700"
              : "border-ink-150 bg-ink-100 text-ink-500 hover:border-ink-300 hover:bg-ink-150"
        }`}
      >
        {file ? (
          <>
            <div className="font-medium text-ink-800">{file.name}</div>
            <div className="font-mono text-2xs text-ink-500">
              {(file.size / 1024).toFixed(1)} KB · {file.type || "binary"}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onFile(null);
              }}
              className="mt-1 text-2xs text-accent hover:underline"
            >
              Replace
            </button>
          </>
        ) : (
          <>
            <div className="font-medium text-ink-700">
              {dragging ? "Drop to attach" : "Drop file or click to browse"}
            </div>
            <div className="font-mono text-2xs text-ink-400">{ACCEPT_EXTS.join(" · ")}</div>
          </>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_EXTS.join(",")}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      {err && <div className="mt-1 text-2xs text-signal-risk">{err}</div>}
    </div>
  );
}

function SourceRow({
  source,
  categoryLabel,
  onImport,
  importing,
  canImport,
  last,
  ragInfo,
  canRag,
  ragBusy,
  onRagIngest,
}: {
  source: Source;
  categoryLabel: string;
  onImport: (cacheKey: string) => void;
  importing: string | null;
  canImport: boolean;
  last?: ImportResultBadge;
  ragInfo?: { chunks: number; lastIngestedAt: string };
  canRag: boolean;
  ragBusy: boolean;
  onRagIngest: (cacheKey: string) => void;
}) {
  const busy = importing === source.cacheKey;
  const anyBusy = importing !== null;
  const isLocal = source.url.startsWith("local://");
  const fetchable = source.url.startsWith("http") || isLocal;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-800">{source.name}</div>
          <a
            href={source.url.startsWith("http") ? source.url : `#${source.cacheKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate font-mono text-2xs text-accent hover:underline"
          >
            {source.url}
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ragInfo && (
            <span
              className="chip chip-info"
              title={`${ragInfo.chunks} chunks · ingested ${new Date(ragInfo.lastIngestedAt).toLocaleString()}`}
            >
              RAG · {ragInfo.chunks}c
            </span>
          )}
          {last && <ImportBadge last={last} />}
          <span className="chip chip-muted">{categoryLabel}</span>
          {canRag && isLocal && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRagIngest(source.cacheKey);
              }}
              disabled={ragBusy}
              className="btn-ghost text-xs disabled:opacity-40"
              title="Chunk + embed + add to RAG corpus"
            >
              {ragBusy ? "…" : ragInfo ? "↻ Re-ingest RAG" : "+ RAG"}
            </button>
          )}
          {canImport && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onImport(source.cacheKey);
              }}
              disabled={anyBusy || !fetchable}
              className="btn-ghost text-xs disabled:opacity-40"
              title={
                fetchable
                  ? isLocal
                    ? "Re-parse local file + classify + ingest"
                    : "Fetch + classify + ingest"
                  : "URL not directly fetchable"
              }
            >
              {busy ? "…" : "Import"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-1 text-xs text-ink-600 sm:grid-cols-2">
        <div>
          <span className="text-ink-400">coverage:</span> {source.coverage}
        </div>
        <div>
          <span className="text-ink-400">best use:</span> {source.bestUse}
        </div>
      </div>
    </div>
  );
}

interface ImportResultBadge {
  runner: string;
  rows: number;
  errors: number;
  skipped: boolean;
  bytes: number;
  ts: number;
  reason?: string;
  freshSkip?: boolean;
}

interface HydrateRec {
  runner: string | null;
  rows: number;
  errors: number;
  errorSample?: string[];
  skipped: boolean;
  bytes: number;
  reason?: string;
  ts: string;
}

function toBadge(rec: HydrateRec): ImportResultBadge {
  const freshSkip = (rec.errorSample ?? []).some(
    (e) => typeof e === "string" && e.startsWith("fresh:"),
  );
  return {
    runner: rec.runner ?? "none",
    rows: rec.rows,
    errors: rec.errors,
    skipped: rec.skipped,
    bytes: rec.bytes,
    ts: new Date(rec.ts).getTime(),
    reason: rec.reason ?? (rec.errorSample ?? [])[0],
    freshSkip,
  };
}

function ImportBadge({ last }: { last: ImportResultBadge }) {
  if (last.freshSkip) {
    return (
      <span className="chip chip-info" title={last.reason ?? "runner ran <24h ago — skipped"}>
        fresh
      </span>
    );
  }
  if (last.skipped || last.runner === "none") {
    return (
      <span
        className="chip chip-warn"
        title={`runner=${last.runner} · ${last.reason ?? "skipped"}`}
      >
        skipped
      </span>
    );
  }
  const cls = last.errors > 0 ? "chip-warn" : "chip-ok";
  const label = `${last.runner} · ${last.rows}r${last.errors ? ` · ${last.errors}!` : ""}`;
  return (
    <span
      className={`chip ${cls}`}
      title={`runner=${last.runner} · rows=${last.rows} · errors=${last.errors} · ${last.bytes}B · ${new Date(last.ts).toLocaleTimeString()}`}
    >
      {label}
    </span>
  );
}
