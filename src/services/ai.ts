import { withSpan } from "@/lib/otel";
import {
  completeText,
  defaultModelFor,
  getLlmConfig,
  getProvider,
  isCloud,
  resolveProvider,
} from "@/services/llm";
import { BudgetExceededError, checkBudget, resolveActorDept } from "@/services/llm/budget";
import { logLlmCall } from "@/services/llm/call-log";
import type { Classification } from "@/types";

export function aiEnabled(): boolean {
  return getProvider().available();
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const BASE_PROMPT = `You are the AI assistant for the UAE Country Intelligence Platform.

You serve government leadership briefings.

Style:
- Executive register. Declarative. No hedging, no filler.
- Active voice. Short sentences (~25 words avg).
- Every factual claim cites a source: (World Bank, 2025), (IEA, 2024), (UN Comtrade, 2024).
- Forecasts include a confidence label: High / Med / Low.
- If a fact is uncertain or unverified, say so plainly — do not invent.

Hard rules:
- Never include classified material in unclassified output.
- If asked about something outside this platform's scope (country indicators, briefings, cooperation), say so and offer a redirect.
- Never fabricate URLs, agreements, indicators, or quotes.`;

function classificationDirective(c: Classification): string {
  switch (c) {
    case "public":
      return [
        "OUTPUT CLASSIFICATION: PUBLIC.",
        "- Only public-domain facts. No internal deliberations.",
        "- Cite open sources only (World Bank, IEA, UN, government publications).",
        "- Do not reveal counterpart names from non-public diplomatic engagements.",
      ].join("\n");
    case "internal":
      return [
        "OUTPUT CLASSIFICATION: INTERNAL.",
        "- Open sources + UAE government public datasets.",
        "- Aggregate sensitivities OK; named individuals only if public.",
        "- No bilateral negotiation positions, no security details.",
      ].join("\n");
    case "confidential":
      return [
        "OUTPUT CLASSIFICATION: CONFIDENTIAL.",
        "- Includes bilateral cooperation specifics and negotiation context.",
        "- Named principals + non-public commitments permitted.",
        "- No defense, intelligence, or critical-infra targeting detail.",
      ].join("\n");
    case "secret":
      return [
        "OUTPUT CLASSIFICATION: SECRET.",
        "- Full sensitive context permitted, including defense and strategic posture.",
        "- Every release tracked via audit log.",
        "- Stamp output header: SECRET — Distribution Limited.",
      ].join("\n");
  }
}

function buildSystemPrompt(c: Classification): string {
  return `${BASE_PROMPT}\n\n${classificationDirective(c)}\n\nPrepend every response with a single line: "[CLASSIFICATION: ${c.toUpperCase()}]". Refuse to produce content above this classification — instead emit a brief refusal that names the required clearance.`;
}

export class CloudClassificationError extends Error {
  constructor(
    public readonly classification: Classification,
    public readonly provider: string,
  ) {
    super(
      `classification "${classification}" requires on-prem provider, current provider "${provider}" is cloud`,
    );
    this.name = "CloudClassificationError";
  }
}

function enforceCloudClassificationGate(classification: Classification): void {
  const resolved = resolveProvider(classification);
  if (isCloud(resolved) && (classification === "confidential" || classification === "secret")) {
    throw new CloudClassificationError(classification, resolved);
  }
}

export interface ChatStreamOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
  sessionId?: string;
}

export async function* chatStream(
  messages: ChatTurn[],
  classification: Classification = "internal",
  opts: ChatStreamOpts = {},
): AsyncGenerator<
  | { kind: "delta"; text: string }
  | {
      kind: "done";
      text: string;
      citations: string[];
      usedRealApi: boolean;
      classification: Classification;
      provider: string;
      model: string;
      usage?: { promptTokens: number; completionTokens: number };
    },
  void,
  unknown
> {
  enforceCloudClassificationGate(classification);
  const effectiveDept = opts.actorDept ?? resolveActorDept(opts.actor);
  const decision = checkBudget(opts.actor ?? "system", effectiveDept);
  if (!decision.allowed) throw new BudgetExceededError(decision);
  const cfg = getLlmConfig();
  const resolved = resolveProvider(classification);
  const provider = getProvider(resolved);
  const model = resolved === cfg.provider ? cfg.model : defaultModelFor(resolved);
  const system = buildSystemPrompt(classification);
  const promptChars = system.length + messages.reduce((s, m) => s + m.content.length, 0);
  const t0 = Date.now();
  let logged = false;
  try {
    for await (const chunk of provider.stream({
      messages,
      system,
      classification,
      model,
      maxTokens: 1024,
    })) {
      if (chunk.kind === "done") {
        logLlmCall({
          actor: opts.actor ?? "system",
          actorDept: effectiveDept,
          reqId: opts.reqId,
          sessionId: opts.sessionId,
          step: "chat.stream",
          provider: chunk.provider,
          model: chunk.model,
          classification: chunk.classification,
          promptChars,
          completionChars: chunk.text.length,
          actualPromptTokens: chunk.usage?.promptTokens,
          actualCompletionTokens: chunk.usage?.completionTokens,
          durationMs: Date.now() - t0,
          usedRealApi: chunk.usedRealApi,
        });
        logged = true;
      }
      yield chunk;
    }
  } catch (err) {
    if (!logged) {
      logLlmCall({
        actor: opts.actor ?? "system",
        actorDept: effectiveDept,
        reqId: opts.reqId,
        sessionId: opts.sessionId,
        step: "chat.stream",
        provider: resolved,
        model,
        classification,
        promptChars,
        completionChars: 0,
        durationMs: Date.now() - t0,
        usedRealApi: provider.available(),
        errorClass: err instanceof Error ? err.name : "Error",
      });
    }
    throw err;
  }
}

export interface ChatCompleteOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
  sessionId?: string;
}

export async function chatComplete(
  messages: ChatTurn[],
  classification: Classification = "internal",
  opts: ChatCompleteOpts = {},
): Promise<{
  text: string;
  citations: string[];
  usedRealApi: boolean;
  classification: Classification;
  provider: string;
  model: string;
}> {
  enforceCloudClassificationGate(classification);
  const cfg = getLlmConfig();
  const resolved = resolveProvider(classification);
  const model = resolved === cfg.provider ? cfg.model : defaultModelFor(resolved);
  // Route through completeText so the call hits the budget gate + telemetry pipeline.
  return withSpan(
    "ai.chat.complete",
    () =>
      completeText({
        system: buildSystemPrompt(classification),
        messages,
        classification,
        maxTokens: 1024,
        step: "chat",
        actor: opts.actor,
        actorDept: opts.actorDept,
        reqId: opts.reqId,
        sessionId: opts.sessionId,
      }),
    {
      "ai.provider": resolved,
      "ai.model": model,
      "ai.classification": classification,
      "ai.turns": messages.length,
    },
  );
}

function detectClassification(text: string, fallback: Classification): Classification {
  const m = text.match(/\[CLASSIFICATION:\s*(PUBLIC|INTERNAL|CONFIDENTIAL|SECRET)\]/i);
  if (!m) return fallback;
  const tag = m[1]?.toLowerCase();
  if (tag === "public" || tag === "internal" || tag === "confidential" || tag === "secret") {
    return tag;
  }
  return fallback;
}

export interface BriefingRequest {
  countryIso3: string;
  countryName: string;
  audience: string;
  topics: string[];
  classification: Classification;
}

export interface BriefingResponse {
  title: string;
  strategicOverview: string;
  talkingPoints: string[];
  risks: string[];
  opportunities: string[];
  citations: string[];
  confidence: "high" | "med" | "low";
  classification: Classification;
}

export interface GenerateBriefingOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
}

export async function generateBriefing(
  req: BriefingRequest,
  opts: GenerateBriefingOpts = {},
): Promise<BriefingResponse> {
  enforceCloudClassificationGate(req.classification);
  const provider = getProvider();
  if (!provider.available()) {
    return mockBriefing(req);
  }

  const userMsg = `Produce a briefing for ${req.audience} on ${req.countryName} (${req.countryIso3}) covering: ${req.topics.join(", ")}.

Classification: ${req.classification}.

Return STRICT JSON only, no prose, matching:
{
  "title": "string",
  "strategicOverview": "string (<= 80 words, executive register)",
  "talkingPoints": ["5 short bullets, each <= 20 words"],
  "risks": ["3 bullets max"],
  "opportunities": ["3 bullets max"],
  "citations": ["e.g. World Bank, 2025"],
  "confidence": "high" | "med" | "low"
}`;

  const cfg = getLlmConfig();
  return withSpan(
    "ai.briefing.generate",
    async () => {
      const result = await completeText({
        system: buildSystemPrompt(req.classification),
        messages: [{ role: "user", content: userMsg }],
        maxTokens: 2048,
        classification: req.classification,
        step: "briefing",
        actor: opts.actor,
        actorDept: opts.actorDept,
        reqId: opts.reqId,
      });
      const json = extractJson(result.text);
      if (!json) {
        return mockBriefing(req);
      }
      const parsed = json as Omit<BriefingResponse, "classification"> & {
        classification?: Classification;
      };
      return { ...parsed, classification: req.classification };
    },
    {
      "ai.provider": cfg.provider,
      "ai.model": cfg.model,
      "ai.country": req.countryIso3,
      "ai.classification": req.classification,
      "ai.audience": req.audience,
    },
  );
}

function extractCitations(text: string): string[] {
  const set = new Set<string>();
  const re = /\(([^)]+,\s*\d{4})\)/g;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m[1]) set.add(m[1]);
    m = re.exec(text);
  }
  return [...set];
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : text;
  if (!candidate) return null;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface SectorInsightsRequest {
  countryIso3: string;
  countryName: string;
  sector: string;
  classification: Classification;
}

export interface SectorInsightsResponse {
  sector: string;
  summary: string;
  keyPoints: string[];
  opportunities: string[];
  risks: string[];
  stats: { label: string; value: string }[];
  citations: string[];
  confidence: "high" | "med" | "low";
  classification: Classification;
}

/**
 * Agentic research for a user-defined sector on a country profile.
 * Same provider/budget/classification pipeline as briefings; strict-JSON contract
 * so the custom tab renders structured cards instead of prose.
 */
export async function generateSectorInsights(
  req: SectorInsightsRequest,
  opts: GenerateBriefingOpts = {},
): Promise<SectorInsightsResponse> {
  enforceCloudClassificationGate(req.classification);
  const provider = getProvider();
  if (!provider.available()) {
    return mockSectorInsights(req);
  }

  const userMsg = `Research the "${req.sector}" sector of ${req.countryName} (${req.countryIso3}) for a UAE government country-intelligence profile.

Classification: ${req.classification}.

Return STRICT JSON only, no prose, matching:
{
  "sector": "normalised sector name, title case",
  "summary": "string (<= 70 words, executive register, every claim cited inline)",
  "keyPoints": ["4-5 short bullets, each <= 18 words, cited"],
  "opportunities": ["2-3 bullets — UAE cooperation/investment angles"],
  "risks": ["2-3 bullets"],
  "stats": [{"label": "short metric name", "value": "figure with unit and year, e.g. \\"$4.2B (2024)\\""}],
  "citations": ["e.g. World Bank, 2025"],
  "confidence": "high" | "med" | "low"
}
Provide 3-4 stats with real, sourced figures. If a figure cannot be sourced, omit it — never invent.`;

  const cfg = getLlmConfig();
  return withSpan(
    "ai.sector.insights",
    async () => {
      const result = await completeText({
        system: buildSystemPrompt(req.classification),
        messages: [{ role: "user", content: userMsg }],
        maxTokens: 1600,
        classification: req.classification,
        step: "sector-insights",
        actor: opts.actor,
        actorDept: opts.actorDept,
        reqId: opts.reqId,
      });
      const json = extractJson(result.text);
      if (!json) {
        return mockSectorInsights(req);
      }
      const parsed = json as Omit<SectorInsightsResponse, "classification">;
      return {
        ...parsed,
        sector: parsed.sector || req.sector,
        stats: Array.isArray(parsed.stats) ? parsed.stats : [],
        classification: req.classification,
      };
    },
    {
      "ai.provider": cfg.provider,
      "ai.model": cfg.model,
      "ai.country": req.countryIso3,
      "ai.sector": req.sector,
      "ai.classification": req.classification,
    },
  );
}

function mockSectorInsights(req: SectorInsightsRequest): SectorInsightsResponse {
  return {
    sector: req.sector,
    summary: `Mock insights for the ${req.sector} sector of ${req.countryName}. Set ANTHROPIC_API_KEY (or another provider) to generate sourced research.`,
    keyPoints: [
      `${req.sector} contributes materially to GDP — verify latest share.`,
      "Regulatory framework under active reform.",
      "Foreign participation rules recently liberalised.",
      "UAE entities already present via existing MoUs.",
    ],
    opportunities: ["Joint investment platform.", "Knowledge-exchange programme."],
    risks: ["Data gaps in official statistics.", "Policy continuity across cycles."],
    stats: [
      { label: "Sector GDP share", value: "n/a (mock)" },
      { label: "Annual growth", value: "n/a (mock)" },
    ],
    citations: ["mock"],
    confidence: "low",
    classification: req.classification,
  };
}

function mockBriefing(req: BriefingRequest): BriefingResponse {
  return {
    title: `${req.countryName} — briefing for ${req.audience}`,
    strategicOverview: `Mock briefing for ${req.countryName}. Set ANTHROPIC_API_KEY to generate real content with sourced citations and confidence scoring.`,
    talkingPoints: [
      "Anchor on shared net-zero commitments.",
      "Surface 2 deal-ready cooperation vehicles.",
      "Position UAE as preferred clean-energy partner.",
      "Pre-empt CO₂ sensitivity with renewables trajectory.",
      "Close with named 90-day follow-up.",
    ],
    risks: [
      "Diverging regulatory regimes.",
      "Counterpart political cycle uncertainty.",
      "Public attention on labour conditions.",
    ],
    opportunities: [
      "Green-ammonia offtake corridor.",
      "Critical-minerals joint sourcing.",
      "Smart-grid standards alignment.",
    ],
    citations: ["mock"],
    confidence: "low",
    classification: req.classification,
  };
}
