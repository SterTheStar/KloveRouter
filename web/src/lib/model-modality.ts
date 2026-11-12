import type { ModelCapabilities, ModelType } from "../types";

export type ModelCategory = "chat" | "image" | "tts" | "stt" | "video" | "embedding";

export type CategorizedModel = {
  model_id?: string;
  id?: string;
  display_name?: string | null;
  model_type?: ModelType;
  input_modalities?: string[];
  output_modalities?: string[];
  capabilities?: Partial<ModelCapabilities>;
  media_settings?: Record<string, unknown>;
};

const categoryInfo: Record<ModelCategory, { label: string; shortLabel: string }> = {
  chat: { label: "Chat & LLM", shortLabel: "Chat" },
  image: { label: "Image Generation", shortLabel: "Image" },
  tts: { label: "Text to speech", shortLabel: "TTS" },
  stt: { label: "Speech to text", shortLabel: "STT" },
  video: { label: "Video Generation", shortLabel: "Video" },
  embedding: { label: "Text Embedding", shortLabel: "Embedding" },
};

const imagePattern = /(?:image[-_ ]?(?:gen|generation|create|edit|variation)|text[-_ ]?to[-_ ]?image|t2i|dall[-_ ]?e|gpt[-_ ]?image|\bimagen(?:[-_ ]?\d)?\b|\bflux\b|stable[-_ ]?diffusion|sdxl|sd[-_ ]?3|ideogram|recraft|midjourney|bria|aura[-_ ]?flow)/i;
const ttsPattern = /(?:text[-_ ]?to[-_ ]?speech|\btts\b|speech[-_ ]?(?:generation|synthesis)|voice[-_ ]?(?:gen|generation)|voxtral(?:[-_ ]?.*)?tts|eleven(?:labs)?|cartesia|playht|kokoro|chatterbox)/i;
const sttPattern = /(?:speech[-_ ]?to[-_ ]?text|\bstt\b|audio[-_ ]?(?:transcription|transcribe)|audio[-_ ]?translation|\bwhisper\b|\bnova[-_ ]?2\b)/i;
const videoPattern = /(?:video[-_ ]?(?:gen|generation|create)|text[-_ ]?to[-_ ]?video|t2v|image[-_ ]?to[-_ ]?video|i2v|\bsora\b|\bveo\b|runway|kling|seedance|hailuo|wan[-_ ]?video|luma|cogvideo|pika|gen-3|hunyuan[-_ ]?video)/i;
const embeddingPattern = /(?:text[-_ ]?embedding|dense[-_ ]?vector|\bembedding\b|\bembeddings\b|\bbge\b|\bvoyage\b|nomic[-_ ]?embed|cohere[-_ ]?embed)/i;

export function modelCategories(model: CategorizedModel): ModelCategory[] {
  // If canonical model_type is explicitly set, use it directly
  if (model.model_type) {
    return [model.model_type];
  }

  const identity = `${model.model_id ?? model.id ?? ""} ${model.display_name ?? ""}`.toLowerCase();
  const capabilities = model.capabilities ?? {};
  const isChatModel = capabilities.reasoning === true || capabilities.tools === true || capabilities.streaming === true;

  const image = capabilities.image_generation === true || (capabilities.image_generation !== false && !isChatModel && imagePattern.test(identity));
  const tts = capabilities.text_to_speech === true || (capabilities.text_to_speech !== false && !isChatModel && ttsPattern.test(identity));
  const video = capabilities.video_generation === true || (capabilities.video_generation !== false && !isChatModel && videoPattern.test(identity));
  const stt = !isChatModel && sttPattern.test(identity);
  const embedding = !isChatModel && embeddingPattern.test(identity);

  const result: ModelCategory[] = [];
  if (image) result.push("image");
  if (tts) result.push("tts");
  if (video) result.push("video");
  if (stt) result.push("stt");
  if (embedding) result.push("embedding");

  if (!result.length || isChatModel || capabilities.vision === true) {
    if (!result.includes("chat")) result.unshift("chat");
  }

  return result;
}

export function modelCategoryLabel(category: ModelCategory) {
  return categoryInfo[category]?.label ?? category;
}

export function modelCategoryBadge(category: ModelCategory) {
  return categoryInfo[category]?.shortLabel ?? category;
}
