export type ModelType =
  | "chat"
  | "image"
  | "tts"
  | "stt"
  | "video"
  | "embedding"
  | "systemone";

export type Modality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "embedding";

export interface ModelTypeDefinition {
  type: ModelType;
  label: string;
  shortLabel: string;
  description: string;
  defaultInputModalities: Modality[];
  defaultOutputModalities: Modality[];
  targetEndpoint: string;
}

export const VALID_MODEL_TYPES: ModelType[] = [
  "chat",
  "image",
  "tts",
  "stt",
  "video",
  "embedding",
  "systemone",
];

export const VALID_MODALITIES: Modality[] = [
  "text",
  "image",
  "audio",
  "video",
  "file",
  "embedding",
];

export const MODEL_TYPE_INFO: Record<ModelType, ModelTypeDefinition> = {
  chat: {
    type: "chat",
    label: "Chat & LLM",
    shortLabel: "Chat",
    description: "Conversational language models, reasoning, and multimodal understanding",
    defaultInputModalities: ["text"],
    defaultOutputModalities: ["text"],
    targetEndpoint: "/v1/chat/completions",
  },
  image: {
    type: "image",
    label: "Image Generation",
    shortLabel: "Image",
    description: "Text-to-image synthesis, image editing, and variations",
    defaultInputModalities: ["text", "image"],
    defaultOutputModalities: ["image"],
    targetEndpoint: "/v1/images/generations",
  },
  tts: {
    type: "tts",
    label: "Text-to-Speech (TTS)",
    shortLabel: "TTS",
    description: "Voice and audio speech synthesis from text",
    defaultInputModalities: ["text"],
    defaultOutputModalities: ["audio"],
    targetEndpoint: "/v1/audio/speech",
  },
  stt: {
    type: "stt",
    label: "Speech-to-Text (STT)",
    shortLabel: "STT",
    description: "Audio transcription and translation into text",
    defaultInputModalities: ["audio"],
    defaultOutputModalities: ["text"],
    targetEndpoint: "/v1/audio/transcriptions",
  },
  video: {
    type: "video",
    label: "Video Generation",
    shortLabel: "Video",
    description: "Text-to-video and image-to-video motion generation",
    defaultInputModalities: ["text", "image"],
    defaultOutputModalities: ["video"],
    targetEndpoint: "/v1/videos",
  },
  embedding: {
    type: "embedding",
    label: "Text Embeddings",
    shortLabel: "Embedding",
    description: "Dense vector representations for semantic search and RAG",
    defaultInputModalities: ["text"],
    defaultOutputModalities: ["embedding"],
    targetEndpoint: "/v1/embeddings",
  },
  systemone: {
    type: "systemone",
    label: "SystemOne Decision",
    shortLabel: "System1",
    description: "Fast, structured decision evaluations and probabilities (Jev / Decision models)",
    defaultInputModalities: ["text"],
    defaultOutputModalities: ["text"],
    targetEndpoint: "/v1/systemone",
  },
};
