import { faviconForEndpoint, protocolIcon } from "./provider-icons";

export const PRESET_AVATAR_BASE = "/api/media/avatars/presets";

export type ProviderTemplate = {
  id: string;
  protocol: "openai" | "openai-responses" | "antigravity" | "anthropic" | "codex" | "chatgpt" | "freebuff" | "qwen" | "atomesus" | "conol" | "perch" | "openfree" | "deepai";
  name: string;
  description: string;
  logo: string;
  placeholder: string;
  preset: boolean;
};

/** Static logo for a template: bundled preset avatar, brand icon, or endpoint favicon. */
function templateLogo(protocol: string, endpoint: string, bundled?: string): string {
  return bundled || protocolIcon(protocol) || faviconForEndpoint(endpoint) || `${PRESET_AVATAR_BASE}/openai.svg`;
}

const openAiCompatiblePresets = [
  ["blueminds", "Blueminds", "https://api.bluesminds.com/v1"],
  ["agnes", "Agnes", "https://apihub.agnes-ai.com/v1"],
  ["orcarouter", "OrcaRouter", "https://api.orcarouter.ai/v1"],
  ["nousportal", "NousPortal", "https://inference-api.nousresearch.com/v1"],
  ["mistral", "Mistral", "https://api.mistral.ai/v1"],
  ["nvidia-nim", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1"],
  ["openrouter", "OpenRouter", "https://openrouter.ai/api/v1"],
  ["perplexity", "Perplexity", "https://api.perplexity.ai"],
  ["lambda-ai", "Lambda AI", "https://api.lambdal.ai/v1"],
  ["chutes", "Chutes", "https://llm.chutes.ai/v1"],
  ["scaleway", "Scaleway", "https://api.scaleway.ai/v1"],
  ["ovhcloud-ai", "OVHcloud AI", "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"],
  ["lm-studio", "LM Studio", "http://localhost:1234/v1"],
  ["vllm", "vLLM", "http://localhost:8000/v1"],
  ["tokenrouter", "TokenRouter", "https://api.tokenrouter.com/v1"],
  ["tokenharbor", "TokenHarbor", "https://tokenharbor.ai/v1"],
  ["hcnsec", "HCNSEC", "https://api.hcnsec.cn/v1"],
  ["inferx", "InferX", "https://model.inferx.net/endpoints/v1"],
  ["xkiro", "Xkiro", "https://api.xkiro.com/v1"],
  ["together-ai", "Together AI", "https://api.together.xyz/v1"],
  ["fireworks-ai", "Fireworks AI", "https://api.fireworks.ai/inference/v1"],
  ["groq", "Groq", "https://api.groq.com/openai/v1"],
  ["cerebras", "Cerebras", "https://api.cerebras.ai/v1"],
  [
    "google-ai-studio",
    "Google AI Studio (OpenAI Compatible)",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
  ],
  ["deepseek", "DeepSeek", "https://api.deepseek.com/v1"],
  ["moonshot-kimi", "Moonshot AI (Kimi)", "https://api.moonshot.ai/v1"],
  ["xai", "xAI", "https://api.x.ai/v1"],
  ["cohere", "Cohere", "https://api.cohere.com/v1"],
  ["ai21", "AI21", "https://api.ai21.com/studio/v1"],
  ["minimax", "MiniMax", "https://api.minimax.chat/v1"],
  ["stepfun", "StepFun", "https://api.stepfun.ai/v1"],
  [
    "tencent-hunyuan",
    "Tencent Hunyuan",
    "https://api.hunyuan.cloud.tencent.com/v1",
  ],
  ["zhipu-glm", "Zhipu AI (GLM)", "https://open.bigmodel.cn/api/paas/v4"],
  ["nebius-ai-studio", "Nebius AI Studio", "https://api.studio.nebius.ai/v1"],
  ["novita-ai", "Novita AI", "https://api.novita.ai/v3/openai"],
  ["deepinfra", "DeepInfra", "https://api.deepinfra.com/v1/openai"],
  ["siliconflow", "SiliconFlow", "https://api.siliconflow.cn/v1"],
  ["parasail", "Parasail", "https://api.parasail.io/v1"],
  ["friendli-ai", "FriendliAI", "https://api.friendli.ai/serverless/v1"],
  ["sambanova", "SambaNova", "https://api.sambanova.ai/v1"],
  ["baseten", "Baseten", "https://inference.baseten.co/v1"],
  ["replicate", "Replicate", "https://api.replicate.com/v1"],
  [
    "hugging-face",
    "Hugging Face Inference",
    "https://router.huggingface.co/v1",
  ],
  ["requesty", "Requesty", "https://router.requesty.ai/v1"],
  ["portkey", "Portkey AI Gateway", "https://api.portkey.ai/v1"],
  ["opencode", "OpenCode Zen", "https://opencode.ai/zen/v1"],
  ["opencode-zen-go", "Opencode Go", "https://opencode.ai/zen/go/v1"],
  ["qwen-cloud", "Qwen Cloud (DashScope)", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"],
] as const;

const presetLogos: Record<string, string> = {
  agnes: `${PRESET_AVATAR_BASE}/agnes.png`,
  blueminds: `${PRESET_AVATAR_BASE}/blueminds.ico`,
  orcarouter: `${PRESET_AVATAR_BASE}/orcarouter.ico`,
  nousportal: `${PRESET_AVATAR_BASE}/nousportal.png`,
  mistral: `${PRESET_AVATAR_BASE}/mistral.ico`,
  "nvidia-nim": `${PRESET_AVATAR_BASE}/nvidia.png`,
  openrouter: `${PRESET_AVATAR_BASE}/openrouter.ico`,
  perplexity: `${PRESET_AVATAR_BASE}/perplexity.ico`,
  "lambda-ai": `${PRESET_AVATAR_BASE}/lambda-ai.svg`,
  chutes: `${PRESET_AVATAR_BASE}/chutes.svg`,
  scaleway: `${PRESET_AVATAR_BASE}/scaleway.svg`,
  tokenrouter: `${PRESET_AVATAR_BASE}/tokenrouter.svg`,
  "ovhcloud-ai": `${PRESET_AVATAR_BASE}/ovhcloud-ai.ico`,
  "lm-studio": `${PRESET_AVATAR_BASE}/lm-studio.ico`,
  vllm: `${PRESET_AVATAR_BASE}/vllm.ico`,
  tokenharbor: `${PRESET_AVATAR_BASE}/tokenharbor.ico`,
  hcnsec: `${PRESET_AVATAR_BASE}/hcnsec.ico`,
  inferx: `${PRESET_AVATAR_BASE}/inferx.ico`,
  xkiro: `${PRESET_AVATAR_BASE}/xkiro.ico`,
  "together-ai": `${PRESET_AVATAR_BASE}/together.png`,
  "fireworks-ai": `${PRESET_AVATAR_BASE}/fireworks.jpg`,
  groq: `${PRESET_AVATAR_BASE}/groq.ico`,
  cerebras: `${PRESET_AVATAR_BASE}/cerebras.png`,
  "google-ai-studio": `${PRESET_AVATAR_BASE}/google-ai-studio.png`,
  deepseek: `${PRESET_AVATAR_BASE}/deepseek.ico`,
  xai: `${PRESET_AVATAR_BASE}/xai.ico`,
  cohere: `${PRESET_AVATAR_BASE}/cohere.ico`,
  ai21: `${PRESET_AVATAR_BASE}/ai21.png`,
  "moonshot-kimi": `${PRESET_AVATAR_BASE}/moonshot.png`,
  minimax: `${PRESET_AVATAR_BASE}/minimax.png`,
  stepfun: `${PRESET_AVATAR_BASE}/stepfun.png`,
  "tencent-hunyuan": `${PRESET_AVATAR_BASE}/tencent-hunyuan.png`,
  "zhipu-glm": `${PRESET_AVATAR_BASE}/zhipu.png`,
  "nebius-ai-studio": `${PRESET_AVATAR_BASE}/nebius.png`,
  "novita-ai": `${PRESET_AVATAR_BASE}/novita.ico`,
  deepinfra: `${PRESET_AVATAR_BASE}/deepinfra.ico`,
  siliconflow: `${PRESET_AVATAR_BASE}/siliconflow.ico`,
  parasail: `${PRESET_AVATAR_BASE}/parasail.svg`,
  "friendli-ai": `${PRESET_AVATAR_BASE}/friendli.ico`,
  sambanova: `${PRESET_AVATAR_BASE}/sambanova.ico`,
  baseten: `${PRESET_AVATAR_BASE}/baseten.ico`,
  replicate: `${PRESET_AVATAR_BASE}/replicate.png`,
  "hugging-face": `${PRESET_AVATAR_BASE}/huggingface.ico`,
  requesty: `${PRESET_AVATAR_BASE}/requesty.ico`,
  portkey: `${PRESET_AVATAR_BASE}/portkey.png`,
  opencode: `${PRESET_AVATAR_BASE}/opencode.png`,
  "qwen-cloud": protocolIcon("qwen")!,
};

const providerDescriptions: Record<string, string> = {
  openai: "OpenAI-compatible Chat Completions API (POST /v1/chat/completions).",
  openaiResponses: "OpenAI-compatible Responses API (POST /v1/responses).",
  antigravity:
    "Google account access to Gemini models through Klove's Antigravity integration.",
  anthropic:
    "Anthropic's native Messages API for Claude models, reasoning, and tool use.",
  codex:
    "ChatGPT OAuth access for OpenAI Codex models with account-based usage limits.",
  chatgpt:
    "Authorized ChatGPT session access through the ChatGPT backend API. Use only credentials you are permitted to use.",
  freebuff:
    "Free Codebuff/Freebuff models through a token-authenticated OpenAI-compatible gateway.",
  openfree:
    "OpenCode's free models through the authenticated OpenCode CLI on the KloveRouter host. No API key is required.",
  qwen:
    "Qwen AI models through an OpenAI-compatible gateway. Uses a Bearer token extracted from chat.qwen.ai.",
  atomesus:
    "Atomesus models with effort controls, persistent upstream sessions, streaming, and encrypted token storage.",
  conol:
    "Conol.ai agents with account and browser-cookie authentication. Credentials are stored encrypted.",
  perch:
    "Perch AI models through a CLI session. Paste a session JSON/access token or use the session created by `perch login` on the KloveRouter host. Direct API use may violate Perch's terms.",
  blueminds:
    "An OpenAI-compatible gateway for accessing hosted language models through BlueMinds.",
  agnes:
    "An AI model hub exposing hosted models through an OpenAI-compatible API.",
  orcarouter:
    "A model routing platform that provides access to multiple providers through one API.",
  nousportal:
    "Nous Research's inference endpoint for open models and Nous-developed releases.",
  mistral:
    "Mistral AI's API for efficient open and commercial models, including multilingual and code models.",
  "nvidia-nim":
    "NVIDIA-hosted NIM endpoints for production inference across language and multimodal models.",
  openrouter:
    "A unified gateway that routes requests across many model providers and open models.",
  perplexity:
    "Perplexity's API for web-grounded search and language model responses.",
  "lambda-ai":
    "Lambda AI's hosted inference API for open and commercial language models.",
  chutes:
    "Chutes' OpenAI-compatible serverless inference for open models.",
  scaleway:
    "Scaleway AI's hosted inference API for open-source language models.",
  "ovhcloud-ai":
    "OVHcloud AI Endpoints for managed open-source model inference.",
  "lm-studio":
    "Local LM Studio server with an OpenAI-compatible API.",
  vllm:
    "Local vLLM server exposing an OpenAI-compatible inference API.",
  tokenrouter:
    "An OpenAI-compatible gateway for routing requests to supported language models.",
  tokenharbor:
    "An OpenAI-compatible model gateway for accessing hosted language models.",
  hcnsec:
    "An OpenAI-compatible inference endpoint for supported language models.",
  inferx:
    "An OpenAI-compatible inference endpoint for hosted language models.",
  xkiro:
    "An OpenAI-compatible gateway for accessing supported language models.",
  "together-ai":
    "Fast hosted inference for open models, with support for chat, vision, reasoning, and fine-tuning.",
  "fireworks-ai":
    "Serverless and dedicated inference for open models, including structured output and tool calling.",
  groq: "High-speed inference for selected open models, built around Groq's low-latency hardware.",
  cerebras:
    "Real-time inference for open models, focused on very high throughput and low response latency.",
  "google-ai-studio":
    "Google's Gemini API with an OpenAI-compatible endpoint for rapid model experimentation.",
  deepseek:
    "DeepSeek's API for general language, coding, and reasoning models at competitive inference costs.",
  xai: "xAI's API for Grok models, including general-purpose and reasoning capabilities.",
  cohere:
    "Cohere's platform for language generation, embeddings, reranking, and enterprise AI applications.",
  ai21: "AI21's language model platform for text generation, long-context work, and developer applications.",
  "moonshot-kimi":
    "Moonshot AI's API for Kimi models, known for multilingual work and long-context conversations.",
  minimax:
    "MiniMax's API for language, multimodal, and creative generation models.",
  stepfun:
    "StepFun's model API for Chinese and multilingual language tasks, reasoning, and agent workflows.",
  "tencent-hunyuan":
    "Tencent Cloud's Hunyuan models for Chinese-language, multimodal, and enterprise workloads.",
  "zhipu-glm":
    "Zhipu AI's GLM platform for Chinese and multilingual generation, reasoning, and tool use.",
  "nebius-ai-studio":
    "Nebius AI Studio's hosted inference for open models with developer-focused API access.",
  "novita-ai":
    "An API platform for affordable inference across a broad catalog of open-source models.",
  deepinfra:
    "Serverless inference for open models, with a broad catalog and simple OpenAI-compatible access.",
  siliconflow:
    "A model-serving platform offering fast, cost-conscious inference for open and Chinese models.",
  parasail:
    "Hosted inference for open models with an OpenAI-compatible API and production-oriented endpoints.",
  "friendli-ai":
    "Low-latency serving for generative AI models, with serverless and dedicated deployment options.",
  sambanova:
    "Enterprise AI inference powered by SambaNova systems, with APIs for selected open models.",
  baseten:
    "A deployment platform for running and scaling custom and open-source models in production.",
  replicate:
    "A model platform for running a wide range of open-source and community AI models by API.",
  "hugging-face":
    "Hugging Face's router for accessing models from its open machine-learning ecosystem.",
  requesty:
    "A unified AI router that connects applications to multiple model providers through one API.",
  portkey:
    "An AI gateway for routing, observability, fallbacks, and governance across model providers.",
  opencode:
    "OpenCode Zen's curated gateway for accessing supported models through an OpenAI-compatible API.",
  "opencode-zen-go":
    "OpenCode Zen Go's OpenAI-compatible endpoint for supported models.",
  "qwen-cloud":
    "Alibaba Cloud's DashScope API for Qwen models, with official OpenAI-compatible endpoints for chat, vision, and reasoning models.",
};

export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [
  {
    id: "openai",
    protocol: "openai",
    name: "OpenAI Compatible (Chat Completions)",
    description: providerDescriptions.openai,
    logo: `${PRESET_AVATAR_BASE}/openai.svg`,
    placeholder: "https://api.openai.com/v1",
    preset: false,
  },
  {
    id: "openai-responses",
    protocol: "openai-responses",
    name: "OpenAI Compatible (Responses API)",
    description: providerDescriptions.openaiResponses,
    logo: `${PRESET_AVATAR_BASE}/openai.svg`,
    placeholder: "https://api.openai.com/v1",
    preset: false,
  },
  {
    id: "anthropic",
    protocol: "anthropic",
    name: "Anthropic Compatible (Messages API)",
    description: providerDescriptions.anthropic,
    logo: `${PRESET_AVATAR_BASE}/anthropic.png`,
    placeholder: "https://api.anthropic.com",
    preset: false,
  },
  {
    id: "antigravity",
    protocol: "antigravity",
    name: "Google Antigravity",
    description: providerDescriptions.antigravity,
    logo: `${PRESET_AVATAR_BASE}/antigravity.png`,
    placeholder: "https://daily-cloudcode-pa.googleapis.com",
    preset: false,
  },
  {
    id: "codex",
    protocol: "codex",
    name: "OpenAI Codex",
    description: providerDescriptions.codex,
    logo: `${PRESET_AVATAR_BASE}/codex.png`,
    placeholder: "https://chatgpt.com/backend-api/codex",
    preset: false,
  },
  {
    id: "chatgpt",
    protocol: "chatgpt",
    name: "ChatGPT",
    description: providerDescriptions.chatgpt,
    logo: `${PRESET_AVATAR_BASE}/chatgpt.svg`,
    placeholder: "https://chatgpt.com/backend-api",
    preset: false,
  },
  {
    id: "freebuff",
    protocol: "freebuff",
    name: "Freebuff",
    description: providerDescriptions.freebuff,
    logo: `${PRESET_AVATAR_BASE}/freebuff.png`,
    placeholder: "https://www.codebuff.com",
    preset: false,
  },
  {
    id: "openfree",
    protocol: "openfree",
    name: "OpenFREE",
    description: providerDescriptions.openfree,
    logo: `${PRESET_AVATAR_BASE}/opencode.png`,
    placeholder: "https://opencode.ai",
    preset: false,
  },
  {
    id: "deepai",
    protocol: "deepai",
    name: "DeepAI Code",
    description: "DeepAI Code models with Theos usage and account limits.",
    logo: `${PRESET_AVATAR_BASE}/deepai.svg`,
    placeholder: "https://api.deepai.org/deepai_code",
    preset: false,
  },
  {
    id: "qwen",
    protocol: "qwen",
    name: "Qwen Chat",
    description: providerDescriptions.qwen,
    logo: templateLogo("qwen", "https://qwen.aikit.club"),
    placeholder: "https://qwen.aikit.club",
    preset: false,
  },
  {
    id: "atomesus",
    protocol: "atomesus",
    name: "Atomesus",
    description: providerDescriptions.atomesus,
    logo: `${PRESET_AVATAR_BASE}/atomesus.svg`,
    placeholder: "https://api.atomesus.com",
    preset: false,
  },
  {
    id: "conol",
    protocol: "conol",
    name: "Conol.ai",
    description: providerDescriptions.conol,
    logo: `${PRESET_AVATAR_BASE}/conol.png`,
    placeholder: "https://conol.ai",
    preset: false,
  },
  {
    id: "perch",
    protocol: "perch",
    name: "Perch AI",
    description: providerDescriptions.perch,
    logo: templateLogo("perch", "https://app.perchai.app"),
    placeholder: "https://app.perchai.app",
    preset: false,
  },
  ...openAiCompatiblePresets.map(([id, name, placeholder]) => ({
    id,
    protocol: "openai" as const,
    name,
    description: providerDescriptions[id],
    logo: templateLogo("openai", placeholder, presetLogos[id]),
    placeholder,
    preset: true,
  })),
];
