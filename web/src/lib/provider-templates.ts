import openAiLogo from "../assets/providers/openai.svg";
import codexLogo from "../assets/providers/codex.png";
import anthropicLogo from "../assets/providers/anthropic.png";
import antigravityLogo from "../assets/providers/antigravity.png";
import agnesLogo from "../assets/providers/agnes.png";
import bluemindsLogo from "../assets/providers/blueminds.ico";
import orcaRouterLogo from "../assets/providers/orcarouter.ico";
import nousPortalLogo from "../assets/providers/nousportal.png";
import mistralLogo from "../assets/providers/mistral.ico";
import openRouterLogo from "../assets/providers/openrouter.ico";
import groqLogo from "../assets/providers/groq.ico";
import deepSeekLogo from "../assets/providers/deepseek.ico";
import xaiLogo from "../assets/providers/xai.ico";
import cohereLogo from "../assets/providers/cohere.ico";
import ai21Logo from "../assets/providers/ai21.png";
import moonshotLogo from "../assets/providers/moonshot.png";
import zhipuLogo from "../assets/providers/zhipu.png";
import nvidiaLogo from "../assets/providers/nvidia.png";
import togetherLogo from "../assets/providers/together.png";
import fireworksLogo from "../assets/providers/fireworks.jpg";
import cerebrasLogo from "../assets/providers/cerebras.png";
import googleAiStudioLogo from "../assets/providers/google-ai-studio.png";
import minimaxLogo from "../assets/providers/minimax.png";
import stepfunLogo from "../assets/providers/stepfun.png";
import tencentHunyuanLogo from "../assets/providers/tencent-hunyuan.png";
import nebiusLogo from "../assets/providers/nebius.png";
import novitaLogo from "../assets/providers/novita.ico";
import deepinfraLogo from "../assets/providers/deepinfra.ico";
import siliconflowLogo from "../assets/providers/siliconflow.ico";
import friendliLogo from "../assets/providers/friendli.ico";
import sambanovaLogo from "../assets/providers/sambanova.ico";
import basetenLogo from "../assets/providers/baseten.ico";
import huggingfaceLogo from "../assets/providers/huggingface.ico";
import requestyLogo from "../assets/providers/requesty.ico";
import parasailLogo from "../assets/providers/parasail.png";
import replicateLogo from "../assets/providers/replicate.png";
import portkeyLogo from "../assets/providers/portkey.png";
import opencodeLogo from "../assets/providers/opencode.png";
import freebuffLogo from "../assets/providers/freebuff.png";
import conolLogo from "../assets/providers/conol.png";
import perplexityLogo from "../assets/providers/perplexity.ico";
import lambdaAiLogo from "../assets/providers/lambda-ai.ico";
import ovhcloudAiLogo from "../assets/providers/ovhcloud-ai.ico";
import lmStudioLogo from "../assets/providers/lm-studio.ico";
import vllmLogo from "../assets/providers/vllm.ico";
import tokenharborLogo from "../assets/providers/tokenharbor.ico";
import hcnsecLogo from "../assets/providers/hcnsec.ico";
import inferxLogo from "../assets/providers/inferx.ico";
import xkiroLogo from "../assets/providers/xkiro.ico";

const chatgptLogo = "https://chatgpt.com/favicon.ico";

export type ProviderTemplate = {
  id: string;
  protocol: "openai" | "antigravity" | "anthropic" | "codex" | "chatgpt" | "freebuff" | "qwen" | "atomesus" | "conol";
  name: string;
  description: string;
  logo: string;
  placeholder: string;
  preset: boolean;
};

function endpointFavicon(endpoint: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(endpoint).hostname)}&sz=64`;
  } catch {
    return openAiLogo;
  }
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
  ["qwen-cloud", "Qwen Cloud (DashScope)", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"],
] as const;

const presetLogos: Record<string, string> = {
  agnes: agnesLogo,
  blueminds: bluemindsLogo,
  orcarouter: orcaRouterLogo,
  nousportal: nousPortalLogo,
  mistral: mistralLogo,
  "nvidia-nim": nvidiaLogo,
  openrouter: openRouterLogo,
  perplexity: perplexityLogo,
  "lambda-ai": lambdaAiLogo,
  "ovhcloud-ai": ovhcloudAiLogo,
  "lm-studio": lmStudioLogo,
  vllm: vllmLogo,
  tokenharbor: tokenharborLogo,
  hcnsec: hcnsecLogo,
  inferx: inferxLogo,
  xkiro: xkiroLogo,
  "together-ai": togetherLogo,
  "fireworks-ai": fireworksLogo,
  groq: groqLogo,
  cerebras: cerebrasLogo,
  "google-ai-studio": googleAiStudioLogo,
  deepseek: deepSeekLogo,
  xai: xaiLogo,
  cohere: cohereLogo,
  ai21: ai21Logo,
  "moonshot-kimi": moonshotLogo,
  minimax: minimaxLogo,
  stepfun: stepfunLogo,
  "tencent-hunyuan": tencentHunyuanLogo,
  "zhipu-glm": zhipuLogo,
  "nebius-ai-studio": nebiusLogo,
  "novita-ai": novitaLogo,
  deepinfra: deepinfraLogo,
  siliconflow: siliconflowLogo,
  parasail: parasailLogo,
  "friendli-ai": friendliLogo,
  sambanova: sambanovaLogo,
  baseten: basetenLogo,
  replicate: replicateLogo,
  "hugging-face": huggingfaceLogo,
  requesty: requestyLogo,
  portkey: portkeyLogo,
  opencode: opencodeLogo,
  "qwen-cloud": "https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.201/favicon.png",
};

const providerDescriptions: Record<string, string> = {
  openai: "OpenAI's hosted models through the familiar Chat Completions API.",
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
  qwen:
    "Qwen AI models through an OpenAI-compatible gateway. Uses a Bearer token extracted from chat.qwen.ai.",
  atomesus:
    "Atomesus models with effort controls, persistent upstream sessions, streaming, and encrypted token storage.",
  conol:
    "Conol.ai agents with account and browser-cookie authentication. Credentials are stored encrypted.",
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
  "qwen-cloud":
    "Alibaba Cloud's DashScope API for Qwen models, with official OpenAI-compatible endpoints for chat, vision, and reasoning models.",
};

export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [
  {
    id: "openai",
    protocol: "openai",
    name: "OpenAI Compatible",
    description: providerDescriptions.openai,
    logo: openAiLogo,
    placeholder: "https://api.openai.com/v1",
    preset: false,
  },
  {
    id: "antigravity",
    protocol: "antigravity",
    name: "Google Antigravity",
    description: providerDescriptions.antigravity,
    logo: antigravityLogo,
    placeholder: "https://cloudcode-pa.googleapis.com",
    preset: false,
  },
  {
    id: "anthropic",
    protocol: "anthropic",
    name: "Anthropic",
    description: providerDescriptions.anthropic,
    logo: anthropicLogo,
    placeholder: "https://api.anthropic.com",
    preset: false,
  },
  {
    id: "codex",
    protocol: "codex",
    name: "OpenAI Codex",
    description: providerDescriptions.codex,
    logo: codexLogo,
    placeholder: "https://chatgpt.com/backend-api/codex",
    preset: false,
  },
  {
    id: "chatgpt",
    protocol: "chatgpt",
    name: "ChatGPT",
    description: providerDescriptions.chatgpt,
    logo: chatgptLogo,
    placeholder: "https://chatgpt.com/backend-api",
    preset: false,
  },
  {
    id: "freebuff",
    protocol: "freebuff",
    name: "Freebuff",
    description: providerDescriptions.freebuff,
    logo: freebuffLogo,
    placeholder: "https://www.codebuff.com",
    preset: false,
  },
  {
    id: "qwen",
    protocol: "qwen",
    name: "Qwen Chat",
    description: providerDescriptions.qwen,
    logo: "https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.201/favicon.png",
    placeholder: "https://qwen.aikit.club",
    preset: false,
  },
  {
    id: "atomesus",
    protocol: "atomesus",
    name: "Atomesus",
    description: providerDescriptions.atomesus,
    logo: "https://atomesus.com/favicon.ico",
    placeholder: "https://api.atomesus.com",
    preset: false,
  },
  {
    id: "conol",
    protocol: "conol",
    name: "Conol.ai",
    description: providerDescriptions.conol,
    logo: conolLogo,
    placeholder: "https://conol.ai",
    preset: false,
  },
  ...openAiCompatiblePresets.map(([id, name, placeholder]) => ({
    id,
    protocol: "openai" as const,
    name,
    description: providerDescriptions[id],
    logo: presetLogos[id] || endpointFavicon(placeholder),
    placeholder,
    preset: true,
  })),
];
