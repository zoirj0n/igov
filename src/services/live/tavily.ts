/**
 * Tavily — live web research + news for current developments the seed can't
 * hold (recent MOUs, the counterpart's latest positions, events). Needs
 * TAVILY_API_KEY; degrades to empty (no results) when absent or air-gapped,
 * so the agent simply skips the web step rather than failing.
 */
import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";

export interface WebResult {
  title: string;
  url: string;
  content: string;
  score: number;
}
export interface WebResearch {
  query: string;
  answer?: string;
  results: WebResult[];
  source: string;
  live: boolean;
}

export function tavilyEnabled(): boolean {
  return !!process.env.TAVILY_API_KEY && !isAirgapped();
}

export async function webResearch(
  query: string,
  opts: { news?: boolean; maxResults?: number } = {},
): Promise<WebResearch> {
  const key = process.env.TAVILY_API_KEY;
  const empty = (): WebResearch => ({ query, results: [], source: "Tavily", live: false });
  if (!key || isAirgapped()) return empty();

  return withCache<WebResearch>(
    `tavily:${opts.news ? "news" : "web"}:${query}`,
    60 * 60 * 1000, // 1h
    async () => {
      const res = await withTimeout(
        fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            query,
            topic: opts.news ? "news" : "general",
            ...(opts.news ? { time_range: "month" } : {}),
            max_results: opts.maxResults ?? 5,
            include_answer: "advanced",
          }),
        }),
        15_000,
        "tavily",
      );
      if (!res.ok) throw new Error(`tavily ${res.status}`);
      const j = (await res.json()) as { answer?: string; results?: WebResult[] };
      return {
        query,
        answer: j.answer,
        results: (j.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        })),
        source: "Tavily",
        live: true,
      };
    },
    empty,
  );
}
