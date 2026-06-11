/**
 * Specialist agent nodes. Each is an `async (state) => Partial<AgentState>` that
 * calls the existing `completeText` (preserving telemetry/offline/budget gates)
 * with a per-role local model, and validates structured output with Zod.
 *
 * Router → Researcher → (Analyst ‖ Forecaster) → Strategist → Scribe.
 */
import { COUNTRIES } from "@/lib/data/countries";
import { readSeedHistory } from "@/lib/data/indicator-codes";
import { isValidIso3, iso3Name, resolveCountryFromText } from "@/lib/data/iso-countries";
import {
  type Lang,
  confidenceTag,
  dealItems,
  defaultCitations,
  deriveConfidence,
  gdpTrend,
  heroMetric,
  riskItems,
} from "@/services/agent/briefing";
import { factLine, humanizeValue } from "@/services/agent/format";
import { scoreOpportunities } from "@/services/agent/opportunity";
import { deepResearch } from "@/services/agent/research-agent";
import {
  type AgentState,
  type Briefing,
  type BriefingProse,
  BriefingProseSchema,
  type Scope,
  ScopeSchema,
} from "@/services/agent/state";
import { fetchIndicators } from "@/services/agent/tools/data";
import { forecastTool } from "@/services/agent/tools/forecastTool";
import { retrievePassages } from "@/services/agent/tools/retrieve";
import { bilateralTrade } from "@/services/live/comtrade";
import { webResearch } from "@/services/live/tavily";
import { completeText } from "@/services/llm";
import { getLlmConfig } from "@/services/llm/config";
import { modelForRole } from "@/services/llm/roles";
import { fetchHistorical } from "@/services/predict/historical";

export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : text;
  if (!candidate) return null;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const arrStart = candidate.indexOf("[");
  const arrEnd = candidate.lastIndexOf("]");
  // Prefer object; fall back to array.
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      /* try array */
    }
  }
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      return JSON.parse(candidate.slice(arrStart, arrEnd + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/** Pure: parse a Router model response into a validated Scope (or null). */
export function parseScope(raw: string): Scope | null {
  const j = extractJson(raw);
  if (!j) return null;
  const r = ScopeSchema.safeParse(j);
  return r.success ? r.data : null;
}

const ACTOR = "agent";

function countryName(iso3: string): string {
  // Seed catalog (curated) → comprehensive ISO list → raw code.
  return COUNTRIES.find((c) => c.iso3 === iso3)?.nameEn ?? iso3Name(iso3) ?? iso3;
}

// Any real ISO3 is briefable now — live data (WB/IMF/EIA/Comtrade/web) is not
// limited to the seeded twelve.
const knownIso3 = (iso?: string): boolean => isValidIso3(iso);

/** Deterministic country resolution from the command — more reliable than a 3B model. */
function resolveIso3FromCommand(command: string): string | undefined {
  // Arabic names of the curated twelve first (covers Arabic commands for them).
  const ar = COUNTRIES.find((c) => c.nameAr && command.includes(c.nameAr));
  if (ar) return ar.iso3;
  // Then any country worldwide by ISO3 token, alias, or English name.
  return resolveCountryFromText(command);
}

function inferSector(command: string): Scope["sector"] {
  const lc = command.toLowerCase();
  if (/hydrogen|energy|solar|renewable|nuclear|oil|gas|power|electric/.test(lc)) return "energy";
  if (/logistic|port|trade|cepa|export|import|tariff/.test(lc)) return "trade";
  if (/infrastructure|digital|telecom|road|rail|smart.?city/.test(lc)) return "infrastructure";
  if (/sustainab|climate|carbon|green|emission|esg/.test(lc)) return "sustainability";
  if (/econom|gdp|invest|fdi|fiscal/.test(lc)) return "economy";
  return "general";
}

export async function routerNode(s: AgentState): Promise<Partial<AgentState>> {
  let llm: Scope | null = null;
  try {
    const res = await completeText({
      system:
        "You scope an executive-briefing request for UAE government leadership. Return STRICT JSON only, no prose.",
      messages: [
        {
          role: "user",
          content: `Command: "${s.command}".\nReturn {"iso3":<ISO3 uppercase>,"sector":"energy|infrastructure|trade|sustainability|economy|general","audience":<string>,"intent":"meeting_prep|comparison|opportunity|general","classification":"public|internal|confidential|secret"}`,
        },
      ],
      model: modelForRole("router"),
      step: "understand",
      maxTokens: 200,
      json: true,
      actor: ACTOR,
      classification: s.classification,
    });
    llm = parseScope(res.text);
  } catch {
    llm = null;
  }

  // The country is resolved deterministically from the command first (robust),
  // falling back to the model's guess only if no known name/ISO is present.
  const iso3 = resolveIso3FromCommand(s.command) ?? (knownIso3(llm?.iso3) ? llm?.iso3 : undefined);
  if (!iso3) return {}; // caller emits "could not determine which country"

  const scope: Scope = {
    iso3,
    sector: llm?.sector ?? inferSector(s.command),
    audience: llm?.audience ?? "UAE leadership",
    intent: llm?.intent ?? "meeting_prep",
    classification: llm?.classification ?? s.classification,
  };
  return { scope };
}

export async function researcherNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  const name = countryName(scope.iso3);
  const [indicators, passages, trade, developments] = await Promise.all([
    fetchIndicators(scope.iso3),
    retrievePassages(`${scope.iso3} ${scope.sector} economy energy infrastructure trade`, {
      k: 6,
      iso3: scope.iso3,
      clearance: scope.classification,
    }),
    // Real bilateral trade (UN Comtrade) + live developments (Tavily web/news).
    bilateralTrade(scope.iso3).catch(() => null),
    webResearch(`UAE ${name} ${scope.sector} cooperation latest developments 2026`, {
      news: true,
      maxResults: 4,
    }).catch(() => null),
  ]);
  return {
    indicators,
    passages,
    trade: trade ?? undefined,
    developments: developments ?? undefined,
  };
}

export async function analystNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  const name = countryName(scope.iso3);
  const facts = s.indicators.map(factLine).join("\n");
  const ctx = s.passages
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, 4000);
  const res = await completeText({
    system:
      "You are a UAE government strategy analyst. The subject country is the one named below. Use ONLY the supplied facts and context — never invent or rescale numbers. Be concise (<=120 words), executive register, no preamble.",
    messages: [
      {
        role: "user",
        content: `SUBJECT COUNTRY: ${name}\nSECTOR: ${scope.sector}\n\nFACTS:\n${facts || "(none)"}\n\nCONTEXT:\n${ctx || "(none)"}\n\nWrite an executive read of ${name}'s ${scope.sector} sector for UAE leadership.`,
      },
    ],
    model: modelForRole("analyst"),
    step: "complete",
    maxTokens: 400,
    actor: ACTOR,
    classification: s.classification,
  });
  return { analysis: res.text.trim() };
}

/**
 * Deep analyst — runs the LangGraph tool-loop (qwen2.5 autonomously calls live
 * tools, then synthesizes a cited analysis). Falls back to the deterministic
 * `analystNode` if the tool-loop yields nothing (e.g. model lacks tool support).
 */
export async function deepAnalystNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  // deepResearch is hardwired to Ollama (ChatOllama tool-loop). Skip it on
  // cloud providers — without Ollama running this would always throw, waste a
  // localhost:11434 probe, and silently fall back to the simpler analyst.
  if (getLlmConfig().provider !== "local") return analystNode(s);
  try {
    const r = await deepResearch(countryName(scope.iso3), scope.iso3, scope.sector);
    if (r.text.trim()) return { analysis: r.text.trim(), researchSteps: r.steps };
  } catch {
    /* fall through to the deterministic analyst */
  }
  return analystNode(s);
}

export async function forecasterNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  let series = readSeedHistory(scope.iso3).gdp ?? [];
  if (series.length < 3) {
    try {
      series = (await fetchHistorical(scope.iso3, "gdp_usd_nominal")).map((p) => ({
        year: p.year,
        value: p.value,
      }));
    } catch {
      series = [];
    }
  }
  if (series.length < 3) return {};
  const forecast = forecastTool({ label: "GDP", series });
  forecast.read = `GDP projected to ${humanizeValue(forecast.next, "USD")} next year (range ${humanizeValue(forecast.lowerBand, "USD")}–${humanizeValue(forecast.upperBand, "USD")}).`;
  return { forecast, gdpSeries: series.slice(-12) };
}

export async function strategistNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  const uae = await fetchIndicators("ARE");
  const ranked = scoreOpportunities(uae, s.indicators, scope.iso3).slice(0, 3);

  const res = await completeText({
    system:
      'For each opportunity, write ONE executive sentence grounded in its numeric signals. Return STRICT JSON array of {"sector":string,"rationale":string}.',
    messages: [{ role: "user", content: JSON.stringify(ranked) }],
    model: modelForRole("strategist"),
    step: "complete",
    maxTokens: 500,
    actor: ACTOR,
    classification: s.classification,
  });
  const prose = (extractJson(res.text) as { sector: string; rationale: string }[] | null) ?? [];
  const opportunities = ranked.map((o) => ({
    ...o,
    rationale: prose.find((x) => x.sector === o.sector)?.rationale ?? o.title,
  }));

  const risks: string[] = [];
  if (s.indicators.length < 5)
    risks.push("Sparse indicator coverage — verify figures before commitments.");
  if (!s.forecast) risks.push("No reliable GDP trend available for this country.");

  return { opportunities, risks };
}

/**
 * Compose the prose half of the briefing in one language. The LLM writes only
 * narrative/strategic fields; numbers are injected later (see scribeNode) so
 * figures never depend on the model. gemma4 handles both EN and AR (MSA).
 */
async function composeProse(
  s: AgentState,
  lang: Lang,
): Promise<{ prose: BriefingProse; source: "model" | "fallback" }> {
  const scope = s.scope as Scope;
  const name = countryName(scope.iso3);
  const facts = s.indicators.map(factLine).join("\n");
  const opps = s.opportunities
    .map(
      (o) =>
        `- ${o.title} (score ${Math.round(o.score)}/100)${o.rationale ? `: ${o.rationale}` : ""}`,
    )
    .join("\n");
  const ctx = s.passages
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, 1500);
  const band = s.forecast
    ? ` (band ${humanizeValue(s.forecast.lowerBand, "USD")}–${humanizeValue(s.forecast.upperBand, "USD")})`
    : "";
  const tradeLine = s.trade
    ? `UAE↔${name} total ${humanizeValue(s.trade.totalUsd, "USD")} in ${s.trade.year} (UAE exports ${humanizeValue(s.trade.exportsUsd, "USD")}, imports ${humanizeValue(s.trade.importsUsd, "USD")}; UN Comtrade)`
    : "(not available)";
  const devLines =
    s.developments && s.developments.results.length > 0
      ? `${s.developments.answer ? `${s.developments.answer}\n` : ""}${s.developments.results
          .slice(0, 4)
          .map((r) => `- ${r.title}`)
          .join("\n")}`
      : "(none)";
  const langRule =
    lang === "ar"
      ? "Write EVERY string value in Arabic (Modern Standard Arabic), formal executive register. Keep numbers, %, currency and proper nouns (Masdar, OPEC, country names) in their original Latin/numeric form."
      : "Write every string in English, formal executive register.";

  const res = await completeText({
    system: `You are chief of staff to the UAE Minister of Energy, writing a DECISION-FIRST (BLUF) executive briefing for a bilateral meeting ABOUT ${name}. The subject is ${name}, not the UAE.
RULES:
- Lead with ONE clear recommendation; no hedging.
- Use ONLY the supplied figures; never invent specific numbers, deals, dates or events not in the data.
- Strategic judgments (counterpart aims, our position, scenarios) are ASSESSMENT inferred from the supplied indicators — phrase as inference, not established fact.
- Calibrate likelihood with ICD-203 words only: almost no chance, very unlikely, unlikely, roughly even chance, likely, very likely, almost certain.
- Ground the relationship and any deal sizing in BILATERAL TRADE; you MAY reference CURRENT DEVELOPMENTS as recent web context (mark confidence). Still never fabricate figures beyond those supplied.
- Be terse — a minister reads this in under two minutes.
- If MEETING COUNTERPART names a person, address counterpartObjectives/counterpartAsks to that person by name where natural.
- ${langRule}
Return STRICT JSON ONLY, no prose outside it, with ALL of these keys filled:
{"title":str,"bluf":str,"whyNow":str,"overview":str,"counterpartObjectives":[str],"counterpartAsks":[str],"offers":[str],"asks":[str],"redLines":[str],"scenarios":[{"name":str,"outlook":str,"likelihood":str}],"watchlist":[str],"talkingPoints":[str],"citations":[str]}`,
    messages: [
      {
        role: "user",
        content: `SUBJECT: ${name} · SECTOR: ${scope.sector} · AUDIENCE: ${scope.audience} · INTENT: ${scope.intent}
MEETING COUNTERPART: ${s.counterpart?.name ? `${s.counterpart.name} — ${s.counterpart.role}` : "(not identified)"}

VERIFIED FIGURES (cite as (Source, Year)):
${facts || "(none)"}

GDP TREND: ${gdpTrend(s) || "(n/a)"}
FORECAST: ${s.forecast?.read ?? "(none)"}${band}

ANALYSIS:
${s.analysis ?? "(none)"}

COOPERATION OPPORTUNITIES (UAE ↔ ${name}):
${opps || "(none)"}

BILATERAL TRADE (UN Comtrade): ${tradeLine}

CURRENT DEVELOPMENTS (live web · Tavily — recent signals; reference as web context, mark confidence):
${devLines}

EVIDENCE EXCERPTS:
${ctx || "(none)"}

Produce (every field non-empty):
- bluf: the recommendation in ONE sentence, leading with the action the Minister should take.
- whyNow: one line on why this matters now.
- overview: <=55 words.
- counterpartObjectives: 3 — what ${name} most wants from energy cooperation (inferred from its indicators).
- counterpartAsks: 2-3 — what they will likely ask of the UAE.
- offers: 2-3 — what the UAE brings.
- asks: 2-3 — what the UAE should seek in return.
- redLines: 1-2 — what not to concede.
- scenarios: exactly 2 (a base case and an alternative), each {name, outlook (one line), likelihood (ICD-203 word)}.
- watchlist: 3-4 leading indicators to monitor.
- talkingPoints: 4 minister-ready lines; the LAST one states the explicit ask.
- citations: the sources you relied on.`,
      },
    ],
    model: modelForRole("scribe"),
    step: "briefing",
    // Generous cap: Arabic JSON is token-heavy and was truncating mid-object.
    maxTokens: 2200,
    json: true,
    actor: ACTOR,
    classification: s.classification,
  });

  const r = BriefingProseSchema.safeParse(extractJson(res.text));
  if (r.success && r.data.bluf) return { prose: r.data, source: "model" };
  // Graceful fallback (still decision-shaped) if the model returns bad JSON.
  // Marked as such so the UI can flag degraded output instead of passing it
  // off as model prose.
  console.warn(
    `[scribe] briefing prose fell back to template (lang=${lang}, iso3=${scope.iso3}): model JSON failed validation`,
  );
  const top = s.opportunities[0];
  const fbBluf = top
    ? `Prioritise ${top.title} with ${name} — its strongest near-term opening (opportunity score ${Math.round(top.score)}/100).`
    : `Engage ${name} on ${scope.sector} cooperation, grounded in the verified indicators.`;
  return {
    prose: BriefingProseSchema.parse({
      title: `Executive Brief — ${name}`,
      bluf: fbBluf,
      whyNow: s.forecast?.read ?? "",
      overview: s.analysis ?? "",
      talkingPoints: s.opportunities.slice(0, 3).map((o) => o.title),
    }),
    source: "fallback",
  };
}

/**
 * Arabic prose by TRANSLATING the (working) English JSON — not regenerating.
 * gemma4 derails when emitting Arabic under the `format:"json"` grammar
 * constraint (premature stop, malformed strings), but translates EN→AR JSON
 * reliably in free-form. Falls back to the English prose if translation fails.
 */
async function translateProse(en: BriefingProse, s: AgentState): Promise<BriefingProse> {
  // Up to two attempts: the local model occasionally echoes the English JSON
  // unchanged or returns malformed output. Detect the echo (bluf identical) and
  // retry; fall back to the English prose only if both attempts fail.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await completeText({
      system:
        "You are a professional EN→AR translator for UAE government briefings. Translate EVERY string VALUE of the given JSON into formal Modern Standard Arabic — do NOT leave any English text. Keep the JSON keys/structure identical and keep numbers, %, currency and proper nouns (Masdar, OPEC, country names) unchanged. Return ONLY the translated JSON.",
      messages: [{ role: "user", content: JSON.stringify(en) }],
      model: modelForRole("scribe"),
      step: "briefing",
      maxTokens: 3200,
      actor: ACTOR,
      classification: s.classification,
    });
    const r = BriefingProseSchema.safeParse(extractJson(res.text));
    if (r.success && r.data.bluf && r.data.bluf !== en.bluf) return r.data;
  }
  return en;
}

/** Assemble a full Briefing from LLM prose + the deterministic structured half. */
function assembleBriefing(
  s: AgentState,
  p: BriefingProse,
  lang: Lang,
  proseSource: "model" | "fallback",
): Briefing {
  const confidence = deriveConfidence(s);
  return {
    title: p.title,
    bluf: p.bluf,
    whyNow: p.whyNow,
    heroMetric: heroMetric(s, lang),
    counterpart: { objectives: p.counterpartObjectives, likelyAsks: p.counterpartAsks },
    position: { offers: p.offers, asks: p.asks, redLines: p.redLines },
    deals: dealItems(s, lang),
    risks: riskItems(s, lang),
    scenarios: p.scenarios.map((sc) => ({ ...sc, confidence: confidenceTag(confidence) })),
    watchlist: p.watchlist,
    talkingPoints: p.talkingPoints,
    citations: defaultCitations(s),
    confidence,
    overview: p.overview,
    proseSource,
  };
}

/** Phase 1: generate the English briefing; also returns the prose for translation. */
export async function composeEnglishBriefing(
  s: AgentState,
): Promise<{ briefing: Briefing; prose: BriefingProse; source: "model" | "fallback" }> {
  const { prose: en, source } = await composeProse(s, "en");
  return { briefing: assembleBriefing(s, en, "en", source), prose: en, source };
}

/** Phase 2: translate the English prose into the Arabic briefing. */
export async function composeArabicBriefing(
  s: AgentState,
  enProse: BriefingProse,
  source: "model" | "fallback" = "model",
): Promise<Briefing> {
  const ar = await translateProse(enProse, s);
  return assembleBriefing(s, ar, "ar", source);
}

export async function scribeNode(s: AgentState): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  // Sequential, not parallel: Ollama serves one slot, so concurrent heavy calls
  // queue and can blow the fetch timeout. Generate EN, then translate to AR.
  const { briefing, prose, source } = await composeEnglishBriefing(s);
  const briefingAr = await composeArabicBriefing(s, prose, source);
  return { briefing, briefingAr };
}
