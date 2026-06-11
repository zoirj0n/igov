"use client";

import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";

type Cls = "public" | "internal" | "confidential" | "secret";
const CLS_ORDER: Cls[] = ["public", "internal", "confidential", "secret"];

interface ChunkRow {
  id: string;
  docId: string;
  source: string;
  iso3?: string;
  lang?: "en" | "ar";
  classification: Cls;
  addedAt: string;
  addedBy: string;
  embedModel: string;
  preview: string;
  chars: number;
  embeddingDims: number;
}

export function RagPanel() {
  const { push } = useToast();
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  // Text-ingest form state
  const [docId, setDocId] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [iso3, setIso3] = useState("");
  const [lang, setLang] = useState<"en" | "ar" | "">("");
  const [classification, setClassification] = useState<Cls>("internal");

  function load(): void {
    fetch("/api/admin/rag/chunks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { total?: number; chunks?: ChunkRow[] } | null) => {
        if (!d) return;
        setTotal(d.total ?? 0);
        setChunks(d.chunks ?? []);
      })
      .catch(() => {});
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable in this component
  useEffect(load, []);

  async function ingest(): Promise<void> {
    if (!docId.trim() || !text.trim() || !source.trim()) {
      push({ kind: "error", title: "Missing fields", detail: "docId + text + source required" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        kind: "text",
        docId: docId.trim(),
        text: text.trim(),
        source: source.trim(),
        classification,
      };
      if (iso3) body.iso3 = iso3.toUpperCase();
      if (lang) body.lang = lang;
      const res = await fetch("/api/admin/rag/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "Ingested",
        detail: `${d.chunks} chunks · ${d.embedded} embedded · ${d.embedVendor}/${d.embedModel} · ${d.durationMs}ms`,
      });
      setText("");
      load();
    } catch (e) {
      push({
        kind: "error",
        title: "Ingest failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string): Promise<void> {
    if (!confirm(`Delete chunk ${id}?`)) return;
    try {
      const res = await fetch(`/api/admin/rag/chunks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({ kind: "success", title: "Deleted", detail: id });
      load();
    } catch (e) {
      push({
        kind: "error",
        title: "Delete failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">RAG corpus</h2>
            <p className="mt-1 text-xs text-ink-500">
              Total chunks: <strong className="font-mono text-ink-800">{total}</strong>. Each chunk
              stores text + embedding + classification + iso3. Used by{" "}
              <code className="rounded-xs bg-ink-100 px-1 font-mono">/api/rag</code>.
            </p>
          </div>
          <button type="button" onClick={load} className="btn-ghost text-xs">
            ↻ Reload
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="section-title">Ingest text</h2>
        <p className="mt-1 text-xs text-ink-500">
          Chunks at ~500 tokens with 50-token overlap, embeds via active provider, stores in
          retrievable corpus.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
              Doc ID
            </label>
            <input
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="doc:wb:saudi-gdp-2024"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 font-mono text-xs shadow-card focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
              Source citation
            </label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="world_bank / imf / user-upload:xyz"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-xs shadow-card focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
              ISO3 (optional)
            </label>
            <input
              value={iso3}
              onChange={(e) => setIso3(e.target.value)}
              placeholder="SAU"
              maxLength={3}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 font-mono text-xs uppercase shadow-card focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
              Lang
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "en" | "ar" | "")}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-2 py-1.5 text-xs"
            >
              <option value="">(auto)</option>
              <option value="en">en</option>
              <option value="ar">ar</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
              Classification
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as Cls)}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-2 py-1.5 text-xs"
            >
              {CLS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500">
            Text body
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste source text here…"
            rows={8}
            className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-xs shadow-card focus:border-accent focus:outline-none"
          />
          <div className="mt-1 font-mono text-2xs text-ink-400">
            {text.length} chars ≈ {Math.ceil(text.length / 4)} tokens
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={ingest}
            disabled={busy}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {busy ? "Ingesting…" : "Ingest"}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3">
          <h2 className="section-title">Recent chunks ({chunks.length})</h2>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50/60">
            <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-start">ID</th>
              <th className="px-3 py-2 text-start">Source</th>
              <th className="px-3 py-2 text-start">ISO3</th>
              <th className="px-3 py-2 text-start">Class</th>
              <th className="px-3 py-2 text-start">Preview</th>
              <th className="px-3 py-2 text-end">Dims</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {chunks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-ink-400">
                  No chunks yet. Ingest text above.
                </td>
              </tr>
            )}
            {chunks.map((c) => (
              <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-150">
                <td className="px-3 py-2 font-mono text-2xs text-ink-500">{c.id}</td>
                <td className="px-3 py-2 text-xs text-ink-700">{c.source}</td>
                <td className="px-3 py-2 font-mono text-2xs text-ink-700">{c.iso3 ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-xs bg-ink-100 px-1.5 py-0.5 font-mono text-2xs text-ink-700">
                    {c.classification}
                  </span>
                </td>
                <td className="px-3 py-2 text-2xs text-ink-600 line-clamp-2">{c.preview}</td>
                <td className="px-3 py-2 text-end font-mono text-2xs text-ink-500">
                  {c.embeddingDims}
                </td>
                <td className="px-3 py-2 text-end">
                  <button
                    type="button"
                    onClick={() => del(c.id)}
                    className="btn-ghost text-2xs text-signal-risk"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
