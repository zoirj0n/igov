import { detectClass, extractCitations } from "./anthropic";
import type { CompleteResult, ProviderArgs, ProviderImpl, StreamChunk } from "./types";

// Read env at call time, not module load — so admin panel / .env edits don't
// require the dev server to restart to pick up a new key or base URL.
const getApiKey = (): string | undefined => process.env.OPENROUTER_API_KEY;
const getBase = (): string => process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const getReferer = (): string => process.env.OPENROUTER_REFERER ?? "https://country-intel.local";
const getAppName = (): string =>
  process.env.OPENROUTER_APP_NAME ?? "Country Intelligence Platform";

function headers(): Record<string, string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "http-referer": getReferer(),
    "x-title": getAppName(),
  };
}

function toOpenAI(args: ProviderArgs): {
  model: string;
  max_tokens: number;
  stream: boolean;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
} {
  return {
    model: args.model,
    max_tokens: args.maxTokens,
    stream: false,
    messages: [
      { role: "system", content: args.system },
      ...args.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  };
}

export const openrouterProvider: ProviderImpl = {
  name: "openrouter",
  available: () => Boolean(getApiKey()),
  unavailableReason: () => "OPENROUTER_API_KEY not set",
  async *stream(args: ProviderArgs): AsyncGenerator<StreamChunk, void, unknown> {
    if (!getApiKey()) {
      yield* mockStream(args, "OPENROUTER_API_KEY not set");
      return;
    }
    const body = { ...toOpenAI(args), stream: true, stream_options: { include_usage: true } };
    const res = await fetch(`${getBase()}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(`openrouter ${res.status}: ${txt.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield { kind: "delta", text: delta };
          }
          if (evt.usage) {
            if (typeof evt.usage.prompt_tokens === "number") promptTokens = evt.usage.prompt_tokens;
            if (typeof evt.usage.completion_tokens === "number")
              completionTokens = evt.usage.completion_tokens;
          }
        } catch {
          // skip
        }
      }
    }
    yield {
      kind: "done",
      text: full,
      citations: extractCitations(full),
      usedRealApi: true,
      classification: detectClass(full, args.classification),
      provider: "openrouter",
      model: args.model,
      usage:
        promptTokens !== undefined && completionTokens !== undefined
          ? { promptTokens, completionTokens }
          : undefined,
    };
  },
  async complete(args: ProviderArgs): Promise<CompleteResult> {
    if (!getApiKey()) return mockComplete(args, "OPENROUTER_API_KEY not set");
    const res = await fetch(`${getBase()}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(toOpenAI(args)),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`openrouter ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      text,
      citations: extractCitations(text),
      usedRealApi: true,
      classification: detectClass(text, args.classification),
      provider: "openrouter",
      model: args.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  },
};

async function* mockStream(
  args: ProviderArgs,
  reason: string,
): AsyncGenerator<StreamChunk, void, unknown> {
  const banner = `[CLASSIFICATION: ${args.classification.toUpperCase()}]\n`;
  const mock = `${banner}Mock response (${reason}).`;
  for (const word of mock.split(/(\s+)/)) {
    await new Promise((r) => setTimeout(r, 15));
    yield { kind: "delta", text: word };
  }
  yield {
    kind: "done",
    text: mock,
    citations: ["mock"],
    usedRealApi: false,
    classification: args.classification,
    provider: "openrouter",
    model: args.model,
  };
}

function mockComplete(args: ProviderArgs, reason: string): CompleteResult {
  const banner = `[CLASSIFICATION: ${args.classification.toUpperCase()}]\n`;
  return {
    text: `${banner}Mock response (${reason}).`,
    citations: ["mock"],
    usedRealApi: false,
    classification: args.classification,
    provider: "openrouter",
    model: args.model,
  };
}
