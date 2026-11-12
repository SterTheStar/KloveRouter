import { assertSafeRemoteUrl } from "./ssrf";
import { upstreamProviderHeaders } from "./provider-headers";
import { isOpenAICompatibleProtocol } from "./provider-appearance";
import type { ModelCapabilities } from "./model.service";
import { isImageModel, isTtsModel, isVideoModel } from "./model-type";

export type MediaModality = "image" | "tts" | "video";

export function isMediaOnlyModel(model: {
  model_id: string;
  model_type?: string | null;
  capabilities?: Partial<ModelCapabilities> | null;
  media_settings?: any;
}): MediaModality | null {
  if (isImageModel(model)) return "image";
  if (isTtsModel(model)) return "tts";
  if (isVideoModel(model)) return "video";
  return null;
}

function resolveEndpoint(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const versioned = /\/v1$/i.test(base) ? base : `${base}/v1`;
  return `${versioned}/${path.replace(/^\/+/, "")}`;
}

export async function testMediaModel(
  provider: { base_url: string; protocol: string; custom_headers?: unknown },
  model: { model_id: string; capabilities?: Partial<ModelCapabilities> | null; media_settings?: any },
  credentialSecret: string,
  modality: MediaModality,
): Promise<{ reply: string }> {
  if (!isOpenAICompatibleProtocol(provider.protocol)) {
    throw new Error(`Provider does not expose an OpenAI-compatible media interface for ${modality}`);
  }

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${credentialSecret}`,
    Accept: "application/json",
  };

  if (modality === "image") {
    const url = resolveEndpoint(provider.base_url, "images/generations");
    await assertSafeRemoteUrl(url);
    const headers = upstreamProviderHeaders(provider as any, {
      ...authHeaders,
      "Content-Type": "application/json",
    });

    const body = {
      model: model.model_id,
      prompt: "A simple colorful dot on plain background",
      n: 1,
      size: model.media_settings?.image?.size || "1024x1024",
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error?.message || `Upstream returned HTTP ${res.status}`;
      throw new Error(err);
    }
    return { reply: "Image generated successfully" };
  }

  if (modality === "tts") {
    const url = resolveEndpoint(provider.base_url, "audio/speech");
    await assertSafeRemoteUrl(url);
    const headers = upstreamProviderHeaders(provider as any, {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "*/*",
    });

    const body = {
      model: model.model_id,
      input: "Hello from Saturn Router",
      voice: model.media_settings?.text_to_speech?.voice || "alloy",
      response_format: model.media_settings?.text_to_speech?.response_format || "mp3",
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const err = data?.error?.message || `Upstream returned HTTP ${res.status}`;
      throw new Error(err);
    }
    return { reply: "Speech synthesized successfully" };
  }

  if (modality === "video") {
    const url = resolveEndpoint(provider.base_url, "videos");
    await assertSafeRemoteUrl(url);
    const headers = upstreamProviderHeaders(provider as any, authHeaders);

    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => null);
      const err = data?.error?.message || `Upstream returned HTTP ${res.status}`;
      throw new Error(err);
    }
    return { reply: "Video generation endpoint verified" };
  }

  throw new Error(`Unsupported media modality: ${modality}`);
}
