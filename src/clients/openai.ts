import OpenAI from "openai";
import type { Provider } from "../services/provider.service";

export function createOpenAIClient(provider: Provider): OpenAI {
  return new OpenAI({
    baseURL: provider.base_url,
    apiKey: provider.api_key,
  });
}

export function parseModelName(
  model: string
): { providerName: string; modelId: string } | null {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1) return null;
  return {
    providerName: model.slice(0, slashIndex),
    modelId: model.slice(slashIndex + 1),
  };
}
