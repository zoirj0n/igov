"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useTheme } from "@/lib/hooks/useTheme";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

type Cls = "public" | "internal" | "confidential" | "secret";

interface ResolvedPref {
  value: Cls;
  source: "user" | "role" | "department" | "org";
  sourceLabel: string;
  clampedFromClearance: boolean;
}

interface PrefResp {
  resolved: ResolvedPref;
  override: { defaultClassification: Cls; updatedAt: string } | null;
  clearance: Cls;
  departmentId?: string;
  departmentSource?: "sso" | "admin" | null;
}

interface AuthMe {
  sub: string;
  email: string;
  name: string;
  role: string;
  clearance: Cls;
  departmentId?: string;
  departmentSource?: "sso" | "admin" | null;
}

const CLEARANCE_ORDER: Cls[] = ["public", "internal", "confidential", "secret"];
const CLEARANCE_RANK: Record<Cls, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

type ProviderName = "anthropic" | "openrouter" | "local";

interface LlmInfo {
  current: { provider: ProviderName; model: string; offline?: boolean };
  providers: {
    name: ProviderName;
    available: boolean;
    unavailableReason: string | null;
    defaultModel: string;
  }[];
}

export default function SettingsPage() {
  useDocumentTitle("Settings");
  const { t } = useI18n();
  const { push } = useToast();
  const [density, setDensity] = useState<"comfy" | "compact">("comfy");
  const { theme, setTheme } = useTheme();
  const [pref, setPref] = useState<PrefResp | null>(null);
  const [prefBusy, setPrefBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [llm, setLlm] = useState<LlmInfo | null>(null);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmModel, setLlmModel] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: AuthMe | null }) => setMe(d.user))
      .catch(() => {});
  }, []);

  function loadPref(): void {
    fetch("/api/user/preferences")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: PrefResp | null) => d && setPref(d))
      .catch(() => {});
  }

  useEffect(loadPref, []);

  useEffect(() => {
    fetch("/api/admin/llm")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: LlmInfo | null) => d && setLlm(d))
      .catch(() => {});
  }, []);

  async function resetProvider(): Promise<void> {
    setLlmBusy(true);
    try {
      const res = await fetch("/api/admin/llm", { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      setLlm((prev) => (prev ? { ...prev, current: d.current } : prev));
      push({
        kind: "info",
        title: t.settings.aiProviderResetDone,
        detail: `${t.settings.aiProviderNames[d.current.provider as ProviderName]} · ${d.current.model}`,
      });
    } catch (e) {
      push({
        kind: "error",
        title: t.settings.aiProviderSwitchFailed,
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLlmBusy(false);
    }
  }

  async function switchProvider(provider: ProviderName): Promise<void> {
    setLlmBusy(true);
    try {
      const res = await fetch("/api/admin/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model: llmModel.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      setLlm((prev) => (prev ? { ...prev, current: d.current } : prev));
      setLlmModel("");
      push({
        kind: "success",
        title: t.settings.aiProviderSwitched,
        detail: `${t.settings.aiProviderNames[provider]} · ${d.current.model}`,
      });
    } catch (e) {
      push({
        kind: "error",
        title: t.settings.aiProviderSwitchFailed,
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLlmBusy(false);
    }
  }

  async function setOverride(value: Cls): Promise<void> {
    setPrefBusy(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultClassification: value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      setPref(d as PrefResp);
      push({ kind: "success", title: "Default updated", detail: `New default: ${value}` });
    } catch (e) {
      push({
        kind: "error",
        title: "Update failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPrefBusy(false);
    }
  }

  async function clearOverride(): Promise<void> {
    setPrefBusy(true);
    try {
      const res = await fetch("/api/user/preferences", { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      setPref(d as PrefResp);
      push({
        kind: "info",
        title: "Reset to inherited",
        detail: `Resolved: ${(d as PrefResp).resolved.value}`,
      });
    } catch (e) {
      push({
        kind: "error",
        title: "Reset failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPrefBusy(false);
    }
  }

  function save(): void {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      push({
        kind: "success",
        title: "Settings saved",
        detail: "Preferences updated for this account",
      });
    }, 500);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
            {t.settings.title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">Account · preferences · API keys</p>
        </header>

        <section className="card mb-6 p-5">
          <h2 className="section-title mb-4">{t.settings.account}</h2>
          {me ? (
            <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
              <div className="text-ink-500">Name</div>
              <div className="text-ink-800">{me.name}</div>
              <div className="text-ink-500">Email</div>
              <div className="text-ink-800 font-mono text-xs">{me.email}</div>
              <div className="text-ink-500">Role</div>
              <div className="text-ink-800 capitalize">{me.role}</div>
              <div className="text-ink-500">Clearance</div>
              <div>
                <span className="rounded-xs bg-ink-100 px-2 py-0.5 text-xs font-medium uppercase text-ink-700">
                  {me.clearance}
                </span>
              </div>
              <div className="text-ink-500">Department</div>
              <div className="text-ink-800 font-mono text-xs">
                {me.departmentId ?? "—"}
                {me.departmentSource && (
                  <span className="ms-2 rounded-xs bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">
                    via {me.departmentSource}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="contents">
                  <div className="h-4 w-20 animate-pulse rounded-xs bg-ink-100" />
                  <div className="h-4 w-48 animate-pulse rounded-xs bg-ink-100" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card mb-6 p-5">
          <h2 className="section-title mb-4">{t.settings.preferences}</h2>

          <div className="mb-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-ink-500">
              {t.settings.density}
            </div>
            <div className="inline-flex w-full overflow-hidden rounded-md border border-ink-150 text-xs shadow-card">
              {(["comfy", "compact"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={
                    density === d
                      ? "flex-1 bg-accent px-3 py-1.5 text-white"
                      : "flex-1 px-3 py-1.5 text-ink-600"
                  }
                >
                  {d === "comfy" ? t.settings.densityComfy : t.settings.densityCompact}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-ink-500">
              {t.settings.theme}
            </div>
            <div className="inline-flex w-full overflow-hidden rounded-md border border-ink-150 text-xs shadow-card">
              {(["light", "dark"] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setTheme(th)}
                  className={
                    theme === th
                      ? "flex-1 bg-accent px-3 py-1.5 text-white"
                      : "flex-1 px-3 py-1.5 text-ink-600"
                  }
                >
                  {th === "light" ? t.settings.themeLight : t.settings.themeDark}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="set-class"
              className="mb-2 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.settings.classification}
            </label>
            {pref ? (
              <>
                <div className="mb-2 rounded-md border border-ink-150 bg-ink-50/60 p-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      Resolved:{" "}
                      <strong className="uppercase text-ink-800">{pref.resolved.value}</strong>{" "}
                      <span className="text-ink-500">(from {pref.resolved.sourceLabel})</span>
                    </span>
                    {pref.resolved.clampedFromClearance && (
                      <span className="rounded-xs bg-signal-warn/15 px-1.5 py-0.5 text-2xs text-signal-warn">
                        capped by clearance
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-2xs text-ink-400">
                    your clearance ceiling: {pref.clearance}
                    {pref.departmentId ? ` · dept: ${pref.departmentId}` : ""}
                    {pref.departmentSource ? ` (${pref.departmentSource})` : ""}
                  </div>
                </div>
                <select
                  id="set-class"
                  value={pref.override?.defaultClassification ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") void clearOverride();
                    else void setOverride(v as Cls);
                  }}
                  disabled={prefBusy}
                  className="w-full rounded-sm border border-ink-200 bg-ink-100 px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">(use inherited default: {pref.resolved.value})</option>
                  {CLEARANCE_ORDER.filter(
                    (c) => CLEARANCE_RANK[c] <= CLEARANCE_RANK[pref.clearance],
                  ).map((c) => (
                    <option key={c} value={c}>
                      {(t.common.classification as Record<string, string>)[c] ?? c} — override
                    </option>
                  ))}
                </select>
                {pref.override && (
                  <button
                    type="button"
                    onClick={clearOverride}
                    disabled={prefBusy}
                    className="mt-2 text-2xs text-accent hover:underline disabled:opacity-50"
                  >
                    Reset to inherited
                  </button>
                )}
              </>
            ) : (
              <div className="rounded-sm border border-ink-150 bg-ink-50 px-3 py-2 text-xs text-ink-500">
                Loading…
              </div>
            )}
          </div>
        </section>

        <section className="card mb-6 p-5">
          <h2 className="section-title mb-4">{t.settings.aiProvider}</h2>
          {llm ? (
            <>
              <div className="mb-3 flex items-center justify-between rounded-md border border-ink-150 bg-ink-50/60 px-3 py-2 text-sm">
                <span className="text-ink-500">{t.settings.aiProviderActive}</span>
                <span className="text-ink-800">
                  {t.settings.aiProviderNames[llm.current.provider]}
                  <span className="ms-2 font-mono text-xs text-ink-500">{llm.current.model}</span>
                </span>
              </div>
              <div className="space-y-2">
                {llm.providers.map((p) => {
                  const active = p.name === llm.current.provider;
                  const disabled = llmBusy || active || !p.available || me?.role !== "admin";
                  return (
                    <div
                      key={p.name}
                      className="flex items-center justify-between gap-3 rounded-sm border border-ink-100 bg-ink-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-ink-800">
                          {t.settings.aiProviderNames[p.name]}
                          {active && (
                            <span className="ms-2 rounded-xs bg-signal-ok/15 px-1.5 py-0.5 text-2xs text-signal-ok">
                              {t.settings.aiProviderActive}
                            </span>
                          )}
                          {!p.available && (
                            <span
                              className="ms-2 rounded-xs bg-signal-risk/15 px-1.5 py-0.5 text-2xs text-signal-risk"
                              title={p.unavailableReason ?? undefined}
                            >
                              {t.settings.aiProviderUnavailable}
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-2xs text-ink-400">
                          {p.defaultModel}
                        </div>
                      </div>
                      {me?.role === "admin" && !active && (
                        <button
                          type="button"
                          onClick={() => switchProvider(p.name)}
                          disabled={disabled}
                          className="shrink-0 rounded-sm border border-ink-200 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          {llmBusy ? t.shell.loading : t.settings.aiProviderApply}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {me?.role === "admin" ? (
                <div className="mt-3">
                  <label
                    htmlFor="set-llm-model"
                    className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
                  >
                    {t.settings.aiProviderModel}
                  </label>
                  <input
                    id="set-llm-model"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={t.settings.aiProviderModelHint}
                    className="w-full rounded-sm border border-ink-200 bg-ink-100 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={resetProvider}
                    disabled={llmBusy}
                    className="mt-2 text-2xs text-accent hover:underline disabled:opacity-50"
                  >
                    {t.settings.aiProviderReset}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-2xs text-ink-400">{t.settings.aiProviderAdminOnly}</p>
              )}
            </>
          ) : (
            <div className="rounded-sm border border-ink-150 bg-ink-50 px-3 py-2 text-xs text-ink-500">
              {t.shell.loading}
            </div>
          )}
        </section>

        <section className="card mb-6 p-5">
          <h2 className="section-title mb-4">{t.settings.api}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-sm border border-ink-100 bg-ink-50 px-3 py-2">
              <span className="font-mono text-xs">ANTHROPIC_API_KEY</span>
              <span className="rounded-xs bg-signal-ok/15 px-2 py-0.5 text-[11px] text-signal-ok">
                configured
              </span>
            </div>
            <div className="flex items-center justify-between rounded-sm border border-ink-100 bg-ink-50 px-3 py-2">
              <span className="font-mono text-xs">WORLDBANK_API</span>
              <span className="rounded-xs bg-signal-ok/15 px-2 py-0.5 text-[11px] text-signal-ok">
                no-key needed
              </span>
            </div>
            <div className="flex items-center justify-between rounded-sm border border-ink-100 bg-ink-50 px-3 py-2">
              <span className="font-mono text-xs">IEA_API_KEY</span>
              <span className="rounded-xs bg-signal-risk/15 px-2 py-0.5 text-[11px] text-signal-risk">
                missing
              </span>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-sm border border-ink-200 bg-ink-100 px-4 py-2 text-sm text-ink-700 hover:border-ink-400"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-sm bg-accent px-4 py-2 text-sm text-white hover:bg-accent-strong disabled:bg-ink-300"
          >
            {busy ? t.shell.loading : t.settings.save}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
