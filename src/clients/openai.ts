import OpenAI from "openai";
import type { Provider } from "../services/provider.service";

export function createOpenAIClient(
  provider: Provider,
  apiKey = provider.api_key,
): OpenAI {
  return new OpenAI({
    baseURL: provider.base_url,
    apiKey,
  });
}

export function parseModelName(
  model: string,
): { providerName: string; modelId: string } | null {
  if (typeof model !== "string" || !model || /[\s\p{Cc}]/u.test(model)) return null;
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex === model.length - 1) return null;
  const providerName = model.slice(0, slashIndex);
  const modelId = model.slice(slashIndex + 1);
  if (modelId.startsWith("/") || modelId.endsWith("/")) return null;
  return { providerName, modelId };
}
