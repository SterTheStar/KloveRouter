import type { ModelCapabilities } from "../types";

export type ModelCategory = "chat" | "image" | "tts" | "video";
export type CategorizedModel = {
  model_id?: string;
  id?: string;
  display_name?: string | null;
  capabilities?: Partial<ModelCapabilities>;
};

const categoryInfo: Record<ModelCategory, { label: string; shortLabel: string }> = {
  chat: { label: "Chat", shortLabel: "Chat" },
  image: { label: "Image", shortLabel: "Image" },
  tts: { label: "Text to speech", shortLabel: "TTS" },
  video: { label: "Video", shortLabel: "Video" },
};

export function modelCategories(model: CategorizedModel): ModelCategory[] {
  const identity = `${model.model_id ?? model.id ?? ""} ${model.display_name ?? ""}`.toLowerCase();
  const capabilities = model.capabilities ?? {};
  const image = capabilities.image_generation === true || (capabilities.image_generation !== false && /(?:image[-_ ]?(?:gen|generation|create)|dall[-_ ]?e|gpt[-_ ]?image|imagen|flux|stable[-_ ]?diffusion|ideogram|recraft)/i.test(identity));
  const tts = capabilities.text_to_speech === true || (capabilities.text_to_speech !== false && /(?:text[-_ ]?to[-_ ]?speech|\btts\b|speech[-_ ]?(?:generation|synthesis)|voice[-_ ]?(?:gen|generation)|voxtral[-_ ]?.*tts)/i.test(identity));
  const video = capabilities.video_generation === true || (capabilities.video_generation !== false && /(?:video[-_ ]?(?:gen|generation|create)|\bsora\b|\bveo\b|runway|kling|seedance|hailuo|wan[-_ ]?video)/i.test(identity));
  const result: ModelCategory[] = [];
  if (!image && !tts && !video) result.push("chat");
  else if (capabilities.reasoning === true || capabilities.tools === true || capabilities.vision === true) result.push("chat");
  if (image) result.push("image");
  if (tts) result.push("tts");
  if (video) result.push("video");
  return result;
}

export function modelCategoryLabel(category: ModelCategory) {
  return categoryInfo[category].label;
}

export function modelCategoryBadge(category: ModelCategory) {
  return categoryInfo[category].shortLabel;
}
