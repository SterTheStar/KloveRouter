import { useState } from "react";
import { RiSearchLine as Search, RiArrowLeftSLine as ArrowLeft } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  ["google-ai-studio", "Google AI Studio (OpenAI Compatible)", "https://generativelanguage.googleapis.com/v1beta/openai/"],
  ["deepseek", "DeepSeek", "https://api.deepseek.com/v1"],
  ["moonshot-kimi", "Moonshot AI (Kimi)", "https://api.moonshot.ai/v1"],
  ["xai", "xAI", "https://api.x.ai/v1"],
  ["cohere", "Cohere", "https://api.cohere.com/v1"],
  ["ai21", "AI21", "https://api.ai21.com/studio/v1"],
  ["minimax", "MiniMax", "https://api.minimax.chat/v1"],
  ["stepfun", "StepFun", "https://api.stepfun.ai/v1"],
  ["tencent-hunyuan", "Tencent Hunyuan", "https://api.hunyuan.cloud.tencent.com/v1"],
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
  ["hugging-face", "Hugging Face Inference", "https://router.huggingface.co/v1"],
  ["requesty", "Requesty", "https://router.requesty.ai/v1"],
  ["portkey", "Portkey AI Gateway", "https://api.portkey.ai/v1"],
  ["opencode", "OpenCode Zen", "https://opencode.ai/zen/v1"],
] as const;

const presetLogos: Record<string, string> = { agnes: agnesLogo, blueminds: bluemindsLogo, orcarouter: orcaRouterLogo, nousportal: nousPortalLogo, mistral: mistralLogo, "nvidia-nim": nvidiaLogo, openrouter: openRouterLogo, "together-ai": togetherLogo, "fireworks-ai": fireworksLogo, groq: groqLogo, cerebras: cerebrasLogo, "google-ai-studio": googleAiStudioLogo, deepseek: deepSeekLogo, xai: xaiLogo, cohere: cohereLogo, ai21: ai21Logo, "moonshot-kimi": moonshotLogo, minimax: minimaxLogo, stepfun: stepfunLogo, "tencent-hunyuan": tencentHunyuanLogo, "zhipu-glm": zhipuLogo, "nebius-ai-studio": nebiusLogo, "novita-ai": novitaLogo, deepinfra: deepinfraLogo, siliconflow: siliconflowLogo, parasail: parasailLogo, "friendli-ai": friendliLogo, sambanova: sambanovaLogo, baseten: basetenLogo, replicate: replicateLogo, "hugging-face": huggingfaceLogo, requesty: requestyLogo, portkey: portkeyLogo, opencode: opencodeLogo };

const providerTypes = [
  {
    id: "openai",
    protocol: "openai" as const,
    name: "OpenAI Compatible",
    description: "OpenAI-compatible chat completions API",
    logo: openAiLogo,
    placeholder: "https://api.openai.com/v1",
    preset: false,
  },
  {
    id: "antigravity",
    protocol: "antigravity" as const,
    name: "Google Antigravity",
    description: "Google account OAuth with internal Gemini API translation",
    logo: antigravityLogo,
    placeholder: "https://cloudcode-pa.googleapis.com",
    preset: false,
  },
  {
    id: "anthropic",
    protocol: "anthropic" as const,
    name: "Anthropic",
    description: "Native Anthropic Messages API",
    logo: anthropicLogo,
    placeholder: "https://api.anthropic.com",
    preset: false,
  },
  {
    id: "codex",
    protocol: "codex" as const,
    name: "OpenAI Codex",
    description: "Unofficial ChatGPT OAuth integration using Codex limits",
    logo: codexLogo,
    placeholder: "https://chatgpt.com/backend-api/codex",
    preset: false,
  },
  ...openAiCompatiblePresets.map(([id, name, placeholder]) => ({
    id,
    protocol: "openai" as const,
    name,
    description: "OpenAI-compatible API provider",
    logo: presetLogos[id] || endpointFavicon(placeholder),
    placeholder,
    preset: true,
  })),
] as const;

export default function AddProviderModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const { success, error: notifyError } = useToast();
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedType, setSelectedType] = useState<typeof providerTypes[number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState(""); const [baseUrl, setBaseUrl] = useState(""); const [apiKey, setApiKey] = useState(""); const [avatar, setAvatar] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(""); setBaseUrl(""); setApiKey(""); setAvatar(null); setError(null); setStep("select"); setSelectedType(null); setSearchQuery(""); };

  const close = () => { if (loading) return; reset(); onClose(); };

  const selectType = (type: typeof providerTypes[number]) => {
    setSelectedType(type);
    setName(type.name);
    setBaseUrl(type.placeholder);
    setStep("form");
  };

  const submit = async () => {
    if (selectedType?.protocol === "codex" || selectedType?.protocol === "antigravity") {
      return setError("Connect your Codex account before adding this provider.");
    }
    if (!name || !baseUrl || !apiKey) return setError("All fields are required.");
    setLoading(true); setError(null);
    try { await providers.create({ name, base_url: baseUrl, api_key: apiKey, protocol: selectedType?.protocol, avatar: avatar || (selectedType?.preset ? selectedType.logo : undefined) }); success("Provider added", `${name} is ready to use.`); onSuccess(); close(); } catch (e: any) { setError(e.message); notifyError("Could not add provider", e.message); } finally { setLoading(false); }
  };

  const connectAntigravity = async () => {
    setLoading(true); setError(null);
    try {
      const provider = await providers.create({ name: name.trim() || "antigravity", base_url: baseUrl || "https://cloudcode-pa.googleapis.com", protocol: "antigravity", avatar: avatar || antigravityLogo });
      const credential = (await providers.credentials(provider.id))[0];
      if (!credential) throw new Error("Unable to create Google credential");
      const result = await antigravity.login(credential.id);
      window.open(result.auth_url, "klove-antigravity-login", "popup,width=520,height=720");
      const started = Date.now(); const poll = window.setInterval(async () => { try { if ((await providers.credentialStatus(provider.id, credential.id)).authenticated) { window.clearInterval(poll); onSuccess(); close(); } else if (Date.now() - started > 5 * 60_000) { window.clearInterval(poll); setLoading(false); setError("Google login timed out."); } } catch {} }, 1500);
    } catch (e: any) { setError(e.message); notifyError("Could not connect Google", e.message); setLoading(false); }
  };

  const connectCodex = async () => {
    setLoading(true); setError(null);
    try {
      const provider = await providers.create({
        name: name.trim() || "codex",
        base_url: baseUrl || "https://chatgpt.com/backend-api/codex",
        api_key: "codex-session",
        protocol: "codex",
        avatar: avatar || openAiLogo,
      });
      const credentials = await providers.credentials(provider.id);
      const credential = credentials[0];
      if (!credential) throw new Error("Unable to create Codex credential");
      const result = await codex.login(credential.id);
      window.open(result.auth_url, "klove-codex-login", "popup,width=520,height=720");
      const started = Date.now();
      const poll = window.setInterval(async () => {
        try {
          const status = await providers.credentialStatus(provider.id, credential.id);
          if (status.authenticated) {
            window.clearInterval(poll);
            onSuccess();
            close();
          } else if (Date.now() - started > 5 * 60_000) {
            window.clearInterval(poll);
            setLoading(false);
            setError("Codex login timed out.");
          }
        } catch { /* keep polling during browser login */ }
      }, 1500);
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not connect Codex", e.message);
      setLoading(false);
    }
  };

  const filteredTypes = providerTypes.filter(
    (t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
    <DialogContent className="sm:max-w-3xl">
      {step === "select" ? (
        <>
          <DialogHeader><DialogTitle>Add provider</DialogTitle><DialogDescription>Choose a provider type to connect.</DialogDescription></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search provider types..." className="h-9 pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="space-y-2 min-h-[24rem] max-h-[32rem] overflow-y-auto">
            {filteredTypes.map((type) => (
              <button key={type.id} className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50" onClick={() => selectType(type)}>
                <img
                  src={type.logo}
                  alt={`${type.name} logo`}
                  className={`size-9 object-contain ${type.id === "openai" ? "dark:invert" : ""}`}
                  onError={(event) => {
                    if (type.preset && event.currentTarget.src !== fallbackFavicon(type.placeholder)) {
                      event.currentTarget.src = fallbackFavicon(type.placeholder);
                    }
                  }}
                />
                <div className="min-w-0">
                  <div className="font-medium">{type.name}</div>
                  <div className="text-xs text-muted-foreground">{type.description}</div>
                </div>
              </button>
            ))}
            {filteredTypes.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No provider types found.</div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={close}>Cancel</Button></DialogFooter>
        </>
      ) : (
        <>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => { setStep("select"); setError(null); }}>
                <ArrowLeft className="size-4" />
              </Button>
              <div><DialogTitle>{selectedType?.name}</DialogTitle><DialogDescription>Fill in the connection details.</DialogDescription></div>
            </div>
          </DialogHeader>
          <div className="space-y-4">
             {(selectedType?.protocol === "codex" || selectedType?.protocol === "antigravity") && <Alert><AlertDescription><strong>OAuth integration:</strong> Klove stores the account tokens encrypted in SQLite and uses private provider endpoints.</AlertDescription></Alert>}
            <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
            <div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={selectedType?.id} /></div>
            <div className="space-y-2"><Label htmlFor="provider-url">Base URL</Label><Input id="provider-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={selectedType?.placeholder} /></div>
             {selectedType?.protocol !== "codex" && selectedType?.protocol !== "antigravity" && <div className="space-y-2"><Label htmlFor="provider-key">API key</Label><Input id="provider-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." /></div>}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
           <DialogFooter><Button variant="outline" onClick={close} disabled={loading}>Cancel</Button>{selectedType?.protocol === "codex" ? <Button onClick={connectCodex} disabled={loading}>{loading ? "Opening login..." : "Connect Codex"}</Button> : selectedType?.protocol === "antigravity" ? <Button onClick={connectAntigravity} disabled={loading}>{loading ? "Opening login..." : "Connect Google"}</Button> : <Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save provider"}</Button>}</DialogFooter>
        </>
      )}
    </DialogContent>
  </Dialog>;
}
