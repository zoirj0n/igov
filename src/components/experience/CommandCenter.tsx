"use client";

import { Bento } from "@/components/experience/Bento";
import { BriefView } from "@/components/experience/BriefView";
import { CompareFocusView } from "@/components/experience/CompareFocusView";
import { CounterpartView } from "@/components/experience/CounterpartView";
import { ForecastView } from "@/components/experience/ForecastView";
import { OpportunitiesView } from "@/components/experience/OpportunitiesView";
import { ProfileView } from "@/components/experience/ProfileView";
import { SourcesView } from "@/components/experience/SourcesView";
import { TradeView } from "@/components/experience/TradeView";
import { initialsOf } from "@/components/experience/counterpart-utils";
import { type CountryChoice, FOCUS_VIEWS, type FocusView } from "@/lib/experience/machine";
import { useTablistKeys } from "@/lib/hooks/useTablistKeys";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { AnimatePresence, motion } from "motion/react";

export function CommandCenter({
  state,
  focus,
  country,
  onFocus,
  onNew,
}: {
  state: AgentState;
  focus: FocusView;
  country: CountryChoice | null;
  onFocus: (v: FocusView) => void;
  onNew: () => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience;
  const onTabKeys = useTablistKeys(FOCUS_VIEWS, focus, onFocus);
  const iso3 = country?.iso3 ?? state.scope?.iso3 ?? "";
  const cName = country?.name ?? iso3;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {country && (
          <span className="text-xl" aria-hidden>
            {country.flag}
          </span>
        )}
        <h1 className="truncate font-display text-xl font-semibold tracking-tight text-ink-900">
          {(locale === "ar"
            ? (state.briefingAr?.title ?? state.briefing?.title)
            : state.briefing?.title) ??
            country?.name ??
            ""}
        </h1>
        <span className="rounded-full border border-signal-ok/40 bg-signal-ok/10 px-2.5 py-0.5 text-2xs font-semibold text-signal-ok">
          ✓ {x.ready}
        </span>
        {state.counterpart?.name && (
          <button
            type="button"
            onClick={() => onFocus("counterpart")}
            className="flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-0.5 text-2xs text-ink-700 transition hover:border-tamm-cyan/50 hover:text-ink-900"
          >
            <span
              className="grid h-4 w-4 place-items-center rounded-full bg-accent/30 text-[9px] font-bold text-tamm-cyan"
              aria-hidden
            >
              {initialsOf(state.counterpart.name)}
            </span>
            {state.counterpart.name}
          </button>
        )}
        <button
          type="button"
          onClick={onNew}
          className="ms-auto rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-700 transition hover:border-tamm-cyan/50 hover:text-ink-900"
        >
          + {x.newBriefing}
        </button>
      </div>

      <div
        role="tablist"
        aria-label={x.focusLabel}
        onKeyDown={onTabKeys}
        className="mb-4 flex flex-wrap gap-2"
      >
        {FOCUS_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            data-tab={v}
            id={`tab-${v}`}
            aria-selected={focus === v}
            aria-controls={`panel-${v}`}
            tabIndex={focus === v ? 0 : -1}
            onClick={() => onFocus(v)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              focus === v
                ? "bg-accent text-ink-900"
                : "border border-ink-200 text-ink-600 hover:border-tamm-cyan/50 hover:text-ink-900"
            }`}
          >
            {x.focus[v]}
          </button>
        ))}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {focus === "overview" ? (
          <motion.div
            key="overview"
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Bento state={state} mode="ready" onFocus={onFocus} />
          </motion.div>
        ) : (
          <motion.section
            key={focus}
            role="tabpanel"
            id={`panel-${focus}`}
            aria-labelledby={`tab-${focus}`}
            layoutId={`tile-${focus}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-ink-200 bg-ink-100 p-5 shadow-card"
          >
            {focus === "brief" && <BriefView state={state} />}
            {focus === "counterpart" && <CounterpartView profile={state.counterpart} />}
            {focus === "opportunities" && <OpportunitiesView state={state} />}
            {focus === "trade" && <TradeView state={state} iso3={iso3} countryName={cName} />}
            {focus === "compare" && <CompareFocusView iso3={iso3} countryName={cName} />}
            {focus === "forecast" && <ForecastView state={state} iso3={iso3} />}
            {focus === "profile" && <ProfileView iso3={iso3} countryName={cName} />}
            {focus === "sources" && <SourcesView state={state} />}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
