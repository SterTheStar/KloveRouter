import { useEffect, useRef, useState } from "react";
import {
  RiSearchLine as Search,
  RiArrowLeftSLine as ArrowLeft,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import AvatarUpload from "./AvatarUpload";
import { antigravity, codex, providers } from "../api/client";
import { useToast } from "./ui/toast";
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

function endpointFavicon(endpoint: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(endpoint).hostname)}&sz=64`;
  } catch {
    return openAiLogo;
  }
}

function fallbackFavicon(endpoint: string) {
  try {
    const hostname = new URL(endpoint).hostname;
    const parts = hostname.split(".");
    const root = parts.length > 2 ? parts.slice(-2).join(".") : hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(root)}&sz=64`;
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
] as const;

const presetLogos: Record<string, string> = {
  agnes: agnesLogo,
  blueminds: bluemindsLogo,
  orcarouter: orcaRouterLogo,
  nousportal: nousPortalLogo,
  mistral: mistralLogo,
  "nvidia-nim": nvidiaLogo,
  openrouter: openRouterLogo,
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
};

const providerDescriptions: Record<string, string> = {
  openai: "OpenAI's hosted models through the familiar Chat Completions API.",
  antigravity:
    "Google account access to Gemini models through Klove's Antigravity integration.",
  anthropic:
    "Anthropic's native Messages API for Claude models, reasoning, and tool use.",
  codex:
    "ChatGPT OAuth access for OpenAI Codex models with account-based usage limits.",
  freebuff:
    "Free Codebuff/Freebuff models through a token-authenticated OpenAI-compatible gateway.",
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
};

const providerTypes = [
  {
    id: "openai",
    protocol: "openai" as const,
    name: "OpenAI Compatible",
    description: providerDescriptions.openai,
    logo: openAiLogo,
    placeholder: "https://api.openai.com/v1",
    preset: false,
  },
  {
    id: "antigravity",
    protocol: "antigravity" as const,
    name: "Google Antigravity",
    description: providerDescriptions.antigravity,
    logo: antigravityLogo,
    placeholder: "https://cloudcode-pa.googleapis.com",
    preset: false,
  },
  {
    id: "anthropic",
    protocol: "anthropic" as const,
    name: "Anthropic",
    description: providerDescriptions.anthropic,
    logo: anthropicLogo,
    placeholder: "https://api.anthropic.com",
    preset: false,
  },
  {
    id: "codex",
    protocol: "codex" as const,
    name: "OpenAI Codex",
    description: providerDescriptions.codex,
    logo: codexLogo,
    placeholder: "https://chatgpt.com/backend-api/codex",
    preset: false,
  },
  {
    id: "freebuff",
    protocol: "freebuff" as const,
    name: "Freebuff",
    description: providerDescriptions.freebuff,
    logo: freebuffLogo,
    placeholder: "https://www.codebuff.com",
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
] as const;

export default function AddProviderModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { success, error: notifyError } = useToast();
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedType, setSelectedType] = useState<
    (typeof providerTypes)[number] | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOAuth, setPendingOAuth] = useState<{
    protocol: "codex" | "antigravity";
    providerId: string;
    credentialId: string;
    authUrl: string;
  } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [completingOAuth, setCompletingOAuth] = useState(false);
  const pollRef = useRef<number | null>(null);
  const oauthFinishedRef = useRef(false);

  const clearPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => () => clearPoll(), []);

  const reset = () => {
    clearPoll();
    setName("");
    setBaseUrl("");
    setApiKey("");
    setAuthCode("");
    setAvatar(null);
    setError(null);
    setStep("select");
    setSelectedType(null);
    setSearchQuery("");
    setPendingOAuth(null);
    setCallbackUrl("");
    setCompletingOAuth(false);
    setLoading(false);
  };

  const close = () => {
    if (loading && !pendingOAuth) return;
    oauthFinishedRef.current = true;
    const orphan = pendingOAuth;
    reset();
    onClose();
    if (orphan) void providers.remove(orphan.providerId).catch(() => {});
  };

  const finishOAuth = (protocol: "codex" | "antigravity") => {
    if (oauthFinishedRef.current) return;
    oauthFinishedRef.current = true;
    clearPoll();
    success(
      "Account connected",
      protocol === "codex"
        ? "Codex is ready to use."
        : "Google Antigravity is ready to use.",
    );
    onSuccess();
    reset();
    onClose();
  };

  const waitForOAuth = (
    protocol: "codex" | "antigravity",
    providerId: string,
    credentialId: string,
    authUrl: string,
  ) => {
    oauthFinishedRef.current = false;
    setPendingOAuth({ protocol, providerId, credentialId, authUrl });
    const started = Date.now();
    clearPoll();
    pollRef.current = window.setInterval(async () => {
      try {
        if (
          !oauthFinishedRef.current &&
          (await providers.credentialStatus(providerId, credentialId))
            .authenticated
        )
          finishOAuth(protocol);
        else if (Date.now() - started > 5 * 60_000) {
          clearPoll();
          setLoading(false);
          setError(
            "OAuth login timed out. Start a new login and paste its callback URL.",
          );
        }
      } catch {
        /* Keep polling during browser login. */
      }
    }, 1500);
  };

  const completeOAuthManually = async () => {
    if (!pendingOAuth || oauthFinishedRef.current || !callbackUrl.trim())
      return setError("Paste the complete localhost callback URL.");
    setCompletingOAuth(true);
    setError(null);
    try {
      if (pendingOAuth.protocol === "codex")
        await codex.completeLogin(
          callbackUrl.trim(),
          pendingOAuth.credentialId,
        );
      else
        await antigravity.completeLogin(
          callbackUrl.trim(),
          pendingOAuth.credentialId,
        );
      finishOAuth(pendingOAuth.protocol);
    } catch (e: any) {
      try {
        if (
          (
            await providers.credentialStatus(
              pendingOAuth.providerId,
              pendingOAuth.credentialId,
            )
          ).authenticated
        )
          return finishOAuth(pendingOAuth.protocol);
      } catch {
        /* Report the original completion error. */
      }
      setError(e.message);
      notifyError("Could not complete OAuth", e.message);
    } finally {
      setCompletingOAuth(false);
    }
  };

  const restartOAuth = async () => {
    if (!pendingOAuth) return;
    const popup = window.open(
      "about:blank",
      pendingOAuth.protocol === "codex"
        ? "klove-codex-login"
        : "klove-antigravity-login",
      "popup,width=520,height=720",
    );
    setLoading(true);
    setError(null);
    setCallbackUrl("");
    try {
      const result =
        pendingOAuth.protocol === "codex"
          ? await codex.login(pendingOAuth.credentialId)
          : await antigravity.login(pendingOAuth.credentialId);
      if (popup) popup.location.href = result.auth_url;
      waitForOAuth(
        pendingOAuth.protocol,
        pendingOAuth.providerId,
        pendingOAuth.credentialId,
        result.auth_url,
      );
    } catch (e: any) {
      popup?.close();
      setLoading(false);
      setError(e.message);
      notifyError("Could not restart OAuth", e.message);
    }
  };

  const selectType = (type: (typeof providerTypes)[number]) => {
    setSelectedType(type);
    setName(type.name);
    setBaseUrl(type.placeholder);
    setStep("form");
  };

  const submit = async () => {
    if (
      selectedType?.protocol === "codex" ||
      selectedType?.protocol === "antigravity"
    ) {
      return setError(
        "Connect your Codex account before adding this provider.",
      );
    }
    if (!name || !baseUrl || (selectedType?.protocol === "freebuff" ? !authCode : !apiKey))
      return setError("All fields are required.");
    setLoading(true);
    setError(null);
    try {
      await providers.create({
        name,
        base_url: baseUrl,
        ...(selectedType?.protocol === "freebuff"
          ? { auth_code: authCode }
          : { api_key: apiKey }),
        protocol: selectedType?.protocol,
        avatar:
          avatar || (selectedType?.preset ? selectedType.logo : undefined),
      });
      success("Provider added", `${name} is ready to use.`);
      onSuccess();
      close();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not add provider", e.message);
    } finally {
      setLoading(false);
    }
  };

  const connectAntigravity = async () => {
    const popup = window.open(
      "about:blank",
      "klove-antigravity-login",
      "popup,width=520,height=720",
    );
    let createdProviderId: string | null = null;
    setLoading(true);
    setError(null);
    try {
      const provider = await providers.create({
        name: name.trim() || "antigravity",
        base_url: baseUrl || "https://cloudcode-pa.googleapis.com",
        protocol: "antigravity",
        avatar: avatar || antigravityLogo,
      });
      createdProviderId = provider.id;
      const credential = (await providers.credentials(provider.id))[0];
      if (!credential) throw new Error("Unable to create Google credential");
      const result = await antigravity.login(credential.id);
      if (popup) popup.location.href = result.auth_url;
      waitForOAuth("antigravity", provider.id, credential.id, result.auth_url);
    } catch (e: any) {
      popup?.close();
      if (createdProviderId)
        await providers.remove(createdProviderId).catch(() => {});
      setError(e.message);
      notifyError("Could not connect Google", e.message);
      setLoading(false);
    }
  };

  const connectCodex = async () => {
    const popup = window.open(
      "about:blank",
      "klove-codex-login",
      "popup,width=520,height=720",
    );
    let createdProviderId: string | null = null;
    setLoading(true);
    setError(null);
    try {
      const provider = await providers.create({
        name: name.trim() || "codex",
        base_url: baseUrl || "https://chatgpt.com/backend-api/codex",
        api_key: "codex-session",
        protocol: "codex",
        avatar: avatar || openAiLogo,
      });
      createdProviderId = provider.id;
      const credentials = await providers.credentials(provider.id);
      const credential = credentials[0];
      if (!credential) throw new Error("Unable to create Codex credential");
      const result = await codex.login(credential.id);
      if (popup) popup.location.href = result.auth_url;
      waitForOAuth("codex", provider.id, credential.id, result.auth_url);
    } catch (e: any) {
      popup?.close();
      if (createdProviderId)
        await providers.remove(createdProviderId).catch(() => {});
      setError(e.message);
      notifyError("Could not connect Codex", e.message);
      setLoading(false);
    }
  };

  const filteredTypes = providerTypes.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-3xl">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add provider</DialogTitle>
              <DialogDescription>
                Choose a provider type to connect.
              </DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search provider types..."
                className="h-9 pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2 min-h-[24rem] max-h-[32rem] overflow-y-auto">
              {filteredTypes.map((type) => (
                <button
                  key={type.id}
                  disabled={type.id === "freebuff"}
                  className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors ${type.id === "freebuff" ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50"}`}
                  onClick={() => selectType(type)}
                >
                  <img
                    src={type.logo}
                    alt={`${type.name} logo`}
                    className={`size-9 object-contain ${type.id === "openai" ? "dark:invert" : ""}`}
                    onError={(event) => {
                      if (
                        type.preset &&
                        event.currentTarget.src !==
                          fallbackFavicon(type.placeholder)
                      ) {
                        event.currentTarget.src = fallbackFavicon(
                          type.placeholder,
                        );
                      }
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{type.name}</div>
                      {(type.protocol === "codex" ||
                        type.protocol === "antigravity") && (
                        <Badge variant="outline">OAuth</Badge>
                      )}
                      {type.id === "freebuff" && (
                        <Badge variant="destructive">Not working</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {type.description}
                    </div>
                  </div>
                </button>
              ))}
              {filteredTypes.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No provider types found.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7"
                  onClick={() => {
                    setStep("select");
                    setError(null);
                  }}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div>
                  <DialogTitle>{selectedType?.name}</DialogTitle>
                  <DialogDescription>
                    Fill in the connection details.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              {(selectedType?.protocol === "codex" ||
                selectedType?.protocol === "antigravity") && (
                <Alert>
                  <AlertDescription>
                    <strong>OAuth integration:</strong> Klove stores the account
                    tokens encrypted in SQLite and uses private provider
                    endpoints.
                  </AlertDescription>
                </Alert>
              )}
              <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
              <div className="space-y-2">
                <Label htmlFor="provider-name">Provider name</Label>
                <Input
                  id="provider-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedType?.id}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-url">Base URL</Label>
                <Input
                  id="provider-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={selectedType?.placeholder}
                />
              </div>
              {selectedType?.protocol !== "codex" &&
                selectedType?.protocol !== "antigravity" && (
                  <div className="space-y-2">
                    <Label htmlFor="provider-key">
                      {selectedType?.protocol === "freebuff" ? "Auth code" : "API key"}
                    </Label>
                    <Input
                      id="provider-key"
                      type="password"
                      value={selectedType?.protocol === "freebuff" ? authCode : apiKey}
                      onChange={(e) =>
                        selectedType?.protocol === "freebuff"
                          ? setAuthCode(e.target.value)
                          : setApiKey(e.target.value)
                      }
                      placeholder={selectedType?.protocol === "freebuff" ? "Paste your Freebuff auth code" : "sk-..."}
                    />
                    {selectedType?.protocol === "freebuff" && (
                      <p className="text-xs text-muted-foreground">
                        Use the auth code from your Freebuff account or CLI. It is encrypted before being stored.
                      </p>
                    )}
                  </div>
                )}
              {pendingOAuth && (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="oauth-callback-url">
                      Complete OAuth manually
                    </Label>
                    <a
                      href={pendingOAuth.authUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary underline underline-offset-4"
                    >
                      Open authorization page
                    </a>
                  </div>
                  <Textarea
                    id="oauth-callback-url"
                    className="min-h-24 font-mono text-xs"
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                    placeholder={`http://localhost:1455/${pendingOAuth.protocol === "codex" ? "auth" : "antigravity"}/callback?code=...&state=...`}
                  />
                  <p className="text-xs text-muted-foreground">
                    If the localhost page did not open, copy its complete URL
                    from the browser address bar and paste it here. The
                    automatic login remains active.
                  </p>
                </div>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              {pendingOAuth ? (
                <>
                  <Button
                    variant="outline"
                    onClick={restartOAuth}
                    disabled={completingOAuth}
                  >
                    Restart login
                  </Button>
                  <Button
                    onClick={completeOAuthManually}
                    disabled={completingOAuth || !callbackUrl.trim()}
                  >
                    {completingOAuth ? "Completing..." : "Complete login"}
                  </Button>
                </>
              ) : selectedType?.protocol === "codex" ? (
                <Button onClick={connectCodex} disabled={loading}>
                  {loading ? "Opening login..." : "Connect Codex"}
                </Button>
              ) : selectedType?.protocol === "antigravity" ? (
                <Button onClick={connectAntigravity} disabled={loading}>
                  {loading ? "Opening login..." : "Connect Google"}
                </Button>
              ) : (
                <Button onClick={submit} disabled={loading}>
                  {loading ? "Saving..." : "Save provider"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
