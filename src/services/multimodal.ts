import type { Model } from "./model.service";

const DATA_IMAGE_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i;
const REMOTE_IMAGE_RE = /^https:\/\//i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

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

export function imagePartsFromMessages(messages: any[] = []): any[] {
  return messages.flatMap((message) => imageParts(message?.content));
}

export function imageSource(part: any): string | null {
  const source = part?.image_url?.url ?? part?.image_url ?? part?.url;
  return typeof source === "string" ? source : null;
}

function dataImageInfo(source: string) {
  const match = source.match(DATA_IMAGE_RE);
  if (!match) return null;
  const bytes = Math.floor((match[2].replace(/=+$/, "").length * 3) / 4);
  return { mimeType: match[1].toLowerCase(), data: match[2], bytes };
}

export function validateMultimodalRequest(body: any, model: Model): void {
  const parts = imagePartsFromMessages(body?.messages);
  if (!parts.length) return;
  if (model.capabilities.vision === false)
    throw new MultimodalRequestError(`Model "${model.model_id}" does not support images`);
  for (const part of parts) {
    const source = imageSource(part);
    if (!source)
      throw new MultimodalRequestError("Image part must contain an image URL");
    const data = dataImageInfo(source);
    if (!data && !REMOTE_IMAGE_RE.test(source))
      throw new MultimodalRequestError("Image URL must be an HTTPS URL or a base64 data URL");
    if (data && data.bytes > MAX_IMAGE_BYTES)
      throw new MultimodalRequestError("Base64 image exceeds the 20 MB limit");
  }
}

export function openAIImageUrl(part: any): string | null {
  const source = imageSource(part);
  if (!source) return null;
  return source;
}

export function parseDataImage(source: string) {
  return dataImageInfo(source);
}

export async function resolveImageData(source: string) {
  const embedded = dataImageInfo(source);
  if (embedded) return embedded;
  if (!REMOTE_IMAGE_RE.test(source)) return null;
  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok) throw new MultimodalRequestError(`Image download failed (${response.status})`);
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (!mimeType?.startsWith("image/")) throw new MultimodalRequestError("Remote image URL did not return an image");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES) throw new MultimodalRequestError("Remote image exceeds the 20 MB limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new MultimodalRequestError("Remote image exceeds the 20 MB limit");
  return { mimeType, data: Buffer.from(bytes).toString("base64"), bytes: bytes.byteLength };
}

export const multimodalLimits = { maxImageBytes: MAX_IMAGE_BYTES };
