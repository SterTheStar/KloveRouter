export type EncodingResolution = {
  encoding: "cl100k_base";
  estimated: boolean;
};

const EXACT_OPENAI = new Set([
  "gpt-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "text-embedding-ada-002",
]);

export function resolveEncoding(model = "", provider = ""): EncodingResolution {
  const normalized = model.toLowerCase();
  const providerName = provider.toLowerCase();
  const exact = EXACT_OPENAI.has(normalized) || normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3");
  return {
    encoding: "cl100k_base",
    estimated: !exact || providerName === "qwen" || providerName === "conol",
  };
}
