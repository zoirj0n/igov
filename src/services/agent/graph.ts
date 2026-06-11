/**
 * Agent runner — drives the specialist nodes as a supervisor graph and streams
 * a trace event per step for the live UI. The runner owns the trace (nodes
 * return data only), so the parallel Analyst‖Forecaster step is conflict-free.
 *
 * Besides the per-step start/done markers, the runner streams fine-grained
 * "notes" — real activity lines (the data source being queried, the local model
 * in play, the figures and scores as they resolve) — so the live tracker shows
 * genuine work, not a spinner. Every note is grounded in actual run artifacts.
 *
 * This is a deterministic, LangGraph-style supervisor: scope → research →
 * (analyse ‖ forecast) → opportunities → briefing. The node functions are
 * orchestrator-agnostic; a @langchain/langgraph StateGraph can drive the same
 * functions without changing them.
 */
import { COUNTRIES } from "@/lib/data/countries";
import { iso3Name } from "@/lib/data/iso-countries";
import { counterpartNode } from "@/services/agent/counterpart";
import { humanizeValue } from "@/services/agent/format";
import {
  composeArabicBriefing,
  composeEnglishBriefing,
  deepAnalystNode,
  forecasterNode,
  researcherNode,
  routerNode,
  strategistNode,
} from "@/services/agent/nodes";
import { type AgentState, type TraceStatus, emptyState } from "@/services/agent/state";
import { getLlmConfig, resolveProvider } from "@/services/llm";
import { type AgentRole, modelForRole } from "@/services/llm/roles";
import type { Classification } from "@/types";

export interface RunOptions {
  classification?: Classification;
  role?: string;
  counterpartName?: string;
}

export type RunEvent = {
  event: "trace" | "final" | "error";
  state: AgentState;
  message?: string;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Cadence between cascading result notes — paced so they visibly stream in. */
const NOTE_GAP = 220;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function countryName(iso3: string): string {
  return COUNTRIES.find((c) => c.iso3 === iso3)?.nameEn ?? iso3Name(iso3) ?? iso3;
}

/**
 * The model that will ACTUALLY serve a role under the active routing config —
 * cloud-resolved calls all use the configured cloud model; local-pinned calls
 * use the per-role Ollama tag. Trace labels must reflect reality.
 */
function effectiveModel(role: AgentRole, classification?: Classification): string {
  return resolveProvider(classification) === "local" ? modelForRole(role) : getLlmConfig().model;
}

function cloudResolved(classification?: Classification): boolean {
  return resolveProvider(classification) !== "local";
}

const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "bge-m3";

export async function* runAgent(
  command: string,
  opts: RunOptions = {},
): AsyncGenerator<RunEvent, void, unknown> {
  let s = emptyState(command);
  if (opts.classification) s = { ...s, classification: opts.classification };
  if (opts.role) s = { ...s, counterpartRole: opts.role };
  if (opts.counterpartName) s = { ...s, counterpartName: opts.counterpartName };
  const t0 = Date.now();

  const mark = (step: string, status: TraceStatus, detail?: string): RunEvent => {
    s = { ...s, trace: [...s.trace, { step, status, detail, atMs: Date.now() - t0 }] };
    return { event: "trace", state: s };
  };

  // A sub-step activity line for the step that is currently running.
  const note = (step: string, msg: string): RunEvent => {
    s = { ...s, trace: [...s.trace, { step, status: "start", note: msg, atMs: Date.now() - t0 }] };
    return { event: "trace", state: s };
  };

  try {
    // ── Scope ────────────────────────────────────────────────────────────
    yield mark("scope", "start");
    yield note("scope", `Parsing command · ${effectiveModel("router", s.classification)}`);
    s = { ...s, ...(await routerNode(s)) };
    if (!s.scope) {
      yield mark("scope", "error");
      yield {
        event: "error",
        state: s,
        message:
          "Couldn't identify a country in your request. Name a country and I'll pull live data — e.g. \"Prepare me for Morocco's energy minister\" or \"Brief me on Indonesia's trade ministry\".",
      };
      return;
    }
    const name = countryName(s.scope.iso3);
    yield note("scope", `Subject locked · ${name} (${s.scope.iso3})`);
    await sleep(NOTE_GAP);
    yield note("scope", `Focus · ${s.scope.sector} · ${s.scope.intent.replace("_", " ")}`);
    yield mark("scope", "done", s.scope.iso3);

    // ── Counterpart (parallel — researches the person while data streams) ──
    yield mark("counterpart", "start");
    yield note("counterpart", `Identifying ${name}'s counterpart · live search + Wikipedia`);
    const counterpartP = counterpartNode(s).catch(() => ({}) as Partial<AgentState>);

    // ── Research ─────────────────────────────────────────────────────────
    yield mark("research", "start");
    yield note("research", `Querying live sources · World Bank · IMF · EIA · ${name}`);
    s = { ...s, ...(await researcherNode(s)) };
    // Stream the headline figures as they land — real values, real years.
    for (const ind of s.indicators.slice(0, 4)) {
      await sleep(NOTE_GAP);
      yield note(
        "research",
        `↳ ${ind.label} · ${humanizeValue(ind.value, ind.unit)} (${ind.year})`,
      );
    }
    if (s.trade) {
      await sleep(NOTE_GAP);
      yield note(
        "research",
        `UN Comtrade · UAE↔${name} trade ${humanizeValue(s.trade.totalUsd, "USD")} (${s.trade.year})`,
      );
    }
    if (s.developments && s.developments.results.length > 0) {
      await sleep(NOTE_GAP);
      yield note(
        "research",
        `Live web research · ${plural(s.developments.results.length, "source")} (Tavily)`,
      );
    }
    await sleep(NOTE_GAP);
    yield note("research", `Embedding query · ${EMBED_MODEL}`);
    await sleep(NOTE_GAP);
    yield note(
      "research",
      `Hybrid retrieval (vector ∪ BM25) · ${plural(s.passages.length, "passage")}`,
    );
    yield mark(
      "research",
      "done",
      `${plural(s.indicators.length, "indicator")} · ${plural(s.passages.length, "passage")}`,
    );

    s = { ...s, ...(await counterpartP) };
    if (s.counterpart && s.counterpart.confidence !== "unconfirmed") {
      yield note("counterpart", `↳ ${s.counterpart.name} — ${s.counterpart.role}`);
      if (s.counterpart.citations.length > 0) {
        await sleep(NOTE_GAP);
        yield note(
          "counterpart",
          `↳ ${plural(s.counterpart.citations.length, "source")} cited · Wikipedia + live web`,
        );
      }
      yield mark("counterpart", "done", s.counterpart.name);
    } else {
      yield mark("counterpart", "done", "unconfirmed — verify before meeting");
    }

    // ── Analyse ‖ Forecast ───────────────────────────────────────────────
    yield mark("analyse", "start");
    const _cfg = getLlmConfig();
    const _analyseLabel =
      _cfg.provider === "local"
        ? `Deep research · LangGraph tool-loop (${process.env.OLLAMA_MODEL_TOOLS ?? "qwen2.5:7b"})`
        : `Executive analysis · ${_cfg.model} (${_cfg.provider})`;
    yield note("analyse", _analyseLabel);
    await sleep(120);
    yield note("analyse", "Forecaster · linear regression on GDP history");
    const [a, f] = await Promise.all([deepAnalystNode(s), forecasterNode(s)]);
    s = { ...s, ...a, ...f };
    // Surface the autonomous tool calls the research agent chose.
    for (const st of (s.researchSteps ?? []).slice(0, 4)) {
      yield note("analyse", `↳ tool · ${st.tool}(${st.input})`);
    }
    if (s.forecast) {
      yield note("analyse", `↳ ${s.forecast.read}`);
    }
    yield mark("analyse", "done", s.forecast ? "deep analysis + GDP forecast" : "deep analysis");

    // ── Opportunities ────────────────────────────────────────────────────
    yield mark("opportunities", "start");
    yield note(
      "opportunities",
      `Scoring UAE ↔ ${name} across sectors · ${effectiveModel("strategist", s.classification)}`,
    );
    s = { ...s, ...(await strategistNode(s)) };
    for (const o of s.opportunities) {
      await sleep(NOTE_GAP);
      yield note("opportunities", `↳ ${o.title} · score ${Math.round(o.score)}`);
    }
    yield mark("opportunities", "done", `${s.opportunities.length} ranked`);

    // ── Briefing (two phases, streamed so the long compose shows progress) ──
    yield mark("briefing", "start");
    yield note(
      "briefing",
      `Writing English brief · ${effectiveModel("scribe", s.classification)} · ${cloudResolved(s.classification) ? "~30s" : "this can take 1–2 min"}`,
    );
    // English brief: retry once on a transient local-model hiccup.
    let enBrief: Awaited<ReturnType<typeof composeEnglishBriefing>>["briefing"] | undefined;
    let prose: Awaited<ReturnType<typeof composeEnglishBriefing>>["prose"] | undefined;
    let proseSource: Awaited<ReturnType<typeof composeEnglishBriefing>>["source"] = "model";
    try {
      ({ briefing: enBrief, prose, source: proseSource } = await composeEnglishBriefing(s));
    } catch {
      yield note("briefing", "Compose hiccup — retrying once…");
      ({ briefing: enBrief, prose, source: proseSource } = await composeEnglishBriefing(s));
    }
    s = { ...s, briefing: enBrief };
    if (proseSource === "fallback")
      yield note("briefing", "⚠ Model output failed validation — using template fallback");
    // Arabic is a non-fatal enhancement: never let it sink the English brief.
    yield note(
      "briefing",
      `English brief delivered — Arabic translating in the background ${cloudResolved(s.classification) ? "(~30s)" : "(1–2 min)"}`,
    );
    try {
      if (prose) s = { ...s, briefingAr: await composeArabicBriefing(s, prose, proseSource) };
    } catch {
      yield note("briefing", "Arabic translation unavailable — delivering the English brief");
    }
    if (s.briefing) {
      yield note(
        "briefing",
        `↳ ${plural(s.briefing.talkingPoints.length, "talking point")} · ${plural(s.briefing.citations.length, "source")} cited`,
      );
    }
    yield mark("briefing", s.briefing ? "done" : "error");

    yield { event: "final", state: s };
  } catch (err) {
    yield { event: "error", state: s, message: err instanceof Error ? err.message : String(err) };
  }
}
