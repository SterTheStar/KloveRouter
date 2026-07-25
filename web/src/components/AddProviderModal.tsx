import { useState } from "react";
import { RiSearchLine as Search, RiArrowLeftSLine as ArrowLeft } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AvatarUpload from "./AvatarUpload";
import { providers } from "../api/client";
import openAiLogo from "../assets/providers/openai.svg";
import anthropicLogo from "../assets/providers/anthropic.png";

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
    id: "anthropic",
    protocol: "anthropic" as const,
    name: "Anthropic",
    description: "Native Anthropic Messages API",
    logo: anthropicLogo,
    placeholder: "https://api.anthropic.com",
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

  const submit = async () => { if (!name || !baseUrl || !apiKey) return setError("All fields are required."); setLoading(true); setError(null); try { await providers.create({ name, base_url: baseUrl, api_key: apiKey, protocol: selectedType?.protocol, avatar: avatar || undefined }); onSuccess(); close(); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };

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
            <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
            <div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={selectedType?.id} /></div>
            <div className="space-y-2"><Label htmlFor="provider-url">Base URL</Label><Input id="provider-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={selectedType?.placeholder} /></div>
            <div className="space-y-2"><Label htmlFor="provider-key">API key</Label><Input id="provider-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." /></div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
          <DialogFooter><Button variant="outline" onClick={close} disabled={loading}>Cancel</Button><Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save provider"}</Button></DialogFooter>
        </>
      )}
    </DialogContent>
  </Dialog>;
}
