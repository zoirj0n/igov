"use client";

import { CommandCenter } from "@/components/experience/CommandCenter";
import { CountryPicker } from "@/components/experience/CountryPicker";
import { ExperienceBackdrop } from "@/components/experience/ExperienceBackdrop";
import { ExperienceHeader } from "@/components/experience/ExperienceHeader";
import { Landing, type RunChip } from "@/components/experience/Landing";
import { Theater } from "@/components/experience/Theater";
import { flagForIso3, iso3Name } from "@/lib/data/iso-countries";
import { hashFor, initialState, parseHash, reduce } from "@/lib/experience/machine";
import { ROLE_LABELS, commandFor, roleSelectionFrom } from "@/lib/experience/roles";
import { useAgentRun } from "@/lib/hooks/useAgentRun";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useReducer, useState } from "react";

interface RunRecordDto {
  id: string;
  title: string;
  iso3: string;
  role?: string;
  state: AgentState;
}

export function Experience() {
  const { locale, t } = useI18n();
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const [s, dispatch] = useReducer(reduce, initialState);
  const run = useAgentRun();
  const [recordState, setRecordState] = useState<AgentState | null>(null);
  const [recent, setRecent] = useState<RunChip[]>([]);
  const reduceMotion = useReducedMotion();
  const data = run.state ?? recordState;

  useEffect(() => {
    if (run.runId) dispatch({ type: "RUN_SAVED", runId: run.runId });
  }, [run.runId]);

  useEffect(() => {
    // The English brief is the usable deliverable — switch to the command
    // center the moment it streams in; Arabic keeps composing in the background
    // and BriefView's AR toggle activates when state.briefingAr lands.
    if (s.view.kind === "running" && (run.state?.briefing || run.final)) {
      dispatch({ type: "RUN_DONE" });
    }
  }, [run.state?.briefing, run.final, s.view.kind]);

  useEffect(() => {
    const h = hashFor(s);
    if (h && window.location.hash !== h) window.history.replaceState(null, "", h);
    else if (!h && window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, [s]);

  const hydrate = useCallback(async (hash: string) => {
    const parsed = parseHash(hash);
    if (!parsed) return;
    if (!/^run-[a-z0-9]+-[a-z0-9]+$/.test(parsed.runId)) return;
    try {
      const res = await fetch(`/api/agent/runs/${parsed.runId}`);
      if (!res.ok) return;
      const { run: rec } = (await res.json()) as { run: RunRecordDto };
      setRecordState(rec.state);
      dispatch({
        type: "HYDRATE_READY",
        runId: rec.id,
        focus: parsed.focus,
        country: {
          iso3: rec.iso3,
          name: iso3Name(rec.iso3) ?? rec.iso3,
          flag: flagForIso3(rec.iso3),
        },
        role: roleSelectionFrom(rec.role),
      });
    } catch {
      /* stay on landing */
    }
  }, []);

  useEffect(() => {
    if (window.location.hash) void hydrate(window.location.hash);
  }, [hydrate]);

  useEffect(() => {
    function onPop() {
      if (window.location.hash) void hydrate(window.location.hash);
      else {
        run.reset();
        setRecordState(null);
        dispatch({ type: "RESET" });
      }
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, [hydrate, run]);

  useEffect(() => {
    if (s.view.kind !== "landing") return;
    fetch("/api/agent/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((j: { runs: RunChip[] }) => setRecent(j.runs ?? []))
      .catch(() => setRecent([]));
  }, [s.view.kind]);

  const begin = useCallback(() => {
    if (!s.country) return;
    dispatch({ type: "BEGIN" });
    void run.start(commandFor(s.country.name, s.role), s.role.key, s.role.customName);
  }, [s.country, s.role, run]);

  /** beginFor — called from the ChatDock onAskPrepare handler where SELECT_COUNTRY
   *  has just been dispatched but the reducer hasn't re-rendered yet, so `s.country`
   *  still reflects the previous state. Build the command from the passed iso3 directly
   *  and mirror begin() exactly otherwise. */
  const beginFor = useCallback(
    (iso3: string) => {
      const name = iso3Name(iso3) ?? iso3;
      dispatch({ type: "BEGIN" });
      void run.start(commandFor(name, s.role), s.role.key, s.role.customName);
    },
    [s.role, run],
  );

  const onNew = useCallback(() => {
    window.history.pushState(null, "", window.location.pathname);
    run.reset();
    setRecordState(null);
    dispatch({ type: "RESET" });
  }, [run]);

  const onOpenRun = useCallback(
    (id: string) => {
      window.history.pushState(null, "", `#run=${id}`);
      void hydrate(`#run=${id}`);
    },
    [hydrate],
  );

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
      };

  const countryLabel = s.country
    ? `${s.country.flag} ${s.country.name} — ${ROLE_LABELS[s.role.key][lang]}`
    : "";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink-50 text-ink-900">
      <ExperienceBackdrop />
      <ExperienceHeader />

      <AnimatePresence mode="wait" initial={false}>
        {s.view.kind === "landing" && (
          <motion.div key="landing" {...fade}>
            <Landing
              country={s.country}
              role={s.role}
              busy={run.running}
              recent={recent}
              onOpenPicker={() => dispatch({ type: "OPEN_PICKER" })}
              onRole={(role) => dispatch({ type: "SET_ROLE", role })}
              onBegin={begin}
              onOpenRun={onOpenRun}
              onAskPrepare={(iso3) => {
                dispatch({
                  type: "SELECT_COUNTRY",
                  country: { iso3, name: iso3Name(iso3) ?? iso3, flag: flagForIso3(iso3) },
                });
                beginFor(iso3);
              }}
            />
          </motion.div>
        )}

        {s.view.kind === "running" && (
          <motion.div key="running" {...fade}>
            <Theater
              state={run.state}
              error={run.error}
              running={run.running}
              countryLabel={countryLabel}
              onRetry={begin}
              onBack={onNew}
            />
          </motion.div>
        )}

        {s.view.kind === "ready" && data && (
          <motion.div key="ready" {...fade}>
            <CommandCenter
              state={data}
              focus={s.view.focus}
              country={s.country}
              onFocus={(focus) => dispatch({ type: "SET_FOCUS", focus })}
              onNew={onNew}
            />
          </motion.div>
        )}

        {s.view.kind === "ready" && !data && (
          <motion.div key="ready-empty" {...fade} className="mx-auto w-full max-w-6xl px-6 pb-16">
            <div className="rounded-md border border-signal-risk/40 bg-signal-risk/5 p-4 text-sm text-signal-risk">
              <p>Unable to load this briefing.</p>
              <button
                type="button"
                onClick={onNew}
                className="mt-3 rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600"
              >
                ← {t.experience.back}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {s.pickerOpen && (
          <CountryPicker
            onClose={() => dispatch({ type: "CLOSE_PICKER" })}
            onSelect={(country) => dispatch({ type: "SELECT_COUNTRY", country })}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
