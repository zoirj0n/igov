import {
  type CounterpartDeps,
  counterpartNode,
  parseDossier,
  parseIdentity,
} from "@/services/agent/counterpart";
import type { AgentState } from "@/services/agent/state";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

function baseState(extra?: Partial<AgentState>): AgentState {
  return { ...FIXTURE_STATE, counterpart: undefined, counterpartName: undefined, ...extra };
}

const IDENTIFY_JSON = '{"name":"Alexandre Silveira","confidence":"high"}';
const DOSSIER_JSON =
  '{"summary":"Brazilian minister driving SAF.","education":"Law (Milton Campos)","career":[{"period":"2023–","position":"Minister of Mines and Energy","org":"Government of Brazil"}],"likelyToRaise":["SAF partnerships — anchor investors"]}';

function liveDeps(overrides?: Partial<CounterpartDeps>): CounterpartDeps {
  return {
    airgapped: () => false,
    search: vi.fn(async () => ({
      query: "q",
      answer: "Alexandre Silveira is Brazil's Minister of Mines and Energy.",
      results: [
        {
          title: "Silveira announces SAF push",
          url: "https://news.example/saf",
          content: "the minister said…",
          score: 0.9,
        },
      ],
      source: "Tavily",
      live: true,
    })) as CounterpartDeps["search"],
    wiki: vi.fn(async () => ({
      title: "Alexandre Silveira",
      extract:
        "Alexandre Silveira is a Brazilian politician serving as Minister of Mines and Energy.",
      thumbnailUrl: "https://upload.wikimedia.org/silveira.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Alexandre_Silveira",
      live: true,
    })) as CounterpartDeps["wiki"],
    llm: vi
      .fn()
      .mockResolvedValueOnce({ text: IDENTIFY_JSON })
      .mockResolvedValueOnce({ text: DOSSIER_JSON }) as unknown as CounterpartDeps["llm"],
    today: () => "2026-06-10",
    ...overrides,
  };
}

describe("parseIdentity", () => {
  it("accepts a clean identification", () => {
    expect(parseIdentity(IDENTIFY_JSON)).toEqual({
      name: "Alexandre Silveira",
      confidence: "high",
    });
  });
  it("rejects null names, role echoes and junk", () => {
    expect(parseIdentity('{"name":null,"confidence":"high"}')).toBeNull();
    expect(parseIdentity('{"name":"The Minister of Energy","confidence":"high"}')).toBeNull();
    expect(parseIdentity("not json")).toBeNull();
  });
});

describe("parseDossier", () => {
  it("parses with lenient defaults", () => {
    expect(parseDossier(DOSSIER_JSON)?.career[0]?.org).toBe("Government of Brazil");
    expect(parseDossier('{"summary":"x"}')?.likelyToRaise).toEqual([]);
    expect(parseDossier("junk")).toBeNull();
  });
});

describe("counterpartNode", () => {
  it("air-gapped: returns the seed when one exists (BRA energy)", async () => {
    const out = await counterpartNode(baseState({ counterpartRole: "energy" }));
    expect(out.counterpart?.name).toBe("Alexandre Silveira");
    expect(out.counterpart?.confidence).toBe("medium");
  });

  it("air-gapped: unseeded pair returns an honest unconfirmed profile", async () => {
    const s = baseState({ counterpartRole: "foreign" });
    const out = await counterpartNode(s);
    expect(out.counterpart?.confidence).toBe("unconfirmed");
    expect(out.counterpart?.name).toBe("");
    expect(out.counterpart?.role).toBe("Foreign Minister");
  });

  it("live happy path: identify → enrich → synthesize, cited", async () => {
    const deps = liveDeps();
    const out = await counterpartNode(baseState({ counterpartRole: "energy" }), deps);
    const p = out.counterpart;
    expect(p?.name).toBe("Alexandre Silveira");
    expect(p?.photoUrl).toContain("upload.wikimedia.org");
    expect(p?.summary.length).toBeGreaterThan(0);
    expect(p?.career[0]?.org).toBe("Government of Brazil");
    expect(p?.education).toBe("Law (Milton Campos)");
    expect(p?.citations).toContain("https://en.wikipedia.org/wiki/Alexandre_Silveira");
    expect(p?.statements[0]?.url).toBe("https://news.example/saf");
    expect(p?.identifiedAsOf).toBe("2026-06-10");
    expect(p?.confidence).toBe("high");
  });

  it("live custom name skips identification (one LLM call only)", async () => {
    const llm = vi.fn().mockResolvedValueOnce({ text: DOSSIER_JSON });
    const deps = liveDeps({ llm: llm as unknown as CounterpartDeps["llm"] });
    const out = await counterpartNode(
      baseState({ counterpartRole: "custom", counterpartName: "Jane Doe" }),
      deps,
    );
    expect(out.counterpart?.name).toBe("Jane Doe");
    expect(out.counterpart?.confidence).toBe("high");
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("live identification failure falls back to seed, else unconfirmed", async () => {
    const badLlm = vi.fn(async () => ({ text: "no json" }));
    const noWiki = vi.fn(async () => null);
    const out = await counterpartNode(
      baseState({
        counterpartRole: "energy",
        scope: { ...(FIXTURE_STATE.scope ?? ({} as never)), iso3: "JPN" },
      }),
      liveDeps({
        llm: badLlm as unknown as CounterpartDeps["llm"],
        wiki: noWiki as CounterpartDeps["wiki"],
      }),
    );
    expect(out.counterpart?.confidence).toBe("unconfirmed");
  });

  it("returns {} without a scope", async () => {
    expect(await counterpartNode(baseState({ scope: undefined }))).toEqual({});
  });
});
