/**
 * Per-model pricing for LLM cost estimation.
 *
 * Numbers are USD per 1M tokens — current as of early 2026 for Anthropic
 * direct + common OpenRouter routes. Adjust as providers re-price.
 *
 * Token estimation: 1 token ≈ 4 chars (rough rule of thumb used elsewhere
 * in the project for chunker + UI counters).
 */

export interface PriceRow {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Match longest model-name prefix first. Keys are case-insensitive substrings
 * of the model id; first match wins via PRICE_TABLE_ORDER.
 */
const PRICE_TABLE: Record<string, PriceRow> = {
  // Anthropic direct
  "claude-opus-4-7": { inputPer1M: 15, outputPer1M: 75 },
  "claude-opus-4": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-haiku-4": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-5-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku": { inputPer1M: 0.8, outputPer1M: 4 },
  // OpenRouter common paths (prefix match)
  "anthropic/claude-opus-4": { inputPer1M: 15, outputPer1M: 75 },
  "anthropic/claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15 },
  "anthropic/claude-haiku-4": { inputPer1M: 0.8, outputPer1M: 4 },
  "openai/gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "openai/gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  // Embeddings (output not meaningful — only input is charged)
  "voyage-multilingual-2": { inputPer1M: 0.12, outputPer1M: 0 },
  "voyage-large": { inputPer1M: 0.12, outputPer1M: 0 },
  voyage: { inputPer1M: 0.12, outputPer1M: 0 },
  "text-embedding-3-small": { inputPer1M: 0.02, outputPer1M: 0 },
  // Rerankers (priced per-query in production; approximate via input chars)
  "rerank-multilingual-v3.0": { inputPer1M: 2, outputPer1M: 0 },
  rerank: { inputPer1M: 2, outputPer1M: 0 },
  // Local on-prem → free (compute is your hardware)
  "llama3.1:8b": { inputPer1M: 0, outputPer1M: 0 },
  "llama3.1": { inputPer1M: 0, outputPer1M: 0 },
  "llama3.2": { inputPer1M: 0, outputPer1M: 0 },
  "bge-m3": { inputPer1M: 0, outputPer1M: 0 },
  "local-rerank": { inputPer1M: 0, outputPer1M: 0 },
};

// Sort keys by length desc so longest prefix wins.
const PRICE_TABLE_ORDER: string[] = Object.keys(PRICE_TABLE).sort((a, b) => b.length - a.length);

const CHARS_PER_TOKEN = 4;

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function priceFor(model: string): PriceRow {
  const m = model.toLowerCase();
  for (const key of PRICE_TABLE_ORDER) {
    if (m.includes(key.toLowerCase())) return PRICE_TABLE[key]!;
  }
  // Unknown model → conservative default at sonnet-tier pricing
  return { inputPer1M: 3, outputPer1M: 15 };
}

export function estimateCostUsd(
  model: string,
  promptChars: number,
  completionChars: number,
): {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
} {
  const promptTokens = estimateTokens(promptChars);
  const completionTokens = estimateTokens(completionChars);
  return estimateCostFromTokens(model, promptTokens, completionTokens);
}

/**
 * Cost from real provider-reported token counts. Preferred over estimateCostUsd
 * when usage is available.
 */
export function estimateCostFromTokens(
  model: string,
  promptTokens: number,
  completionTokens: number,
): {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
} {
  const p = priceFor(model);
  const cost =
    (promptTokens / 1_000_000) * p.inputPer1M + (completionTokens / 1_000_000) * p.outputPer1M;
  return { promptTokens, completionTokens, costUsd: Number(cost.toFixed(6)) };
}
