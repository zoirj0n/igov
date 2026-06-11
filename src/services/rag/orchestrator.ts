/**
 * Pipeline:
 *   understand → resolve → retrieve → rerank → generate → validate → answer
 *
 * Phase 0: minimal end-to-end runner with mocks where keys absent.
 *   - understand: simple regex intent + ISO3 extraction (real impl uses haiku later)
 *   - resolve: looks up COUNTRIES + live indicator store → verified_facts
 *   - retrieve: in-memory cosine topK over chunk store
 *   - rerank: keyword overlap (mock) or cohere/local if configured
 *   - generate: completeText with strict tag prompt
 *   - validate: citation + figure + abstention
 */

import type { AuthUser } from "@/lib/auth/types";
import { COUNTRIES } from "@/lib/data/countries";
import { indicatorsByCountry } from "@/lib/data/indicators";
import { liveByCountry } from "@/services/ingest/store";
import { completeText, getLlmConfig, getProvider } from "@/services/llm";
import { embed } from "@/services/llm/embed";
import { rerank } from "@/services/llm/rerank";
import type { Classification, Indicator } from "@/types";
import { hybridTopK } from "./hybrid";
import { hashQuestion, logRetrieval } from "./retrieval-log";
import { type InjectionFinding, type PiiRedaction, outputSafety, screenPassages } from "./safety";
import {
  type Passage,
  type VerifiedFact,
  shouldAbstain,
  validateCitations,
  validateFigures,
} from "./validators";

export type Intent = "factual" | "greeting" | "meta" | "smalltalk" | "help";

export interface Understanding {
  intent: Intent;
  entities: string[]; // ISO3 codes
  indicatorHints: string[]; // metric names mentioned
  years: number[];
  isNumeric: boolean;
  lang: "en" | "ar";
}

export interface RagResult {
  answer: string | null;
  abstained: boolean;
  abstainReasons?: string[];
  intent: Intent;
  citations: string[]; // chunk ids that survived validation
  facts: VerifiedFact[]; // facts surfaced to model
  passages: Passage[]; // top reranked passages
  violations: { kind: string; detail: string }[];
  safety: {
    injectionFindings: InjectionFinding[];
    redactions: PiiRedaction[];
    echoedInjection: boolean;
  };
  meta: {
    lang: "en" | "ar";
    entities: string[];
    topScore: number;
    providerTier: string;
    embedVendor: string;
    rerankVendor: string;
    durationMs: number;
  };
}

// ─── understand (heuristic for phase 0) ────────────────────────────────────

const GREET_RE = /^\s*(hi|hello|hey|salam|مرحبا|السلام|good (morning|afternoon|evening))\b/i;
const HELP_RE = /^\s*(help|what can you do|how do (i|you))\b/i;
const META_RE = /^\s*(who (made|built|are) you|what model|are you (an? )?ai)\b/i;
const SMALLTALK_RE = /^\s*(thanks|thank you|cool|nice|ok|okay)\s*\.?\s*$/i;

const ISO_BY_NAME = new Map<string, string>();
for (const c of COUNTRIES) {
  ISO_BY_NAME.set(c.iso3.toLowerCase(), c.iso3);
  ISO_BY_NAME.set(c.nameEn.toLowerCase(), c.iso3);
  if (c.nameAr) ISO_BY_NAME.set(c.nameAr, c.iso3);
}
const ALIAS_TO_ISO: Record<string, string> = {
  uae: "ARE",
  ksa: "SAU",
  uk: "GBR",
  us: "USA",
  germany: "DEU",
  france: "FRA",
  japan: "JPN",
  india: "IND",
  china: "CHN",
  korea: "KOR",
};

const METRIC_HINTS = [
  "gdp",
  "population",
  "renewables",
  "oil",
  "gas",
  "exports",
  "imports",
  "co2",
  "carbon",
  "fdi",
  "smart city",
  "logistics",
  "competitiveness",
];

// Per-provider model for the cheap "understand" step. Env-overridable.
// Default to undefined → completeText uses the global active model.
const UNDERSTAND_MODEL_BY_PROVIDER: Record<string, string | undefined> = {
  anthropic: process.env.UNDERSTAND_MODEL_ANTHROPIC ?? "claude-haiku-4-5",
  openrouter: process.env.UNDERSTAND_MODEL_OPENROUTER, // undefined → use global model (opus or whatever)
  local: process.env.UNDERSTAND_MODEL_LOCAL,
};

const understandCache = new Map<string, Understanding>();

/**
 * LLM-backed understanding. Falls back to regex `understand()` on any failure or
 * when no provider key configured. Cached per question + history (text-keyed).
 *
 * If priorTurns is provided, the recent user history is included so that
 * referential queries ("compare to 2026", "and Germany?") resolve entities
 * from the conversation context, not just the literal current question.
 */
export async function understandViaLlm(
  question: string,
  priorTurns: { role: "user" | "assistant"; content: string }[] = [],
): Promise<Understanding> {
  const cacheKey =
    priorTurns.length === 0
      ? question
      : `${priorTurns
          .slice(-4)
          .map((t) => `${t.role[0]}:${t.content}`)
          .join("|")}\n${question}`;
  const cached = understandCache.get(cacheKey);
  if (cached) return cached;

  const regexUnderstanding = understand(question);
  try {
    const cfg = getLlmConfig();
    const provider = getProvider();
    if (!provider.available()) return regexUnderstanding;

    const isoList = COUNTRIES.map((c) => c.iso3).join(",");
    const result = await completeText({
      classification: "internal",
      model: UNDERSTAND_MODEL_BY_PROVIDER[cfg.provider],
      maxTokens: 300,
      step: "understand",
      system: `You extract structured intent from a user question to a country-intelligence assistant. Reply STRICT JSON only.

Output shape:
{
  "intent": "factual" | "greeting" | "meta" | "smalltalk" | "help",
  "entities": ["ISO3", ...],
  "indicatorHints": ["snake_case", ...],
  "years": [int, ...],
  "isNumeric": boolean,
  "lang": "en" | "ar"
}

Rules:
- entities: ISO 3166-1 alpha-3 codes from this set: ${isoList}. Resolve "UAE"→ARE, "KSA"/"Saudi"→SAU, "UK"→GBR, "US"→USA. Empty array if none.
- indicatorHints: lowercase snake_case keywords like gdp, population, oil_production, renewables, exports, fdi, smart_city, logistics, competitiveness, co2.
- years: 1900-2100 integers if present.
- isNumeric: true if user asks for a specific number/quantity/comparison.
- intent: factual=question about country data; greeting=hello/hi; meta=who are you/what model; smalltalk=thanks/ok; help=what can you do.
- lang: "ar" if Arabic script present, else "en".

Reply with JSON only — no prose, no markdown fence.`,
      messages: buildUnderstandMessages(question, priorTurns),
    });

    const m = result.text.match(/\{[\s\S]*\}/);
    if (!m) return regexUnderstanding;
    const parsed = JSON.parse(m[0]) as Partial<Understanding>;
    const validIntents: Intent[] = ["factual", "greeting", "meta", "smalltalk", "help"];
    const merged: Understanding = {
      intent: validIntents.includes(parsed.intent as Intent)
        ? (parsed.intent as Intent)
        : regexUnderstanding.intent,
      entities: Array.isArray(parsed.entities)
        ? parsed.entities.filter(
            (e): e is string =>
              typeof e === "string" && /^[A-Z]{3}$/.test(e) && COUNTRIES.some((c) => c.iso3 === e),
          )
        : regexUnderstanding.entities,
      indicatorHints: Array.isArray(parsed.indicatorHints)
        ? parsed.indicatorHints.filter((h): h is string => typeof h === "string").slice(0, 8)
        : regexUnderstanding.indicatorHints,
      years: Array.isArray(parsed.years)
        ? parsed.years.filter((y): y is number => typeof y === "number" && y >= 1900 && y <= 2100)
        : regexUnderstanding.years,
      isNumeric:
        typeof parsed.isNumeric === "boolean" ? parsed.isNumeric : regexUnderstanding.isNumeric,
      lang: parsed.lang === "ar" ? "ar" : "en",
    };
    understandCache.set(cacheKey, merged);
    if (understandCache.size > 500) {
      const firstKey = understandCache.keys().next().value;
      if (firstKey !== undefined) understandCache.delete(firstKey);
    }
    return merged;
  } catch (err) {
    // Budget errors must propagate so the route returns 429 to the user.
    if (err instanceof Error && err.name === "BudgetExceededError") throw err;
    return regexUnderstanding;
  }
}

function buildUnderstandMessages(
  question: string,
  priorTurns: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  if (priorTurns.length === 0) {
    return [{ role: "user", content: question }];
  }
  // Slim history to last 4 turns, cap each at 800 chars.
  const recent = priorTurns.slice(-4).map((t) => ({
    role: t.role,
    content: t.content.length > 800 ? `${t.content.slice(0, 800)}…` : t.content,
  }));
  // Prepend a marker so the LLM treats prior turns as context, not as data.
  recent.push({
    role: "user",
    content: `[CURRENT QUESTION — resolve entities using the prior turns above for context]\n${question}`,
  });
  return recent;
}

export function understand(question: string): Understanding {
  const q = question.trim();
  const lang = /[؀-ۿ]/.test(q) ? "ar" : "en";
  let intent: Intent = "factual";
  if (GREET_RE.test(q)) intent = "greeting";
  else if (HELP_RE.test(q)) intent = "help";
  else if (META_RE.test(q)) intent = "meta";
  else if (SMALLTALK_RE.test(q)) intent = "smalltalk";

  const lower = q.toLowerCase();
  const entities = new Set<string>();
  for (const [alias, iso] of Object.entries(ALIAS_TO_ISO)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(q)) entities.add(iso);
  }
  for (const [name, iso] of ISO_BY_NAME.entries()) {
    if (name.length < 4) continue; // skip iso3 brute (false positives)
    if (lower.includes(name)) entities.add(iso);
  }
  const iso3Hits = q.match(/\b[A-Z]{3}\b/g);
  if (iso3Hits) {
    for (const code of iso3Hits) {
      if (COUNTRIES.some((c) => c.iso3 === code)) entities.add(code);
    }
  }

  const indicatorHints = METRIC_HINTS.filter((m) => lower.includes(m));
  const years = (q.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  const isNumeric =
    /\b(how (many|much)|what (is|are|was|were) the\b.*(gdp|population|growth|share|rank))/i.test(
      q,
    ) ||
    indicatorHints.length > 0 ||
    years.length > 0;

  return { intent, entities: [...entities], indicatorHints, years, isNumeric, lang };
}

// ─── resolve verified facts from live + seed indicator stores ──────────────

function indicatorToFact(iso3: string, ind: Indicator): VerifiedFact {
  return {
    id: `ind:${iso3}:${ind.metric}:${ind.year}`,
    value: ind.value,
    unit: ind.unit,
    year: ind.year,
    source: ind.source,
    valueType: Number.isInteger(ind.value) ? "int" : "float",
  };
}

export function resolveFacts(u: Understanding): VerifiedFact[] {
  const out: VerifiedFact[] = [];
  const seen = new Set<string>();
  for (const iso of u.entities) {
    const live = liveByCountry(iso);
    const seed = indicatorsByCountry(iso);
    const merged = [
      ...live,
      ...seed.filter((s) => !live.some((l) => l.metric === s.metric && l.year === s.year)),
    ];

    // Year matching: prefer requested years; if none match, fall back to latest available
    // year per metric so we surface SOMETHING instead of empty facts.
    const candidates = merged.filter((ind) => {
      const isHint =
        u.indicatorHints.length === 0 || u.indicatorHints.some((h) => ind.metric.includes(h));
      return isHint;
    });
    const requestedYearMatches =
      u.years.length === 0 ? candidates : candidates.filter((ind) => u.years.includes(ind.year));
    const picked =
      requestedYearMatches.length > 0 ? requestedYearMatches : latestPerMetric(candidates);

    for (const ind of picked) {
      const f = indicatorToFact(iso, ind);
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
  }
  return out.slice(0, 12); // cap per spec review
}

function latestPerMetric(rows: Indicator[]): Indicator[] {
  const byMetric = new Map<string, Indicator>();
  for (const r of rows) {
    const prior = byMetric.get(r.metric);
    if (!prior || r.year > prior.year) byMetric.set(r.metric, r);
  }
  return Array.from(byMetric.values());
}

// ─── prompt ────────────────────────────────────────────────────────────────

function buildSystemPrompt(lang: "en" | "ar"): string {
  return `You are an executive intelligence assistant. Answer ONLY from the provided context.

- State numbers ONLY from verified_facts, each wrapped in <fig id="THE_FACT_ID" unit="UNIT">…</fig>.
- Never write a number not backed by a verified_fact id.
- End every factual sentence with <cite id="CHUNK_ID"/> from passages.
- If context is insufficient, reply exactly: ABSTAIN — <one-line reason>.
- Respond in ${lang}. Register: concise, executive.`;
}

function buildChatPrompt(lang: "en" | "ar", intent: Intent): string {
  const persona =
    "You are the UAE Country Intelligence Platform assistant. Concise, executive register.";
  if (intent === "greeting") {
    return `${persona}\nThe user is greeting you. Reply with a short greeting (≤20 words) and offer to help with country-intelligence questions. Respond in ${lang}.`;
  }
  if (intent === "help") {
    return `${persona}\nDescribe what you can do (≤60 words): answer country indicator questions, generate briefings, compare countries, summarize sources. Always cite. Respond in ${lang}.`;
  }
  if (intent === "meta") {
    return `${persona}\nThe user asked about your identity or capabilities. Reply briefly (≤40 words) without revealing internal implementation. Respond in ${lang}.`;
  }
  return `${persona}\nAcknowledge briefly. Respond in ${lang}.`;
}

function buildUserPrompt(question: string, facts: VerifiedFact[], passages: Passage[]): string {
  // Lead with the available IDs so the model sees the allowed tag values
  // at the top — improves <fig>/<cite> tag compliance significantly.
  const factIds = facts.map((f) => f.id).join(", ") || "(none)";
  const passageIds = passages.map((p) => p.id).join(", ") || "(none)";
  return `Question: ${question}

ALLOWED <fig id="..."> values: [${factIds}]
ALLOWED <cite id="..."/> values: [${passageIds}]

verified_facts: ${JSON.stringify(facts)}

passages: ${JSON.stringify(passages.map((p) => ({ id: p.id, text: p.text, source: p.source })))}

Now answer the question. Wrap every number in <fig> with one of the allowed fact ids. End every factual sentence with <cite/> using one of the allowed passage ids. Sentences without a valid <cite/> will be removed.`;
}

// ─── orchestrate ───────────────────────────────────────────────────────────

export interface RagRequest {
  question: string;
  user: AuthUser;
  classification: Classification;
  sessionId?: string;
  reqId?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function runRag(req: RagRequest): Promise<RagResult> {
  const t0 = Date.now();
  const u = await understandViaLlm(req.question, req.history ?? []);

  // Intent gate: greetings/meta/smalltalk/help → answer directly, skip retrieval.
  if (u.intent !== "factual") {
    const result = await completeText({
      classification: req.classification,
      system: buildChatPrompt(u.lang, u.intent),
      messages: [{ role: "user", content: req.question }],
      maxTokens: 256,
      actor: req.user.email,
      sessionId: req.sessionId,
      reqId: req.reqId,
      step: "chat",
    });
    return {
      answer: result.text,
      abstained: false,
      intent: u.intent,
      citations: [],
      facts: [],
      passages: [],
      violations: [],
      safety: { injectionFindings: [], redactions: [], echoedInjection: false },
      meta: {
        lang: u.lang,
        entities: u.entities,
        topScore: 1,
        providerTier: result.provider,
        embedVendor: "skipped",
        rerankVendor: "skipped",
        durationMs: Date.now() - t0,
      },
    };
  }

  // Resolve facts from indicator store.
  const facts = resolveFacts(u);
  const factsById: Record<string, VerifiedFact> = Object.fromEntries(facts.map((f) => [f.id, f]));

  // Retrieve via in-memory vector search.
  const embedRes = await embed({
    texts: [req.question],
    classification: req.classification,
    actor: req.user.email,
    reqId: req.reqId,
    sessionId: req.sessionId,
  });
  const queryEmbedding = embedRes.vectors[0] ?? [];
  if (queryEmbedding.length === 0) {
    // Embed provider returned no vector for the query — degraded mode. Vector
    // search will produce no hits; hybrid falls through to pure BM25.
    console.warn(
      `[rag] empty queryEmbedding (vendor=${embedRes.vendor} provider=${embedRes.providerTier}); retrieval falling back to BM25-only`,
    );
  }
  const retrievedFilter: { iso3?: string; lang?: "en" | "ar" } = {};
  if (u.entities.length === 1) retrievedFilter.iso3 = u.entities[0];
  retrievedFilter.lang = u.lang;
  const retrieved = hybridTopK({
    query: req.question,
    queryEmbedding,
    k: 20,
    userClearance: req.user.clearance,
    filter: retrievedFilter,
  });

  // Rerank to top 8.
  const rerankRes =
    retrieved.length === 0
      ? {
          passages: [],
          vendor: "skipped" as const,
          providerTier: "local" as const,
          model: "skip",
          usedRealApi: false,
        }
      : await rerank({
          query: req.question,
          passages: retrieved.map((c) => ({ id: c.id, text: c.text })),
          topK: 8,
          classification: req.classification,
          actor: req.user.email,
          reqId: req.reqId,
          sessionId: req.sessionId,
        });

  // Map-based lookup so rerank passages never lose provenance even if the
  // rerank API returns ids not in the original retrieved set (defensive).
  const retrievedById = new Map(retrieved.map((c) => [c.id, c]));
  let passages: Passage[] = rerankRes.passages.map((p) => {
    const orig = retrievedById.get(p.id);
    return { id: p.id, text: p.text, source: orig?.source ?? "unknown", score: p.score };
  });

  // Safety: screen passages for prompt-injection markers (passages are data, never instructions).
  const screen = screenPassages(passages.map((p) => ({ id: p.id, text: p.text })));
  if (screen.flagged.length > 0) {
    const cleanIds = new Set(screen.cleanPassages.map((p) => p.id));
    passages = passages.filter((p) => cleanIds.has(p.id));
  }

  // Abstention check (factual only). Compute coverage from the post-screen
  // `passages` set — using pre-screen `retrieved` would over-count entities
  // that came in via passages we threw out for injection markers.
  const survivingIds = new Set(passages.map((p) => p.id));
  const coveredEntities = Array.from(
    new Set(
      retrieved
        .filter((c) => survivingIds.has(c.id))
        .map((c) => c.iso3)
        .filter(Boolean) as string[],
    ),
  );
  const abstain = shouldAbstain({
    intent: "factual",
    passages,
    questionEntities: u.entities,
    coveredEntities,
    isNumeric: u.isNumeric,
    hasMatchingFact: facts.length > 0,
  });
  if (abstain.abstained) {
    logRetrieval({
      actor: req.user.email,
      sessionId: req.sessionId,
      questionHash: hashQuestion(req.question),
      questionLength: req.question.length,
      intent: u.intent,
      lang: u.lang,
      entities: u.entities,
      classification: req.classification,
      passageIds: passages.map((p) => p.id),
      passageScores: passages.map((p) => p.score ?? 0),
      topScore: Math.max(0, ...passages.map((p) => p.score ?? 0)),
      factIds: facts.map((f) => f.id),
      abstained: true,
      abstainReasons: abstain.reasons,
      embedVendor: embedRes.vendor,
      rerankVendor: rerankRes.vendor,
      providerTier: rerankRes.providerTier,
      injectionFlagged: screen.flagged.length,
      durationMs: Date.now() - t0,
    });
    return {
      answer: null,
      abstained: true,
      abstainReasons: abstain.reasons,
      intent: u.intent,
      citations: [],
      facts,
      passages,
      violations: [],
      safety: { injectionFindings: screen.flagged, redactions: [], echoedInjection: false },
      meta: {
        lang: u.lang,
        entities: u.entities,
        topScore: Math.max(0, ...passages.map((p) => p.score ?? 0)),
        providerTier: rerankRes.providerTier,
        embedVendor: embedRes.vendor,
        rerankVendor: rerankRes.vendor,
        durationMs: Date.now() - t0,
      },
    };
  }

  // Generate.
  const genFirst = await completeText({
    classification: req.classification,
    system: buildSystemPrompt(u.lang),
    messages: [{ role: "user", content: buildUserPrompt(req.question, facts, passages) }],
    maxTokens: 1024,
    actor: req.user.email,
    sessionId: req.sessionId,
    reqId: req.reqId,
    step: "chat",
  });

  // Validate.
  let text = genFirst.text;
  let figRes = validateFigures(text, factsById);
  let citeRes = validateCitations(figRes.text, passages);
  // Preserve first-attempt violations for the returned RagResult — prior
  // implementation overwrote figRes/citeRes after retry, dropping the
  // original violations from telemetry. Tagged with `attempt` so callers
  // can distinguish "first try emitted bad fig" from "retry still failed".
  type AttemptViolation = { kind: string; detail: string; attempt: 1 | 2 };
  const firstAttemptViolations: AttemptViolation[] = [
    ...figRes.violations.map((v) => ({ kind: v.kind, detail: v.detail, attempt: 1 as const })),
    ...citeRes.violations.map((v) => ({ kind: v.kind, detail: v.detail, attempt: 1 as const })),
  ];
  let retryAttemptViolations: AttemptViolation[] = [];

  // Regenerate ONCE if there were violations.
  if (firstAttemptViolations.length > 0) {
    const feedback = `Your previous answer had ${firstAttemptViolations.length} validation violation(s): ${firstAttemptViolations.map((v) => v.kind).join(", ")}. Re-emit WITH STRICT TAG GRAMMAR. Every number wrapped in <fig id=... unit=...>…</fig> with id from verified_facts; every factual sentence ends with <cite id=...> from passages.`;
    const genRetry = await completeText({
      classification: req.classification,
      system: buildSystemPrompt(u.lang),
      messages: [
        { role: "user", content: buildUserPrompt(req.question, facts, passages) },
        { role: "assistant", content: genFirst.text },
        { role: "user", content: feedback },
      ],
      maxTokens: 1024,
      actor: req.user.email,
      sessionId: req.sessionId,
      reqId: req.reqId,
      step: "chat",
    });
    text = genRetry.text;
    figRes = validateFigures(text, factsById);
    citeRes = validateCitations(figRes.text, passages);
    retryAttemptViolations = [
      ...figRes.violations.map((v) => ({ kind: v.kind, detail: v.detail, attempt: 2 as const })),
      ...citeRes.violations.map((v) => ({ kind: v.kind, detail: v.detail, attempt: 2 as const })),
    ];
  }
  const allViolations = [...firstAttemptViolations, ...retryAttemptViolations];

  const validatedText = citeRes.text;
  const safetyOut = outputSafety(validatedText, req.classification);
  const finalText = safetyOut.text;
  const survivedCites = new Set<string>();
  // Detect ids ONLY when they appear in a <cite id=...> tag. Plain string
  // includes() falsely matched ids that were substrings of others (e.g. "p1"
  // inside "passage1") and could pick up incidental id-mentions in prose.
  for (const p of passages) {
    const tagRe = new RegExp(
      `<cite\\s+id\\s*=\\s*["']?${p.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*/?>`,
      "i",
    );
    if (tagRe.test(finalText)) survivedCites.add(p.id);
  }

  logRetrieval({
    actor: req.user.email,
    reqId: req.reqId,
    sessionId: req.sessionId,
    questionHash: hashQuestion(req.question),
    questionLength: req.question.length,
    intent: u.intent,
    lang: u.lang,
    entities: u.entities,
    classification: req.classification,
    passageIds: passages.map((p) => p.id),
    passageScores: passages.map((p) => p.score ?? 0),
    topScore: Math.max(0, ...passages.map((p) => p.score ?? 0)),
    factIds: facts.map((f) => f.id),
    abstained: false,
    embedVendor: embedRes.vendor,
    rerankVendor: rerankRes.vendor,
    providerTier: rerankRes.providerTier,
    injectionFlagged: screen.flagged.length,
    durationMs: Date.now() - t0,
  });
  return {
    answer: finalText,
    abstained: false,
    intent: u.intent,
    citations: [...survivedCites],
    facts,
    passages,
    violations: allViolations.map((v) => ({ kind: v.kind, detail: v.detail })),
    safety: {
      injectionFindings: screen.flagged,
      redactions: safetyOut.redactions,
      echoedInjection: safetyOut.echoedInjection,
    },
    meta: {
      lang: u.lang,
      entities: u.entities,
      topScore: Math.max(0, ...passages.map((p) => p.score ?? 0)),
      providerTier: rerankRes.providerTier,
      embedVendor: embedRes.vendor,
      rerankVendor: rerankRes.vendor,
      durationMs: Date.now() - t0,
    },
  };
}
