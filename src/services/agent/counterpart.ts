/**
 * Counterpart agent — researches the PERSON the meeting is with.
 * identify (Tavily) → enrich (Wikipedia) → synthesize (local qwen, cited).
 * Data-only node (the runner owns the trace). Never fabricates a person:
 * every failure path returns a seed or an explicit "unconfirmed" profile.
 */
import { getSeedCounterpart } from "@/lib/data/counterparts";
import { iso3Name } from "@/lib/data/iso-countries";
import {
  ROLE_LABELS,
  type RoleSelection,
  roleSelectionFrom,
  searchQueryFor,
} from "@/lib/experience/roles";
import { extractJson } from "@/services/agent/nodes";
import type { AgentState, CounterpartProfile } from "@/services/agent/state";
import { isAirgapped } from "@/services/live/runtime";
import { webResearch } from "@/services/live/tavily";
import { wikiPersonSummary } from "@/services/live/wikipedia";
import { completeText } from "@/services/llm";
import { modelForRole } from "@/services/llm/roles";
import { z } from "zod";

const ACTOR = "agent";

const IdentitySchema = z.object({
  name: z.string().nullable(),
  confidence: z.enum(["high", "medium"]).default("medium"),
});

/** Pure: parse the identify-LLM response; rejects role echoes and junk. */
export function parseIdentity(raw: string): { name: string; confidence: "high" | "medium" } | null {
  const r = IdentitySchema.safeParse(extractJson(raw));
  if (!r.success || !r.data.name || r.data.name.trim().length < 3) return null;
  if (/^(the |a )?(minister|president|secretary|head of|unknown|n\/?a)/i.test(r.data.name.trim()))
    return null;
  return { name: r.data.name.trim(), confidence: r.data.confidence };
}

const DossierSchema = z.object({
  summary: z.string().default(""),
  education: z.string().default(""),
  career: z
    .array(
      z.object({
        period: z.string().default(""),
        position: z.string().default(""),
        org: z.string().default(""),
      }),
    )
    .default([]),
  likelyToRaise: z.array(z.string()).default([]),
});

/** Pure: parse the dossier-LLM response with lenient defaults. */
export function parseDossier(raw: string): z.infer<typeof DossierSchema> | null {
  const j = extractJson(raw);
  if (!j) return null;
  const r = DossierSchema.safeParse(j);
  return r.success ? r.data : null;
}

export interface CounterpartDeps {
  airgapped: () => boolean;
  search: typeof webResearch;
  wiki: typeof wikiPersonSummary;
  llm: typeof completeText;
  today: () => string;
}

const DEFAULT_DEPS: CounterpartDeps = {
  airgapped: isAirgapped,
  search: webResearch,
  wiki: wikiPersonSummary,
  llm: completeText,
  today: () => new Date().toISOString().slice(0, 10),
};

function roleLabel(sel: RoleSelection): string {
  return sel.key === "custom" ? sel.customName?.trim() || "Counterpart" : ROLE_LABELS[sel.key].en;
}

function unconfirmed(role: RoleSelection, today: string): CounterpartProfile {
  return {
    name: "",
    role: roleLabel(role),
    roleAr: role.key === "custom" ? undefined : ROLE_LABELS[role.key].ar,
    summary: "",
    career: [],
    likelyToRaise: [],
    statements: [],
    citations: [],
    identifiedAsOf: today,
    confidence: "unconfirmed",
  };
}

export async function counterpartNode(
  s: AgentState,
  deps: CounterpartDeps = DEFAULT_DEPS,
): Promise<Partial<AgentState>> {
  const scope = s.scope;
  if (!scope) return {};
  const role = roleSelectionFrom(s.counterpartRole, s.counterpartName);
  const country = iso3Name(scope.iso3) ?? scope.iso3;
  const today = deps.today();

  try {
    if (deps.airgapped()) {
      const seed = getSeedCounterpart(scope.iso3, role.key);
      return { counterpart: seed ?? unconfirmed(role, today) };
    }

    // 1 · Identify the current officeholder (skipped for user-supplied names).
    let name = role.key === "custom" ? (role.customName?.trim() ?? null) : null;
    let confidence: "high" | "medium" = "high";
    let search: Awaited<ReturnType<typeof webResearch>> | null = null;
    if (!name) {
      search = await deps.search(searchQueryFor(country, role), { maxResults: 5 });
      const evidence = [
        search.answer ? `ANSWER: ${search.answer}` : "",
        ...search.results.slice(0, 5).map((r) => `- ${r.title}: ${r.content.slice(0, 200)}`),
      ]
        .filter(Boolean)
        .join("\n");
      if (evidence) {
        const res = await deps.llm({
          system:
            'Extract the CURRENT named officeholder from the evidence. Return STRICT JSON {"name": string|null, "confidence": "high"|"medium"}. name must be a real person\'s full name taken from the evidence; null if the evidence does not clearly name the current holder.',
          messages: [
            {
              role: "user",
              content: `ROLE SOUGHT: ${roleLabel(role)} of ${country}\n\nEVIDENCE:\n${evidence}`,
            },
          ],
          model: modelForRole("analyst"),
          step: "complete",
          maxTokens: 120,
          json: true,
          actor: ACTOR,
          classification: s.classification,
        });
        const id = parseIdentity(res.text);
        if (id) ({ name, confidence } = id);
      }
    }
    if (!name) {
      const seed = getSeedCounterpart(scope.iso3, role.key);
      return { counterpart: seed ?? unconfirmed(role, today) };
    }

    // 2 · Enrich from Wikipedia (best-effort).
    const wiki = await deps.wiki(name, country).catch(() => null);

    // 3 · Synthesize the dossier from real grounding only.
    const grounding = [
      wiki?.extract ? `WIKIPEDIA: ${wiki.extract.slice(0, 2200)}` : "",
      (search?.results ?? [])
        .slice(0, 4)
        .map((r) => `NEWS: ${r.title} — ${r.content.slice(0, 300)}`)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");
    let dossier: ReturnType<typeof parseDossier> = null;
    if (grounding) {
      try {
        const res = await deps.llm({
          system: `You profile a foreign official so a UAE minister can walk into the meeting knowing exactly who they face. Use ONLY the supplied grounding; never invent facts — omit what the grounding does not support.
Return STRICT JSON:
{"summary": string, "education": string, "career": [{"period":str,"position":str,"org":str}], "likelyToRaise": [str]}
- summary: 3-5 sentences (<=90 words) — who they are, political/professional background, power base or affiliations, and their current agenda in office.
- education: degrees/institutions if stated in the grounding, else "".
- career: up to 6 entries, most recent first, real positions with org and period.
- likelyToRaise: 3-5 items, each "topic — one-line why", grounded in their record and the country's interests with the UAE.`,
          messages: [
            {
              role: "user",
              content: `PERSON: ${name} — ${roleLabel(role)} of ${country}\n\nGROUNDING:\n${grounding}`,
            },
          ],
          model: modelForRole("analyst"),
          step: "complete",
          maxTokens: 900,
          json: true,
          actor: ACTOR,
          classification: s.classification,
        });
        dossier = parseDossier(res.text);
      } catch {
        dossier = null;
      }
    }

    const statements = (search?.results ?? [])
      .slice(0, 3)
      .map((r) => ({ text: r.title, url: r.url }));
    const citations = [...(wiki ? [wiki.pageUrl] : []), ...statements.map((st) => st.url)];

    if (!wiki && !dossier && citations.length === 0) {
      // Named but entirely ungrounded — do not present an empty dossier as fact.
      return { counterpart: { ...unconfirmed(role, today), name, confidence: "medium" } };
    }

    const seed = getSeedCounterpart(scope.iso3, role.key);
    return {
      counterpart: {
        name,
        nameAr: seed?.name === name ? seed.nameAr : undefined,
        role: roleLabel(role),
        roleAr: role.key === "custom" ? undefined : ROLE_LABELS[role.key].ar,
        photoUrl: wiki?.thumbnailUrl,
        photoAttribution: wiki ? "Photo: Wikipedia (CC)" : undefined,
        summary: dossier?.summary || (wiki?.extract ?? "").slice(0, 480),
        education: dossier?.education || undefined,
        career: dossier?.career ?? [],
        likelyToRaise: dossier?.likelyToRaise ?? [],
        statements,
        citations,
        identifiedAsOf: today,
        confidence,
      },
    };
  } catch {
    return { counterpart: unconfirmed(role, today) };
  }
}
