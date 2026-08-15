export type TokenCountSource = "provider" | "tiktoken" | "fallback";

export type TokenCount = {
  prompt: number;
  completion: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  source: TokenCountSource;
  estimated: boolean;
};

export type TokenCounterContext = {
  provider?: string;
  model?: string;
};
