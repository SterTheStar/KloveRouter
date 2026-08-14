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
import { copyToClipboard } from "../lib/clipboard";
import {
  PROVIDER_TEMPLATES,
  type ProviderTemplate,
} from "../lib/provider-templates";
import ProviderIcon from "./ProviderIcon";

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
  const [selectedType, setSelectedType] = useState<ProviderTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationWarning, setVerificationWarning] = useState<string | null>(null);
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
    setVerificationWarning(null);
    setStep("select");
    setSelectedType(null);
    setSearchQuery("");
    setPendingOAuth(null);
    setCallbackUrl("");
    setCompletingOAuth(false);
    setLoading(false);
    setVerifying(false);
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

  const selectType = (type: ProviderTemplate) => {
    setSelectedType(type);
    setName(type.name);
    setBaseUrl(type.placeholder);
    setAvatar(type.logo);
    setStep("form");
  };

  const submit = async (skipVerification = false) => {
    if (
      selectedType?.protocol === "codex" ||
      selectedType?.protocol === "antigravity"
    ) {
      return setError(
        "Connect your Codex account before adding this provider.",
      );
    }
    if (!name || !baseUrl)
      return setError("Provider name and base URL are required.");
    const shouldVerify = !skipVerification;
    setLoading(true);
    setVerifying(shouldVerify);
    setError(null);
    setVerificationWarning(null);
    try {
      if (shouldVerify) await providers.validateCredential({
        base_url: baseUrl,
        ...(selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" || selectedType?.protocol === "chatgpt"
          ? { auth_code: authCode }
          : { api_key: apiKey }),
        protocol: selectedType?.protocol,
      });
      setVerifying(false);
      await providers.create({
        name,
        base_url: baseUrl,
        ...(selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" || selectedType?.protocol === "chatgpt"
          ? { auth_code: authCode }
          : { api_key: apiKey }),
        protocol: selectedType?.protocol,
        avatar: avatar || undefined,
      });
      success("Provider added", `${name} is ready to use.`);
      onSuccess();
      close();
    } catch (e: any) {
      setVerifying(false);
      if (shouldVerify) {
        setVerificationWarning(e.message || "We could not verify this credential.");
        setError(null);
        return;
      }
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
        avatar: avatar || undefined,
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
        avatar: avatar || undefined,
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

  const filteredTypes = PROVIDER_TEMPLATES.filter(
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
                   className="flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
                  onClick={() => selectType(type)}
                >
                  <ProviderIcon name={type.name} src={type.logo} className={`size-9 ${type.id === "openai" ? "dark:invert" : ""}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{type.name}</div>
                      {(type.protocol === "codex" ||
                        type.protocol === "antigravity") && (
                        <Badge variant="outline">OAuth</Badge>
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
              <AvatarUpload value={avatar} name={name} onChange={setAvatar} label="Provider avatar" onError={(message) => notifyError("Invalid avatar", message)} />
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
                        {selectedType?.protocol === "chatgpt" ? "Session token (required)" : selectedType?.protocol === "atomesus" ? "Bearer token (optional)" : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" ? "Auth code (optional)" : "API key (optional)"}
                    </Label>
                    <Input
                      id="provider-key"
                      type="password"
                       value={selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" || selectedType?.protocol === "chatgpt" ? authCode : apiKey}
                      onChange={(e) =>
                         selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" || selectedType?.protocol === "chatgpt"
                          ? setAuthCode(e.target.value)
                          : setApiKey(e.target.value)
                      }
                       placeholder={selectedType?.protocol === "chatgpt" ? "Paste an authorized session token" : selectedType?.protocol === "atomesus" ? "Paste your Atomesus bearer token" : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" ? "Paste your auth token" : "sk-..."}
                    />
                    {selectedType?.protocol === "chatgpt" ? (
                      <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">How to get your ChatGPT session token:</p>
                        <p>Open ChatGPT, then follow this path in your browser:</p>
                        <p className="rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
                          Use the authorized ChatGPT session token provided by your account
                        </p>
                        <p>Paste the session token directly. It is encrypted before being stored.</p>
                      </div>
                    ) : (selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen") && (
                      selectedType?.protocol === "qwen" ? (
                        <div className="space-y-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">How to get your Qwen token:</p>
                          <ol className="list-inside list-decimal space-y-1">
                            <li>Go to <a href="https://chat.qwen.ai" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">chat.qwen.ai</a> and log in</li>
                            <li>Open browser DevTools (<kbd className="rounded border bg-muted px-1 font-mono">F12</kbd> → Console)</li>
                            <li>Copy and paste this code:</li>
                          </ol>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={async () => {
                                const code = `javascript:(()=>{\n  if (location.hostname !== "chat.qwen.ai")\n    return alert("🚀 Use em chat.qwen.ai");\n  const token = localStorage.getItem("token");\n  if (!token)\n    return console.log("❌ Token n\u00e3o encontrado");\n  console.log("🔑 Qwen access_token:\\n", token);\n})();`;
                                try {
                                  await copyToClipboard(code);
                                  success("Setup code copied");
                                } catch (e: any) {
                                  notifyError("Could not copy setup code", e.message);
                                }
                              }}
                              className="absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                            >
                              Copy
                            </button>
                            <pre className="overflow-x-auto rounded bg-muted p-2 pt-5 font-mono text-[11px] leading-relaxed">
{`javascript:(()=>{
  if (location.hostname !== "chat.qwen.ai")
    return alert("🚀 Use em chat.qwen.ai");
  const token = localStorage.getItem("token");
  if (!token)
    return console.log("❌ Token n\u00e3o encontrado");
  console.log("🔑 Qwen access_token:\\n", token);
})();`}
                            </pre>
                          </div>
                          <p>Press <kbd className="rounded border bg-muted px-1 font-mono">Enter</kbd>, then copy the token that appears in the console and paste it above.</p>
                          <p className="text-muted-foreground">The token is encrypted before being stored.</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Use the auth code from your Freebuff account or CLI. It is encrypted before being stored.
                        </p>
                      )
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
              {verifying && (
                <Alert>
                  <AlertDescription>Verifying the credential before saving the provider...</AlertDescription>
                </Alert>
              )}
              {verificationWarning && (
                <Alert>
                  <AlertDescription>
                    We could not verify this credential. The provider may not work with these credentials. Do you want to continue anyway?
                  </AlertDescription>
                </Alert>
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
              ) : verificationWarning ? (
                <>
                  <Button variant="outline" onClick={() => setVerificationWarning(null)} disabled={loading}>
                    Back
                  </Button>
                  <Button onClick={() => submit(true)} disabled={loading}>
                    Continue anyway
                  </Button>
                </>
              ) : (
                <Button onClick={() => submit(false)} disabled={loading}>
                  {verifying ? "Verifying..." : loading ? "Saving..." : "Save provider"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
