import type { BilateralTrade } from "@/services/live/comtrade";
import type { WebResearch } from "@/services/live/tavily";
import type { Classification } from "@/types";
/**
 * Shared state for the strategic-advisor agent graph.
 *
 * One source of truth for every type the nodes, tools, scorer, API route, and
 * UI exchange. Each specialist node returns a Partial<AgentState> that the
 * runner merges; trace events stream to the live step tracker.
 */
import { z } from "zod";

export const ScopeSchema = z.object({
  iso3: z.string().regex(/^[A-Z]{3}$/),
  sector: z.enum(["energy", "infrastructure", "trade", "sustainability", "economy", "general"]),
  audience: z.string().min(2),
  intent: z.enum(["meeting_prep", "comparison", "opportunity", "general"]),
  classification: z.enum(["public", "internal", "confidential", "secret"]),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const OpportunitySchema = z.object({
  partnerIso3: z.string(),
  sector: z.string(),
  title: z.string(),
  score: z.number().min(0).max(100),
  rationale: z.string(),
  signals: z.record(z.number()),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export interface IndicatorPoint {
  code: string;
  label: string;
  value: number;
  unit: string;
  year: number;
  source: string;
}

export interface Passage {
  id: string;
  text: string;
  source: string;
}

export interface ForecastSummary {
  label: string;
  next: number;
  lowerBand: number;
  upperBand: number;
  read: string;
}

/** H/M/L confidence (ICD-203 analytic-confidence levels). */
export type Confidence = "H" | "M" | "L";

/** Calibrated likelihood bands (ICD-203 words of estimative probability). */
export const LIKELIHOOD_BANDS = [
  "very_unlikely",
  "unlikely",
  "even",
  "likely",
  "very_likely",
] as const;
export type Likelihood = (typeof LIKELIHOOD_BANDS)[number];

/** A bilateral cooperation opportunity, sized for the deal pipeline. */
export interface DealItem {
  title: string;
  rationale: string;
  score: number; // 0-100, the real opportunity score
  horizon: "near" | "mid" | "long";
  confidence: Confidence;
  evidence?: string; // real underlying signal figures (no fabricated $)
}

/** A risk framed probability × impact, with source confidence. */
export interface RiskItem {
  text: string;
  likelihood: Likelihood;
  impact: Confidence;
  confidence: Confidence;
}

/** A forward scenario with calibrated likelihood. */
export interface ScenarioItem {
  name: string;
  outlook: string;
  likelihood: string; // calibrated phrase
  confidence: Confidence;
}

export interface HeroMetric {
  label: string;
  value: string;
  delta?: string;
}

/** Who the meeting is with — researched by the counterpart agent. */
export interface CounterpartProfile {
  name: string;
  nameAr?: string;
  role: string;
  roleAr?: string;
  /** Proxied photo path (or upstream URL) — absent ⇒ initials avatar. */
  photoUrl?: string;
  photoAttribution?: string;
  summary: string;
  education?: string;
  career: { period: string; position: string; org: string }[];
  likelyToRaise: string[];
  statements: { text: string; url: string }[];
  citations: string[];
  /** ISO date the identification was made — officeholders change. */
  identifiedAsOf: string;
  confidence: "high" | "medium" | "unconfirmed";
}

/**
 * Executive briefing — decision-first (BLUF). Hard figures are cited; strategic
 * judgments (bluf, counterpart, position, scenarios) are LLM assessment grounded
 * in the supplied data and carry confidence. `overview` is retained for video
 * narration / back-compat.
 */
export interface Briefing {
  title: string;
  bluf: string;
  whyNow: string;
  heroMetric?: HeroMetric;
  counterpart: { objectives: string[]; likelyAsks: string[] };
  position: { offers: string[]; asks: string[]; redLines: string[] };
  deals: DealItem[];
  risks: RiskItem[];
  scenarios: ScenarioItem[];
  watchlist: string[];
  talkingPoints: string[];
  citations: string[];
  confidence: "high" | "med" | "low";
  overview: string;
  /** Where the prose came from: the scribe model, or the deterministic
   *  template used when the model's JSON fails validation. Surfaced in the
   *  UI so degraded output is never mistaken for model output. */
  proseSource?: "model" | "fallback";
}

/**
 * Shape the scribe LLM is asked to return (the prose half). The structured,
 * numeric half (deals/risks/confidence/heroMetric) is built in code from real
 * state — never by the model — so figures stay honest.
 */
const strList = z.array(z.string()).default([]);
// FLAT shape on purpose: the local model reliably fills top-level array fields
// but flakes on nested objects under `format:"json"`. We re-nest in code.
export const BriefingProseSchema = z.object({
  title: z.string().default(""),
  bluf: z.string().default(""),
  whyNow: z.string().default(""),
  overview: z.string().default(""),
  counterpartObjectives: strList,
  counterpartAsks: strList,
  offers: strList,
  asks: strList,
  redLines: strList,
  scenarios: z
    .array(
      z.object({
        name: z.string().default(""),
        outlook: z.string().default(""),
        likelihood: z.string().default("roughly even chance"),
      }),
    )
    .default([]),
  watchlist: strList,
  talkingPoints: strList,
  citations: strList,
});
export type BriefingProse = z.infer<typeof BriefingProseSchema>;

export interface Deliverables {
  onePagerPng?: string;
  slidesPath?: string;
  videoPath?: string;
}

export type TraceStatus = "start" | "done" | "error";

export interface TraceEvent {
  step: string;
  status: TraceStatus;
  detail?: string;
  /** Live sub-step activity message (data source, model, count) shown while the step runs. */
  note?: string;
  atMs: number;
}

export interface AgentState {
  command: string;
  scope?: Scope;
  indicators: IndicatorPoint[];
  passages: Passage[];
  analysis?: string;
  forecast?: ForecastSummary;
  gdpSeries?: { year: number; value: number }[];
  opportunities: Opportunity[];
  risks: string[];
  /** Real bilateral UAE↔partner trade (UN Comtrade), when available. */
  trade?: BilateralTrade;
  /** Live current developments (Tavily web/news), when available. */
  developments?: WebResearch;
  /** Tool calls the LangGraph deep-research agent made (for the live trace). */
  researchSteps?: { tool: string; input: string }[];
  /** Inputs from the landing composer (role key or custom counterpart name). */
  counterpartRole?: string;
  counterpartName?: string;
  /** The person dossier researched by the counterpart agent. */
  counterpart?: CounterpartProfile;
  briefing?: Briefing;
  briefingAr?: Briefing;
  deliverables: Deliverables;
  trace: TraceEvent[];
  classification: Classification;
}

export function emptyState(command: string): AgentState {
  return {
    command,
    indicators: [],
    passages: [],
    opportunities: [],
    risks: [],
    deliverables: {},
    trace: [],
    classification: "internal",
  };
}
