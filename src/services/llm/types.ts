import type { Classification } from "@/types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type StreamChunk =
  | { kind: "delta"; text: string }
  | {
      kind: "done";
      text: string;
      citations: string[];
      usedRealApi: boolean;
      classification: Classification;
      provider: string;
      model: string;
      usage?: TokenUsage;
    };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CompleteResult {
  text: string;
  citations: string[];
  usedRealApi: boolean;
  classification: Classification;
  provider: string;
  model: string;
  usage?: TokenUsage;
}

export interface ProviderArgs {
  messages: ChatTurn[];
  system: string;
  classification: Classification;
  model: string;
  maxTokens: number;
  /** Constrain output to valid JSON (Ollama `format:"json"`). */
  json?: boolean;
}

export interface ProviderImpl {
  readonly name: "anthropic" | "openrouter" | "local";
  available(): boolean;
  unavailableReason(): string;
  stream(args: ProviderArgs): AsyncGenerator<StreamChunk, void, unknown>;
  complete(args: ProviderArgs): Promise<CompleteResult>;
}
