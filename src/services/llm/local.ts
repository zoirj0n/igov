import { detectClass, extractCitations } from "./anthropic";
import type { CompleteResult, ProviderArgs, ProviderImpl, StreamChunk } from "./types";

const BASE = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Keep models resident between calls so a live demo never waits on a cold load.
// "30m" by default; set OLLAMA_KEEP_ALIVE=-1 to pin indefinitely.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";
// Large local models (e.g. gemma4:12b) can take minutes per call; override
// Node's default ~300s fetch timeout so legitimate slow generations finish.
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 600_000);
// Context window. Ollama defaults to 4096, which truncates the scribe's prompt
// (facts + analysis + evidence). Widen it; gemma4 supports far more.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
// Health-probe timeout. 800ms is too tight: while Ollama cold-loads a big model
// /api/tags can stall, falsely tripping the offline mock. Give it room.
const PING_MS = Number(process.env.OLLAMA_PING_MS ?? 5000);

function toOllama(
  args: ProviderArgs,
  stream: boolean,
): {
  model: string;
  stream: boolean;
  keep_alive: string;
  format?: "json";
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  options?: { num_predict?: number; num_ctx?: number };
} {
  return {
    model: args.model,
    stream,
    keep_alive: KEEP_ALIVE,
    ...(args.json ? { format: "json" as const } : {}),
    messages: [
      { role: "system", content: args.system },
      ...args.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
    options: { num_predict: args.maxTokens, num_ctx: NUM_CTX },
  };
}

async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(PING_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

export const localProvider: ProviderImpl = {
  name: "local",
  available: () => true,
  unavailableReason: () => `local LLM not reachable at ${BASE}`,
  async *stream(args: ProviderArgs): AsyncGenerator<StreamChunk, void, unknown> {
    if (!(await ping())) {
      yield* mockStream(args, `local LLM unreachable at ${BASE}`);
      return;
    }
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toOllama(args, true)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(`local LLM ${res.status}: ${txt.slice(0, 200)}`);
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
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          const delta = evt.message?.content;
          if (delta) {
            full += delta;
            yield { kind: "delta", text: delta };
          }
          if (evt.done) {
            if (typeof evt.prompt_eval_count === "number") promptTokens = evt.prompt_eval_count;
            if (typeof evt.eval_count === "number") completionTokens = evt.eval_count;
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
      provider: "local",
      model: args.model,
      usage:
        promptTokens !== undefined || completionTokens !== undefined
          ? { promptTokens: promptTokens ?? 0, completionTokens: completionTokens ?? 0 }
          : undefined,
    };
  },
  async complete(args: ProviderArgs): Promise<CompleteResult> {
    if (!(await ping())) return mockComplete(args, `local LLM unreachable at ${BASE}`);
    // Stream under the hood: a non-streamed POST sends no response headers until
    // the whole generation finishes, which trips undici's 300s headersTimeout on
    // long local generations (gemma4:12b). Streaming sends headers immediately,
    // so only the absolute AbortSignal timeout applies.
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toOllama(args, true)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(`local LLM ${res.status}: ${txt.slice(0, 200)}`);
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
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          if (evt.message?.content) full += evt.message.content;
          if (evt.done) {
            promptTokens = evt.prompt_eval_count;
            completionTokens = evt.eval_count;
          }
        } catch {
          /* skip non-JSON keepalive lines */
        }
      }
    }
    return {
      text: full,
      citations: extractCitations(full),
      usedRealApi: true,
      classification: detectClass(full, args.classification),
      provider: "local",
      model: args.model,
      usage:
        promptTokens !== undefined || completionTokens !== undefined
          ? { promptTokens: promptTokens ?? 0, completionTokens: completionTokens ?? 0 }
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
    provider: "local",
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
    provider: "local",
    model: args.model,
  };
}
