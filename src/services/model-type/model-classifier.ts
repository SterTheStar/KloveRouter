import type { ModelType, Modality } from "./model-type.types";
import { MODEL_TYPE_INFO, VALID_MODEL_TYPES } from "./model-type.types";

/**
 * Industry patterns for identifying generative media and embedding models by name or slug.
 * Updated with coverage of current and leading industry families (2024-2026).
 */
export const IMAGE_GENERATION_PATTERNS = [
  /(?:[-_ ]image[-_ ]|\bimage[-_ ]?(?:gen|generation|create|edit|variation|\d)|text[-_ ]?to[-_ ]?image|t2i)/i,
  /\b(?:dall[-_ ]?e|gpt[-_ ]?image)\b/i,
  /\b(?:imagen(?:[-_ ]?\d)?|imagen[-_ ]?3)\b/i,
  /\b(?:flux(?:[-_ ]?(?:schnell|dev|pro|ultra|1\.1|2))?)\b/i,
  /\b(?:stable[-_ ]?diffusion|sdxl|sd[-_ ]?3|stable[-_ ]?cascade)\b/i,
  /\b(?:ideogram(?:[-_ ]?v?\d)?|recraft(?:[-_ ]?v?\d)?|midjourney|bria|aura[-_ ]?flow)\b/i,
];

export const TTS_PATTERNS = [
  /(?:text[-_ ]?to[-_ ]?speech|\btts\b|speech[-_ ]?(?:generation|synthesis)|voice[-_ ]?(?:gen|generation))/i,
  /\b(?:tts[-_ ]?1(?:[-_ ]?hd)?|eleven(?:labs)?(?:[-_ ]\w+)?|cartesia|playht|kokoro(?:[-_ ]?82m)?|chatterbox)\b/i,
  /\b(?:voxtral(?:[-_ ]?.*)?tts)\b/i,
];

export const STT_PATTERNS = [
  /(?:speech[-_ ]?to[-_ ]?text|\bstt\b|audio[-_ ]?(?:transcription|transcribe)|audio[-_ ]?translation)/i,
  /\b(?:whisper(?:[-_ ]?(?:1|large|medium|small|base|tiny|distil))?)\b/i,
  /\b(?:nova[-_ ]?2|conformer|deepgram)\b/i,
];

export const VIDEO_GENERATION_PATTERNS = [
  /(?:[-_ ]video[-_ ]|\bvideo[-_ ]?(?:gen|generation|create|\d)|text[-_ ]?to[-_ ]?video|t2v|image[-_ ]?to[-_ ]?video|i2v)/i,
  /\b(?:sora(?:[-_ ]?turbo)?|veo(?:[-_ ]?2)?)\b/i,
  /\b(?:runway(?:[-_ ]?(?:gen[-_ ]?2|gen[-_ ]?3))?|kling(?:[-_ ]?v?\d)?|seedance)\b/i,
  /\b(?:hailuo|wan[-_ ]?video|luma(?:[-_ ]?dream[-_ ]?machine)?|cogvideo(?:[-_ ]?x)?|pika|hunyuan[-_ ]?video)\b/i,
];

export const EMBEDDING_PATTERNS = [
  /(?:text[-_ ]?embedding|dense[-_ ]?vector|\bembedding\b|\bembeddings\b)/i,
  /\b(?:text[-_ ]?embedding[-_ ]?(?:3[-_ ]?(?:small|large)|ada[-_ ]?002))\b/i,
  /\b(?:bge[-_ ]?(?:large|base|small|m3)|voyage(?:[-_ ]?(?:code|finance|law|\d))?)\b/i,
  /\b(?:nomic[-_ ]?embed|cohere[-_ ]?embed|all[-_ ]?minilm|e5[-_ ]?(?:large|base|small))\b/i,
];

export const SYSTEMONE_PATTERNS = [
  /\b(?:jev(?:[-_ ]?\d.*)?|systemone|system[-_ ]?1)\b/i,
  /(?:[-_ ]decision(?:[-_ ]?\d)?)\b/i,
];

export interface ClassificationInput {
  modelId: string;
  displayName?: string | null;
  declaredType?: string | null;
  mode?: string | null;
  apiFamilies?: string[];
  supportedGenerationMethods?: string[];
  architectureModality?: string | null;
  inputModalities?: string[];
  outputModalities?: string[];
  capabilities?: Record<string, boolean | null | undefined>;
  mediaSettings?: Record<string, unknown>;
}

export interface ClassificationResult {
  modelType: ModelType;
  inputModalities: Modality[];
  outputModalities: Modality[];
  inferredCapabilities: {
    vision?: boolean;
    audio_input?: boolean;
    audio_output?: boolean;
    video?: boolean;
    attachments?: boolean;
    image_generation?: boolean;
    text_to_speech?: boolean;
    video_generation?: boolean;
  };
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/**
 * Normalizes input modality list to unique valid modalities.
 */
export function normalizeModalities(modalities: unknown): Modality[] {
  if (!Array.isArray(modalities)) return [];
  const normalized = new Set<Modality>();
  for (const item of modalities) {
    const raw = String(item).toLowerCase().trim();
    if (raw.includes("text")) normalized.add("text");
    else if (raw.includes("image")) normalized.add("image");
    else if (raw.includes("audio") || raw.includes("speech") || raw.includes("voice")) normalized.add("audio");
    else if (raw.includes("video")) normalized.add("video");
    else if (raw.includes("file") || raw.includes("pdf") || raw.includes("doc")) normalized.add("file");
    else if (raw.includes("embed")) normalized.add("embedding");
  }
  return [...normalized];
}

/**
 * Classifies a model into its primary canonical type and resolves its input/output modalities.
 */
export function classifyModel(input: ClassificationInput): ClassificationResult {
  const modelId = input.modelId.trim();
  const identity = `${modelId} ${input.displayName ?? ""}`.trim();
  const mode = input.mode?.toLowerCase()?.trim() ?? "";
  const caps = input.capabilities ?? {};
  const mediaSettings = input.mediaSettings ?? {};

  // 1. Explicit declared type if valid (e.g. OpenCode type, Together type, Saturn model_type)
  const declared = (input.declaredType?.toLowerCase()?.trim()) as ModelType | undefined;
  let resolvedType: ModelType | null = null;

  if (declared && VALID_MODEL_TYPES.includes(declared)) {
    resolvedType = declared;
  }

  // 2. OpenRouter architecture.modality (e.g. "text->image", "text->embedding", "text->audio")
  if (!resolvedType && input.architectureModality) {
    const arch = input.architectureModality.toLowerCase().trim();
    if (arch.endsWith("->image") || arch.includes("+image->image")) resolvedType = "image";
    else if (arch.endsWith("->audio")) resolvedType = "tts";
    else if (arch.endsWith("->video")) resolvedType = "video";
    else if (arch.endsWith("->embedding") || arch.includes("embedding")) resolvedType = "embedding";
  }

  // 3. Provider official "api" dictionary (e.g. OpenCode {"systemone": {...}}, {"chat-completions": {...}})
  if (!resolvedType && input.apiFamilies?.length) {
    const apis = input.apiFamilies.map((s) => s.toLowerCase());
    if (apis.some((a) => a.includes("systemone"))) resolvedType = "systemone";
    else if (apis.some((a) => a.includes("images") || a.includes("image-generations") || a.includes("t2i"))) resolvedType = "image";
    else if (apis.some((a) => a.includes("embeddings") || a.includes("embedding"))) resolvedType = "embedding";
    else if (apis.some((a) => a.includes("speech") || a.includes("tts"))) resolvedType = "tts";
    else if (apis.some((a) => a.includes("video"))) resolvedType = "video";
    else if (apis.some((a) => a.includes("chat") || a.includes("messages") || a.includes("responses"))) resolvedType = "chat";
  }

  // 4. Google Gemini supportedGenerationMethods (e.g. ["embedContent"], ["generateImages"])
  if (!resolvedType && input.supportedGenerationMethods?.length) {
    const methods = input.supportedGenerationMethods;
    if (methods.includes("embedContent")) resolvedType = "embedding";
    else if (methods.includes("generateImages")) resolvedType = "image";
    else if (methods.includes("generateContent")) resolvedType = "chat";
  }

  // 5. LiteLLM / Provider upstream "mode" hint
  if (!resolvedType) {
    if (mode === "image_generation") resolvedType = "image";
    else if (mode === "audio_speech" || mode === "tts") resolvedType = "tts";
    else if (mode === "audio_transcription" || mode === "stt") resolvedType = "stt";
    else if (mode === "video_generation") resolvedType = "video";
    else if (mode === "embedding" || mode === "embeddings") resolvedType = "embedding";
    else if (mode === "systemone") resolvedType = "systemone";
    else if (mode === "chat" || mode === "completion") resolvedType = "chat";
  }

  // 6. Media settings hints (if media settings exist with non-empty configuration)
  if (!resolvedType) {
    if (caps.image_generation === true || (Boolean(mediaSettings.image) && Object.keys(mediaSettings.image as object).length > 0)) {
      resolvedType = "image";
    } else if (caps.text_to_speech === true || (Boolean(mediaSettings.text_to_speech) && Object.keys(mediaSettings.text_to_speech as object).length > 0)) {
      resolvedType = "tts";
    } else if (caps.video_generation === true || (Boolean(mediaSettings.video) && Object.keys(mediaSettings.video as object).length > 0)) {
      resolvedType = "video";
    }
  }

  // 7. Pattern matching on model ID and display name (fallback quando o provedor não declara metadados)
  if (!resolvedType) {
    if (matchesAny(identity, EMBEDDING_PATTERNS)) resolvedType = "embedding";
    else if (matchesAny(identity, SYSTEMONE_PATTERNS)) resolvedType = "systemone";
    else if (matchesAny(identity, IMAGE_GENERATION_PATTERNS)) resolvedType = "image";
    else if (matchesAny(identity, TTS_PATTERNS)) resolvedType = "tts";
    else if (matchesAny(identity, STT_PATTERNS)) resolvedType = "stt";
    else if (matchesAny(identity, VIDEO_GENERATION_PATTERNS)) resolvedType = "video";
  }

  // 8. Default to chat (conversational LLM)
  if (!resolvedType) {
    resolvedType = "chat";
  }

  // Determine input and output modalities based on type and input signals
  const declaredInputs = normalizeModalities(input.inputModalities);
  const declaredOutputs = normalizeModalities(input.outputModalities);

  const defaultInputs = [...MODEL_TYPE_INFO[resolvedType].defaultInputModalities];
  const defaultOutputs = [...MODEL_TYPE_INFO[resolvedType].defaultOutputModalities];

  const inputSet = new Set<Modality>(declaredInputs.length ? declaredInputs : defaultInputs);
  const outputSet = new Set<Modality>(declaredOutputs.length ? declaredOutputs : defaultOutputs);

  // Inferred capabilities for chat models with multimodal inputs
  const inferredCapabilities: ClassificationResult["inferredCapabilities"] = {};

  if (resolvedType === "chat") {
    if (caps.vision === true || inputSet.has("image")) {
      inputSet.add("image");
      inferredCapabilities.vision = true;
    }
    if (caps.audio_input === true || inputSet.has("audio")) {
      inputSet.add("audio");
      inferredCapabilities.audio_input = true;
    }
    if (caps.video === true || inputSet.has("video")) {
      inputSet.add("video");
      inferredCapabilities.video = true;
    }
    if (caps.attachments === true || inputSet.has("file")) {
      inputSet.add("file");
      inferredCapabilities.attachments = true;
    }
    if (caps.audio_output === true || outputSet.has("audio")) {
      outputSet.add("audio");
      inferredCapabilities.audio_output = true;
    }
  } else if (resolvedType === "image") {
    inferredCapabilities.image_generation = true;
  } else if (resolvedType === "tts") {
    inferredCapabilities.text_to_speech = true;
  } else if (resolvedType === "video") {
    inferredCapabilities.video_generation = true;
  }

  // Always guarantee 'text' input for chat
  if (resolvedType === "chat") {
    inputSet.add("text");
    outputSet.add("text");
  }

  return {
    modelType: resolvedType,
    inputModalities: [...inputSet],
    outputModalities: [...outputSet],
    inferredCapabilities,
  };
}

/**
 * Helpers for quick, canonical model type inspections across the backend and proxy.
 */
export function isChatModel(model: { model_type?: string | null; capabilities?: any; model_id?: string }): boolean {
  if (model.model_type) return model.model_type === "chat";
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
  }).modelType === "chat";
}

export function isImageModel(model: { model_type?: string | null; capabilities?: any; model_id?: string; media_settings?: any }): boolean {
  if (model.model_type) return model.model_type === "image";
  if (model.capabilities?.image_generation === true) return true;
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
    mediaSettings: model.media_settings,
  }).modelType === "image";
}

export function isTtsModel(model: { model_type?: string | null; capabilities?: any; model_id?: string; media_settings?: any }): boolean {
  if (model.model_type) return model.model_type === "tts";
  if (model.capabilities?.text_to_speech === true) return true;
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
    mediaSettings: model.media_settings,
  }).modelType === "tts";
}

export function isSttModel(model: { model_type?: string | null; capabilities?: any; model_id?: string }): boolean {
  if (model.model_type) return model.model_type === "stt";
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
  }).modelType === "stt";
}

export function isVideoModel(model: { model_type?: string | null; capabilities?: any; model_id?: string; media_settings?: any }): boolean {
  if (model.model_type) return model.model_type === "video";
  if (model.capabilities?.video_generation === true) return true;
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
    mediaSettings: model.media_settings,
  }).modelType === "video";
}

export function isEmbeddingModel(model: { model_type?: string | null; capabilities?: any; model_id?: string }): boolean {
  if (model.model_type) return model.model_type === "embedding";
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
  }).modelType === "embedding";
}

export function isSystemOneModel(model: { model_type?: string | null; capabilities?: any; model_id?: string }): boolean {
  if (model.model_type) return model.model_type === "systemone";
  return classifyModel({
    modelId: model.model_id ?? "",
    capabilities: model.capabilities,
  }).modelType === "systemone";
}

export function isMediaModel(model: { model_type?: string | null; capabilities?: any; model_id?: string; media_settings?: any }): boolean {
  return isImageModel(model) || isTtsModel(model) || isVideoModel(model);
}
