import type { Classification } from "@/types";
import Anthropic from "@anthropic-ai/sdk";
import type { CompleteResult, ProviderArgs, ProviderImpl, StreamChunk } from "./types";

const apiKey = process.env.ANTHROPIC_API_KEY;
let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
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

function detectClass(text: string, fallback: Classification): Classification {
  const m = text.match(/\[CLASSIFICATION:\s*(PUBLIC|INTERNAL|CONFIDENTIAL|SECRET)\]/i);
  const tag = m?.[1]?.toLowerCase();
  if (tag === "public" || tag === "internal" || tag === "confidential" || tag === "secret")
    return tag;
  return fallback;
}

export const anthropicProvider: ProviderImpl = {
  name: "anthropic",
  available: () => Boolean(apiKey),
  unavailableReason: () => "ANTHROPIC_API_KEY not set",
  async *stream(args: ProviderArgs): AsyncGenerator<StreamChunk, void, unknown> {
    const c = getClient();
    if (!c) {
      yield* mockStream(args, "ANTHROPIC_API_KEY not set");
      return;
    }
    let full = "";
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    const s = c.messages.stream({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
    });
    for await (const ev of s) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        full += ev.delta.text;
        yield { kind: "delta", text: ev.delta.text };
      } else if (ev.type === "message_start" && ev.message?.usage) {
        promptTokens = ev.message.usage.input_tokens;
      } else if (ev.type === "message_delta" && ev.usage) {
        completionTokens = ev.usage.output_tokens;
      }
    }
    yield {
      kind: "done",
      text: full,
      citations: extractCitations(full),
      usedRealApi: true,
      classification: detectClass(full, args.classification),
      provider: "anthropic",
      model: args.model,
      usage:
        promptTokens !== undefined && completionTokens !== undefined
          ? { promptTokens, completionTokens }
          : undefined,
    };
  },
  async complete(args: ProviderArgs): Promise<CompleteResult> {
    const c = getClient();
    if (!c) return mockComplete(args, "ANTHROPIC_API_KEY not set");
    const res = await c.messages.create({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      text,
      citations: extractCitations(text),
      usedRealApi: true,
      classification: detectClass(text, args.classification),
      provider: "anthropic",
      model: args.model,
      usage: res.usage
        ? { promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens }
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
    provider: "anthropic",
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
    provider: "anthropic",
    model: args.model,
  };
}

export { extractCitations, detectClass };
