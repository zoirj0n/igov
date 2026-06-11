"use client";

import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";

interface ProviderInfo {
  name: "anthropic" | "openrouter" | "local";
  available: boolean;
  unavailableReason: string | null;
  defaultModel: string;
}

type ProviderName = "anthropic" | "openrouter" | "local";
type ClassKey = "public" | "internal" | "confidential" | "secret";

interface LlmConfigResp {
  current: {
    provider: ProviderName;
    model: string;
    changedAt: string;
    changedBy: string;
    classMap?: Partial<Record<ClassKey, ProviderName>>;
    offline?: boolean;
    offlineSetAt?: string;
    offlineSetBy?: string;
  };
  providers: ProviderInfo[];
}

const PROVIDER_META: Record<
  ProviderInfo["name"],
  { label: string; security: string; tone: string }
> = {
  anthropic: {
    label: "Anthropic (direct)",
    security: "Cloud · US-routed · 3rd-party processor",
    tone: "bg-amber-100 text-amber-800",
  },
  openrouter: {
    label: "OpenRouter",
    security: "Cloud · OpenRouter aggregator",
    tone: "bg-amber-100 text-amber-800",
  },
  local: {
    label: "Local LLM (Ollama)",
    security: "On-prem · air-gappable · no egress",
    tone: "bg-emerald-100 text-emerald-800",
  },
};

function OfflineToggle({ cfg, onChange }: { cfg: LlmConfigResp; onChange: () => void }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const offline = cfg.current.offline === true;

  async function toggle(next: boolean): Promise<void> {
    const verb = next ? "ENABLE" : "DISABLE";
    if (
      !window.confirm(
        `${verb} offline mode?\n\n` +
          (next
            ? "All CLOUD LLM calls (Anthropic, OpenRouter, Voyage, Cohere) will be REFUSED with 503. Only on-prem Ollama + mock fallbacks will work. Use for incident response, residency audits, or air-gap exercises."
            : "Cloud providers will be reachable again per current routing config."),
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offline: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({
        kind: next ? "warn" : "success",
        title: next ? "Offline mode ENABLED" : "Offline mode disabled",
        detail: next
          ? "Cloud LLM calls now refused. On-prem only."
          : "Cloud LLM calls re-enabled per routing config.",
      });
      onChange();
    } catch (e) {
      push({
        kind: "error",
        title: "Toggle failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`card border-2 p-5 ${offline ? "border-signal-risk bg-signal-risk/5" : "border-ink-150"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-xs px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${
                offline ? "bg-signal-risk text-white" : "bg-ink-100 text-ink-700"
              }`}
            >
              {offline ? "● OFFLINE" : "○ Online"}
            </span>
            <h2 className="section-title">Offline mode</h2>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs text-ink-600">
            Master kill-switch for ALL cloud LLM calls (chat, briefings, video, RAG embed + rerank).
            When enabled, requests routed to cloud return{" "}
            <code className="rounded-xs bg-ink-100 px-1 font-mono">503</code> with audit emission{" "}
            <code className="rounded-xs bg-ink-100 px-1 font-mono">llm.offline.blocked</code>.
            On-prem Ollama remains reachable. Useful for incident response, residency audits, or
            scheduled air-gap exercises.
          </p>
          {offline && cfg.current.offlineSetBy && cfg.current.offlineSetAt && (
            <p className="mt-1.5 font-mono text-2xs text-ink-500">
              flipped by {cfg.current.offlineSetBy} at{" "}
              {new Date(cfg.current.offlineSetAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggle(!offline)}
          disabled={busy}
          className={
            offline
              ? "btn-primary disabled:opacity-40"
              : "rounded-md bg-signal-risk px-3.5 py-2 text-sm font-medium text-white shadow-card transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {busy ? "…" : offline ? "Disable offline mode" : "ENABLE OFFLINE MODE"}
        </button>
      </div>
    </section>
  );
}

function ClassMapPanel({ cfg, onSaved }: { cfg: LlmConfigResp; onSaved: () => void }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<ClassKey, ProviderName | "">>>({
    public: cfg.current.classMap?.public ?? "",
    internal: cfg.current.classMap?.internal ?? "",
    confidential: cfg.current.classMap?.confidential ?? "",
    secret: cfg.current.classMap?.secret ?? "",
  });

  const CLASS_ORDER: ClassKey[] = ["public", "internal", "confidential", "secret"];
  const CLASS_META: Record<ClassKey, { label: string; risk: string; suggested: ProviderName }> = {
    public: { label: "Public", risk: "Cloud OK", suggested: "anthropic" },
    internal: { label: "Internal", risk: "Cloud OK (default)", suggested: "anthropic" },
    confidential: { label: "Confidential", risk: "Local strongly recommended", suggested: "local" },
    secret: { label: "Secret", risk: "Local required (gated server-side)", suggested: "local" },
  };

  async function save(): Promise<void> {
    const clean: Partial<Record<ClassKey, ProviderName>> = {};
    for (const k of CLASS_ORDER) {
      const v = draft[k];
      if (v === "anthropic" || v === "openrouter" || v === "local") clean[k] = v;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classMap: clean }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "Policy saved",
        detail: "Per-classification routing updated",
      });
      onSaved();
    } catch (e) {
      push({
        kind: "error",
        title: "Save failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Per-classification routing</h2>
          <p className="mt-1 text-xs text-ink-500">
            Override the global provider for specific classification tiers. Empty = use global
            default.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-primary text-xs disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save policy"}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CLASS_ORDER.map((k) => {
          const meta = CLASS_META[k];
          const v = draft[k] ?? "";
          const effective = v || cfg.current.provider;
          const isCloud = effective !== "local";
          const policyViolation = (k === "confidential" || k === "secret") && isCloud;
          return (
            <div key={k} className="rounded-md border border-ink-150 bg-ink-100 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink-800">{meta.label}</span>
                <span
                  className={`text-2xs ${policyViolation ? "text-signal-risk" : "text-ink-500"}`}
                >
                  {meta.risk}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={v}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [k]: e.target.value as ProviderName | "" }))
                  }
                  className="flex-1 rounded-md border border-ink-150 bg-ink-100 px-2 py-1 text-xs shadow-card focus:border-accent focus:outline-none"
                >
                  <option value="">(use global: {cfg.current.provider})</option>
                  <option value="local">local</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                </select>
                {v !== "" && v !== meta.suggested && (
                  <span className="text-2xs text-ink-500" title={`Suggested: ${meta.suggested}`}>
                    ≠ rec
                  </span>
                )}
              </div>
              {policyViolation && (
                <div className="mt-1.5 text-2xs text-signal-risk">
                  ⚠ Cloud routing — confidential+ requests will be blocked server-side
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LlmProviderPanel() {
  const { push } = useToast();
  const [cfg, setCfg] = useState<LlmConfigResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelInput, setModelInput] = useState("");
  const [selected, setSelected] = useState<ProviderInfo["name"] | null>(null);

  function load(): void {
    fetch("/api/admin/llm")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as LlmConfigResp;
      })
      .then((d) => {
        setCfg(d);
        setSelected(d.current.provider);
        setModelInput(d.current.model);
      })
      .catch((e) =>
        push({
          kind: "error",
          title: "Load failed",
          detail: e instanceof Error ? e.message : String(e),
        }),
      );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable in this component
  useEffect(load, []);

  async function apply(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: selected, model: modelInput.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "AI provider switched",
        detail: `${d.current.provider} · ${d.current.model}`,
      });
      load();
    } catch (e) {
      push({
        kind: "error",
        title: "Switch failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="card p-6 text-sm text-ink-500">Loading…</div>;

  const dirty =
    selected !== null &&
    (selected !== cfg.current.provider || modelInput.trim() !== cfg.current.model);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Current provider</h2>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-xs px-2 py-0.5 text-[11px] font-medium uppercase ${PROVIDER_META[cfg.current.provider].tone}`}
              >
                {PROVIDER_META[cfg.current.provider].label}
              </span>
              <span className="font-mono text-xs text-ink-600">{cfg.current.model}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {PROVIDER_META[cfg.current.provider].security}
            </p>
          </div>
          <div className="text-end text-2xs text-ink-400">
            <div>Changed by</div>
            <div className="font-mono text-ink-600">{cfg.current.changedBy}</div>
            <div className="font-mono">
              {cfg.current.changedAt === new Date(0).toISOString()
                ? "default"
                : new Date(cfg.current.changedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-signal-warn/30 bg-signal-warn/5 p-3 text-xs text-ink-700">
          <strong className="font-semibold">Security policy:</strong> Cloud providers cannot serve{" "}
          <code className="rounded-xs bg-ink-100 px-1">confidential</code> or{" "}
          <code className="rounded-xs bg-ink-100 px-1">secret</code> classifications. Switch to
          local LLM before requesting those tiers.
        </div>
      </section>

      <OfflineToggle cfg={cfg} onChange={load} />

      <ClassMapPanel cfg={cfg} onSaved={load} />

      <section className="card p-5">
        <h2 className="section-title">Switch provider</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {cfg.providers.map((p) => {
            const meta = PROVIDER_META[p.name];
            const isSelected = selected === p.name;
            const isCurrent = cfg.current.provider === p.name;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setSelected(p.name);
                  setModelInput(isCurrent ? cfg.current.model : p.defaultModel);
                }}
                className={`flex flex-col gap-1.5 rounded-md border p-3 text-start transition ${
                  isSelected
                    ? "border-accent bg-accent/5 shadow-pop"
                    : "border-ink-150 bg-ink-100 hover:border-ink-300 hover:shadow-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-800">{meta.label}</span>
                  <span
                    className={`rounded-xs px-1.5 py-0.5 text-[10px] font-medium uppercase ${meta.tone}`}
                  >
                    {p.name === "local" ? "safe" : "cloud"}
                  </span>
                </div>
                <div className="font-mono text-2xs text-ink-500">{p.defaultModel}</div>
                <div className="text-2xs text-ink-500">{meta.security}</div>
                {!p.available && (
                  <div className="mt-1 text-2xs text-signal-risk">⚠ {p.unavailableReason}</div>
                )}
                {isCurrent && (
                  <div className="mt-1 text-2xs font-medium uppercase text-signal-ok">● Active</div>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[280px]">
            <label
              htmlFor="llm-model"
              className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-500"
            >
              Model ID
            </label>
            <input
              id="llm-model"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder={
                selected ? cfg.providers.find((p) => p.name === selected)?.defaultModel : ""
              }
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 font-mono text-xs shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !dirty || !selected}
            className="btn-primary disabled:opacity-40"
          >
            {busy ? "Switching…" : dirty ? "Apply switch" : "No change"}
          </button>
        </div>
        {selected && !cfg.providers.find((p) => p.name === selected)?.available && (
          <div className="mt-3 rounded-md border border-signal-warn/30 bg-signal-warn/5 p-2.5 text-2xs text-ink-700">
            ⚠ <strong>{selected}</strong> is unavailable:{" "}
            {cfg.providers.find((p) => p.name === selected)?.unavailableReason}. Switch will still
            apply, but chats/briefings/videos will mock-fallback until the missing key is set in the
            environment.
          </div>
        )}
        <p className="mt-2 text-2xs text-ink-500">
          Switch is logged to audit log as{" "}
          <code className="rounded-xs bg-ink-100 px-1 font-mono">llm.config.switch</code> with
          before/after state and admin email.
        </p>
      </section>
    </div>
  );
}
