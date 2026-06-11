/**
 * Deep-research agent — a LangGraph ReAct tool-loop driven by a local Ollama
 * model (qwen2.5, which tool-calls reliably; gemma3 cannot, gemma4 is kept for
 * prose). The model autonomously calls real tools (live indicators, bilateral
 * trade, web search) to gather evidence, then synthesizes a cited deep analysis.
 *
 * Additive: this runs alongside the deterministic graph, so the core brief stays
 * reliable while this showcases autonomous multi-tool research.
 */
import { tool } from "@langchain/core/tools";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";

import { bilateralTrade } from "@/services/live/comtrade";
import { liveIndicators } from "@/services/live/indicators";
import { webResearch } from "@/services/live/tavily";

const MODEL = process.env.OLLAMA_MODEL_TOOLS ?? "qwen2.5:7b";
const BASE = process.env.OLLAMA_URL ?? "http://localhost:11434";

const getIndicators = tool(
  async ({ iso3 }: { iso3: string }) => {
    const rows = await liveIndicators(iso3.toUpperCase());
    if (!rows.length) return "No indicators found.";
    return rows.map((p) => `${p.label}: ${p.value} ${p.unit} (${p.year}, ${p.source})`).join("\n");
  },
  {
    name: "get_indicators",
    description:
      "Latest macro and energy indicators for a country (World Bank + IMF + EIA): GDP, growth, inflation, debt, renewables, oil production, etc.",
    schema: z.object({ iso3: z.string().describe("ISO3 country code, e.g. BRA, DEU, IND") }),
  },
);

const getTrade = tool(
  async ({ iso3 }: { iso3: string }) => {
    const t = await bilateralTrade(iso3.toUpperCase());
    return t
      ? `UAE↔${iso3} ${t.year}: total $${(t.totalUsd / 1e9).toFixed(2)}B (UAE exports $${(t.exportsUsd / 1e9).toFixed(2)}B, imports $${(t.importsUsd / 1e9).toFixed(2)}B). Source: UN Comtrade.`
      : "No bilateral trade data available for this country.";
  },
  {
    name: "bilateral_trade",
    description: "Real UAE↔partner bilateral trade in USD (UN Comtrade).",
    schema: z.object({ iso3: z.string().describe("partner ISO3 code") }),
  },
);

const search = tool(
  async ({ query }: { query: string }) => {
    const r = await webResearch(query, { news: true, maxResults: 4 });
    if (!r.results.length) return "No web results (web search unavailable or air-gapped).";
    const head = r.answer ? `Summary: ${r.answer}\n` : "";
    return head + r.results.map((x) => `- ${x.title}: ${x.content.slice(0, 200)}`).join("\n");
  },
  {
    name: "web_search",
    description:
      "Live web/news search for current developments, recent agreements, events, and the counterpart's latest positions.",
    schema: z.object({ query: z.string().describe("a focused search query") }),
  },
);

const TOOLS = [getIndicators, getTrade, search];

export interface ResearchStep {
  tool: string;
  input: string;
}
export interface DeepResearchResult {
  text: string;
  steps: ResearchStep[];
  model: string;
}

/**
 * Run the tool-loop for one country/sector and return the synthesized analysis
 * plus the sequence of tool calls the model chose (for the live trace).
 */
export async function deepResearch(
  country: string,
  iso3: string,
  sector: string,
): Promise<DeepResearchResult> {
  const model = new ChatOllama({
    model: MODEL,
    baseUrl: BASE,
    temperature: 0,
    numCtx: 8192,
    keepAlive: "30m",
  }).bindTools(TOOLS);
  const toolNode = new ToolNode(TOOLS);

  async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke([
      {
        role: "system",
        content: `You are a UAE strategic-intelligence analyst preparing the Minister of Energy for a bilateral meeting about ${country} (${iso3}), focus sector: ${sector}.
Use the tools to gather REAL data before answering: call get_indicators("${iso3}"), bilateral_trade("${iso3}"), and web_search for recent developments. After gathering evidence, write a concise (<=180 words) DEEP ANALYSIS for the Minister — cite the source for every figure, and flag where you are inferring. Do not invent numbers.`,
      },
      ...state.messages,
    ]);
    return { messages: response };
  }

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "agent")
    .compile();

  const out = await graph.invoke(
    {
      messages: [
        {
          role: "user",
          content: `Research ${country} for a UAE ${sector} bilateral meeting and give the Minister a deep analysis.`,
        },
      ],
    },
    { recursionLimit: 10 },
  );

  const steps: ResearchStep[] = [];
  let text = "";
  for (const m of out.messages) {
    const calls = (m as { tool_calls?: { name: string; args: unknown }[] }).tool_calls;
    if (Array.isArray(calls))
      for (const c of calls) steps.push({ tool: c.name, input: JSON.stringify(c.args) });
    const content = (m as { content?: unknown }).content;
    const type = (m as { getType?: () => string }).getType?.();
    if (type === "ai" && typeof content === "string" && content.trim()) text = content;
  }
  return { text, steps, model: MODEL };
}
