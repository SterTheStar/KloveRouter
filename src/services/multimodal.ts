import type { Model } from "./model.service";
import { assertSafeRemoteUrl } from "./ssrf";

const DATA_MEDIA_RE = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([a-z0-9+/=]+)$/i;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export class MultimodalRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultimodalRequestError";
  }
}

function imageParts(content: unknown): any[] {
  if (!Array.isArray(content)) return [];
  return content.filter((part) =>
    part && typeof part === "object" &&
    (part.type === "image_url" || part.type === "input_image"),
  );
}

export function multimodalParts(content: unknown): any[] {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => part && typeof part === "object" && typeof part.type === "string");
}

function capabilityForType(type: string): keyof Model["capabilities"] | null {
  if (type === "image_url" || type === "input_image" || type === "image") return "vision";
  if (type === "video_url" || type === "input_video" || type === "video") return "video";
  if (type === "input_audio" || type === "audio" || type === "audio_url" || type === "input_audio_buffer.append") return "audio_input";
  if (type === "file" || type === "input_file") return "attachments";
  return null;
}

const capabilityNames: Partial<Record<keyof Model["capabilities"], string>> = {
  vision: "images",
  video: "video",
  audio_input: "audio",
  audio_output: "audio output",
  attachments: "file attachments",
};

/**
 * Capability metadata is user-editable and frequently stale, so a mismatch is
 * never a hard block: the request is forwarded and the upstream decides. We
 * collect human-readable warnings instead to attach to the request log.
 * Structural problems (size, URL safety, malformed parts) still throw
 * MultimodalRequestError because forwarding them is pointless or unsafe.
 */
function capabilityWarning(capability: keyof Model["capabilities"], model: Model): string | null {
  if (model.capabilities[capability] !== false) return null;
  const name = capabilityNames[capability] ?? String(capability);
  return `Model "${model.model_id}" metadata indicates no support for ${name}; forwarding to the provider anyway`;
}

function mediaSource(part: any): string | null {
  const value = part?.image_url?.url ?? part?.image_url ?? part?.audio_url?.url ?? part?.audio_url ?? part?.video_url?.url ?? part?.video_url ?? part?.url ?? part?.file_data;
  return typeof value === "string" ? value : null;
}

function validateMediaPart(part: any, model: Model, warnings: string[]): void {
  const capability = capabilityForType(part.type);
  if (capability) {
    const warning = capabilityWarning(capability, model);
    if (warning) warnings.push(warning);
  }
  const file = part.file ?? part;
  const source = mediaSource(part) ?? (typeof file.file_data === "string" ? file.file_data : null);
  const dataUrl = source ? DATA_MEDIA_RE.exec(source) : null;
  const rawData = part.type === "input_audio" ? part.input_audio?.data : null;
  const data = dataUrl?.[2] ?? (typeof rawData === "string" ? rawData : null);
  if (["image_url", "input_image", "video_url", "input_video", "audio_url"].includes(part.type) && !source) {
    throw new MultimodalRequestError(`${part.type} part must contain a media URL`);
  }
  if (data && Math.floor(data.replace(/=+$/, "").length * 3 / 4) > MAX_MEDIA_BYTES) {
    throw new MultimodalRequestError("Base64 media exceeds the 20 MB limit");
  }
  if (source && !dataUrl && !/^https:\/\//i.test(source) && !rawData) {
    throw new MultimodalRequestError("Media URL must use HTTPS or a base64 data URL");
  }
  if (part.type === "input_audio" && (!part.input_audio?.format || !rawData)) {
    throw new MultimodalRequestError("input_audio requires base64 data and an audio format");
  }
  if (["video_url", "input_video"].includes(part.type) && source?.startsWith("data:")) {
    const mimeType = dataUrl?.[1].toLowerCase() ?? "";
    if (!mimeType.startsWith("video/")) throw new MultimodalRequestError("Video input must contain video media");
  }
  if (part.type === "audio_url" && source?.startsWith("data:")) {
    const mimeType = dataUrl?.[1].toLowerCase() ?? "";
    if (!mimeType.startsWith("audio/")) throw new MultimodalRequestError("Audio input must contain audio media");
  }
  if (["file", "input_file"].includes(part.type)) {
    const file = part.file ?? part;
    if (!file.file_id && !file.file_data)
      throw new MultimodalRequestError("File part requires file_id or file_data");
    if (file.file_data && typeof file.file_data === "string" && !DATA_MEDIA_RE.test(file.file_data))
      throw new MultimodalRequestError("File data must be a base64 data URL");
  }
}

export function imagePartsFromMessages(messages: any[] = []): any[] {
  return messages.flatMap((message) => imageParts(message?.content));
}

export function imageSource(part: any): string | null {
  const source = part?.image_url?.url ?? part?.image_url ?? part?.url;
  return typeof source === "string" ? source : null;
}

export function audioSource(part: any): { data: string; format: string } | null {
  const audio = part?.input_audio ?? part;
  if (typeof audio?.data === "string" && typeof audio?.format === "string")
    return { data: audio.data, format: audio.format };
  const url = part?.audio_url?.url ?? part?.audio_url ?? part?.url;
  if (typeof url === "string") {
    const match = url.match(/^data:audio\/([\w.+-]+);base64,(.+)$/i);
    if (match) return { data: match[2], format: match[1] };
  }
  return null;
}

function dataImageInfo(source: string) {
  const match = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const bytes = Math.floor((match[2].replace(/=+$/, "").length * 3) / 4);
  return { mimeType: match[1].toLowerCase(), data: match[2], bytes };
}

/**
 * Structural validation only. Capability mismatches are reported as warnings
 * (forwarded anyway) instead of throwing; structural problems throw
 * MultimodalRequestError. Returns the list of warnings for the request log.
 */
export function validateMultimodalRequest(body: any, model: Model): string[] {
  const warnings: string[] = [];
  const requestedModalities = Array.isArray(body?.modalities) ? body.modalities.map(String) : [];
  if (requestedModalities.includes("audio")) {
    const warning = capabilityWarning("audio_output", model);
    if (warning) warnings.push(warning);
  }
  const parts = (body?.messages ?? []).flatMap((message: any) => multimodalParts(message?.content));
  for (const part of parts) validateMediaPart(part, model, warnings);
  for (const message of body?.input ?? []) if (message && typeof message === "object") validateMediaPart(message, model, warnings);
  return [...new Set(warnings)];
}

export function openAIImageUrl(part: any): string | null {
  const source = imageSource(part);
  if (!source) return null;
  return source;
}

export function parseDataImage(source: string) {
  return dataImageInfo(source);
}

export function parseDataMedia(source: string) {
  const match = DATA_MEDIA_RE.exec(source);
  if (!match) return null;
  const bytes = Math.floor((match[2].replace(/=+$/, "").length * 3) / 4);
  return { mimeType: match[1].toLowerCase(), data: match[2], bytes };
}

export async function resolveImageData(source: string) {
  const embedded = parseDataMedia(source);
  if (embedded) return embedded;
  if (!/^https:\/\//i.test(source)) return null;
  let url = await assertSafeRemoteUrl(source);
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetch(url, { redirect: "manual" });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) throw new MultimodalRequestError("Image redirect missing location");
    url = await assertSafeRemoteUrl(new URL(location, url).toString());
    if (redirects === 3) throw new MultimodalRequestError("Too many image redirects");
  }
  if (!response) throw new MultimodalRequestError("Image download failed");
  if (!response.ok) throw new MultimodalRequestError(`Image download failed (${response.status})`);
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (!mimeType || !/^(image|audio|video)\//.test(mimeType)) throw new MultimodalRequestError("Remote media URL did not return image, audio or video content");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_MEDIA_BYTES) throw new MultimodalRequestError("Remote media exceeds the 20 MB limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new MultimodalRequestError("Remote media exceeds the 20 MB limit");
  return { mimeType, data: Buffer.from(bytes).toString("base64"), bytes: bytes.byteLength };
}

export const multimodalLimits = { maxImageBytes: MAX_MEDIA_BYTES, maxMediaBytes: MAX_MEDIA_BYTES };
