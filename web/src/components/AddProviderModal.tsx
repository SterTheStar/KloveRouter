import { useState } from "react";
import { RiSearchLine as Search, RiArrowLeftSLine as ArrowLeft } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AvatarUpload from "./AvatarUpload";
import { antigravity, codex, providers } from "../api/client";
import openAiLogo from "../assets/providers/openai.svg";
import anthropicLogo from "../assets/providers/anthropic.png";
import antigravityLogo from "../assets/providers/antigravity.png";

const providerTypes = [
  {
    id: "openai",
    protocol: "openai" as const,
    name: "OpenAI-compatible",
    description: "OpenAI-compatible chat completions API",
    logo: openAiLogo,
    placeholder: "https://api.openai.com/v1",
  },
  {
    id: "antigravity",
    protocol: "antigravity" as const,
    name: "Google Antigravity",
    description: "Google account OAuth with internal Gemini API translation",
    logo: antigravityLogo,
    placeholder: "https://cloudcode-pa.googleapis.com",
  },
  {
    id: "anthropic",
    protocol: "anthropic" as const,
    name: "Anthropic",
    description: "Native Anthropic Messages API",
    logo: anthropicLogo,
    placeholder: "https://api.anthropic.com",
  },
  {
    id: "codex",
    protocol: "codex" as const,
    name: "OpenAI Codex",
    description: "Unofficial ChatGPT OAuth integration using Codex limits",
    logo: openAiLogo,
    placeholder: "https://chatgpt.com/backend-api/codex",
  },
];

export default function AddProviderModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedType, setSelectedType] = useState<typeof providerTypes[number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState(""); const [baseUrl, setBaseUrl] = useState(""); const [apiKey, setApiKey] = useState(""); const [avatar, setAvatar] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(""); setBaseUrl(""); setApiKey(""); setAvatar(null); setError(null); setStep("select"); setSelectedType(null); setSearchQuery(""); };

  const close = () => { if (loading) return; reset(); onClose(); };

  const selectType = (type: typeof providerTypes[number]) => {
    setSelectedType(type);
    setBaseUrl(type.placeholder);
    setStep("form");
  };

  const submit = async () => {
    if (selectedType?.protocol === "codex" || selectedType?.protocol === "antigravity") {
      return setError("Connect your Codex account before adding this provider.");
    }
    if (!name || !baseUrl || !apiKey) return setError("All fields are required.");
    setLoading(true); setError(null);
    try { await providers.create({ name, base_url: baseUrl, api_key: apiKey, protocol: selectedType?.protocol, avatar: avatar || undefined }); onSuccess(); close(); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
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
    } catch (e: any) { setError(e.message); setLoading(false); }
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
                  className={`size-9 object-contain ${type.protocol === "openai" ? "dark:invert" : ""}`}
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
