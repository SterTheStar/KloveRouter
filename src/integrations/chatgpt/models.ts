import { chatgptRequestHeaders } from "./auth";
import { DEFAULT_CHATGPT_BASE_URL, normalizeChatGptBaseUrl } from "./client";

export const FALLBACK_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"].map(
  (id) => ({ id, object: "model", owned_by: "openai" }),
);

export async function chatgptModels(credential?: unknown, options: { strict?: boolean; baseUrl?: string } = {}) {
  try {
    const response = await fetch(`${normalizeChatGptBaseUrl(options.baseUrl || DEFAULT_CHATGPT_BASE_URL)}/models`, {
      headers: await chatgptRequestHeaders(credential, { accept: "application/json" }),
    });
    const data: any = await response.json().catch(() => null);
    const values = Array.isArray(data) ? data : data?.models ?? data?.data;
    if (!response.ok || !Array.isArray(values) || !values.length)
      throw new Error("empty models");
    return values
      .map((item: any) => ({
        ...item,
        id: item.id ?? item.slug ?? item.model,
        object: "model",
        owned_by: item.owned_by ?? "openai",
      }))
      .filter((item: any) => item.id);
  } catch (error) {
    if (options.strict) throw error;
    return FALLBACK_MODELS;
  }
}
