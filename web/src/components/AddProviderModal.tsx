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
import {
  antigravity,
  codex,
  openfreeCli,
  providers,
  type OpenFreeCliStatus,
} from "../api/client";
import { useToast } from "./ui/toast";
import { copyToClipboard } from "../lib/clipboard";
import {
  PROVIDER_TEMPLATES,
  type ProviderTemplate,
} from "../lib/provider-templates";
import ProviderIcon from "./ProviderIcon";
import { faviconForEndpoint, isEndpointFavicon, isPersistableAvatar, logoToDataUrl } from "@/lib/provider-icons";
import { invalidateProviders } from "../lib/query-cache";

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
  const [cookieFile, setCookieFile] = useState<File | null>(null);
  const [conolAccountId, setConolAccountId] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarManuallySet, setAvatarManuallySet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openfreeCliStatus, setOpenfreeCliStatus] = useState<OpenFreeCliStatus | null>(null);
  const [openfreeCliPath, setOpenfreeCliPath] = useState("");
  const [checkingOpenfreeCli, setCheckingOpenfreeCli] = useState(false);
  const [savingOpenfreeCliPath, setSavingOpenfreeCliPath] = useState(false);
  const [installingOpenfreeCli, setInstallingOpenfreeCli] = useState(false);
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

  useEffect(() => {
    if (!isOpen || selectedType?.protocol !== "openfree") return;
    let current = true;
    setCheckingOpenfreeCli(true);
    setOpenfreeCliStatus(null);
    setOpenfreeCliPath("");
    openfreeCli.status()
      .then((status) => {
        if (!current) return;
        setOpenfreeCliStatus(status);
        setOpenfreeCliPath(status.saved_path ?? "");
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (current) setCheckingOpenfreeCli(false);
      });
    return () => { current = false; };
  }, [isOpen, selectedType?.protocol]);

  const reset = () => {
    clearPoll();
    setName("");
    setBaseUrl("");
    setApiKey("");
    setAuthCode("");
    setCookieFile(null);
    setConolAccountId("");
    setAvatar(null);
    setAvatarManuallySet(false);
    setOpenfreeCliStatus(null);
    setOpenfreeCliPath("");
    setCheckingOpenfreeCli(false);
    setSavingOpenfreeCliPath(false);
    setInstallingOpenfreeCli(false);
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
    invalidateProviders();
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
    setAvatar(null);
    setAvatarManuallySet(false);
    setError(null);
    setStep("form");
  };

  const saveOpenfreeCli = async (path: string) => {
    setSavingOpenfreeCliPath(true);
    setError(null);
    try {
      const status = await openfreeCli.savePath(path);
      setOpenfreeCliStatus(status);
      setOpenfreeCliPath(status.saved_path ?? "");
      success(
        status.saved_path ? "OpenCode CLI path saved" : "OpenCode CLI path cleared",
        status.path ? `Using ${status.path}` : "Automatic detection did not find an OpenCode CLI.",
      );
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      notifyError("Could not save OpenCode CLI path", message);
    } finally {
      setSavingOpenfreeCliPath(false);
    }
  };

  const installManagedOpenfreeCli = async () => {
    setInstallingOpenfreeCli(true);
    setError(null);
    try {
      const status = await openfreeCli.install();
      setOpenfreeCliStatus(status);
      setOpenfreeCliPath(status.saved_path ?? "");
      success(
        "OpenCode CLI installed",
        `Installed in KloveRouter's managed folder: ${status.managed_path}`,
      );
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      notifyError("Could not install OpenCode CLI", message);
    } finally {
      setInstallingOpenfreeCli(false);
    }
  };

  // Only a user-chosen avatar, or a static template logo, is persisted. The favicon
  // derived from the typed endpoint is not persisted so it keeps following URL edits.
  const resolveAvatarPayload = async (): Promise<string | undefined> => {
    if (avatarManuallySet) return isPersistableAvatar(avatar) ? avatar : undefined;
    const logo = selectedType?.logo;
    if (!logo || isEndpointFavicon(logo)) return undefined;
    return (await logoToDataUrl(logo)) ?? undefined;
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
    if (selectedType?.protocol === "openfree" && !apiKey.trim())
      return setError("OpenCode Zen API key is required for OpenFREE.");
    const conolParsedAccountId = conolAccountId.trim() || authCode.match(/^account_id\s*=\s*(.+)$/m)?.[1]?.trim() || "";
    if (selectedType?.protocol === "chatgpt" && !cookieFile)
      return setError("Select a cookies.txt file.");
    if (selectedType?.protocol === "conol" && !conolParsedAccountId)
      return setError("Conol.ai account_id is required. Enter it separately or use account_id=<id> on the first line.");
    const hasCredentialToVerify = selectedType?.protocol === "chatgpt"
      ? Boolean(cookieFile)
      : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" || selectedType?.protocol === "conol"
        ? Boolean(authCode.trim())
        : Boolean(apiKey.trim());
    const shouldVerify = !skipVerification && hasCredentialToVerify && selectedType?.protocol !== "openfree";
    setLoading(true);
    setVerifying(shouldVerify);
    setError(null);
    setVerificationWarning(null);
    try {
      let openfreeLoginWarning: string | null = null;
      if (selectedType?.protocol === "openfree" && apiKey.trim()) {
        const login = await openfreeCli.login(apiKey.trim());
        openfreeLoginWarning = login.warning;
      }
      if (shouldVerify && selectedType?.protocol !== "chatgpt") await providers.validateCredential({
        base_url: baseUrl,
        ...(selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus"
          ? { auth_code: authCode }
          : selectedType?.protocol === "conol"
            ? { secret: authCode, account_id: conolParsedAccountId }
            : { api_key: apiKey }),
        protocol: selectedType?.protocol,
      });
      setVerifying(false);
      const created = await providers.create({
        name,
        base_url: baseUrl,
        ...(selectedType?.protocol === "chatgpt"
          ? {}
          : selectedType?.protocol === "openfree"
            ? (apiKey.trim() ? { api_key: apiKey.trim() } : {})
            : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus"
              ? { auth_code: authCode }
              : selectedType?.protocol === "conol"
                ? { secret: authCode, account_id: conolParsedAccountId }
                : { api_key: apiKey }),
        protocol: selectedType?.protocol,
        avatar: await resolveAvatarPayload(),
      });
      if (selectedType?.protocol === "chatgpt" && cookieFile)
        await providers.uploadCookies(created.id, cookieFile);
      invalidateProviders();
      success("Provider added", openfreeLoginWarning
        ? `The API key is saved. ${openfreeLoginWarning}`
        : `${name} is ready to use.`);
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
        avatar: await resolveAvatarPayload(),
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
        avatar: await resolveAvatarPayload(),
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

  const unavailableProtocols = new Set(["chatgpt", "freebuff"]);
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
                  type="button"
                  disabled={unavailableProtocols.has(type.protocol)}
                  className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors ${unavailableProtocols.has(type.protocol) ? "cursor-not-allowed opacity-60" : "hover:bg-muted/50"}`}
                  onClick={() => selectType(type)}
                >
                  <ProviderIcon name={type.name} src={type.logo} className={`size-9 ${type.id === "openai" ? "dark:invert" : ""}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{type.name}</div>
                      {unavailableProtocols.has(type.protocol) && (
                        <Badge variant="destructive">Not working</Badge>
                      )}
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
              <AvatarUpload
                value={avatarManuallySet ? avatar : null}
                previewSrc={selectedType?.logo}
                previewFallbackUrl={faviconForEndpoint(baseUrl)}
                name={name}
                onChange={(value) => { setAvatar(value); setAvatarManuallySet(value !== null); }}
                label="Provider avatar"
                onError={(message) => notifyError("Invalid avatar", message)}
              />
              <div className="space-y-2">
                <Label htmlFor="provider-name">Provider name</Label>
                <Input
                  id="provider-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedType?.id}
                />
              </div>
              {selectedType?.protocol === "openfree" && (
                <div className="space-y-3 rounded-lg border p-3">
                  <Alert
                    variant={openfreeCliStatus?.warning && !openfreeCliStatus.path ? "destructive" : "default"}
                  >
                    <AlertDescription>
                      {checkingOpenfreeCli
                        ? "Checking for OpenCode CLI on the KloveRouter host..."
                        : openfreeCliStatus?.path
                          ? <>
                              {`OpenCode CLI found${openfreeCliStatus.source ? ` (${openfreeCliStatus.source})` : ""}:`}
                              <br />
                              <code className="break-all">{openfreeCliStatus.path}</code>
                            </>
                          : openfreeCliStatus
                            ? "No OpenCode CLI was found on the KloveRouter host. Enter its executable path below."
                            : "Could not check for the OpenCode CLI."}
                      {openfreeCliStatus?.warning && <><br />{openfreeCliStatus.warning}</>}
                    </AlertDescription>
                  </Alert>
                  <p className="text-xs text-muted-foreground">
                    OpenFREE requires an OpenCode Zen API key. The key is stored encrypted and used for requests; the CLI login is also configured when the CLI and <code>expect</code> are available.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="openfree-cli-path">OpenCode CLI executable path</Label>
                    <Input
                      id="openfree-cli-path"
                      value={openfreeCliPath}
                      onChange={(event) => setOpenfreeCliPath(event.target.value)}
                      placeholder={openfreeCliStatus?.path ?? "/absolute/path/to/opencode"}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use automatic detection. Saving a path applies it to the KloveRouter host.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveOpenfreeCli(openfreeCliPath)}
                      disabled={checkingOpenfreeCli || savingOpenfreeCliPath || !openfreeCliPath.trim()}
                    >
                      {savingOpenfreeCliPath ? "Saving..." : "Save CLI path"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void saveOpenfreeCli("")}
                      disabled={checkingOpenfreeCli || savingOpenfreeCliPath || !openfreeCliStatus?.saved_path}
                    >
                      Use automatic detection
                    </Button>
                  </div>
                  <div className="space-y-2 border-t pt-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">KloveRouter managed installation</p>
                      <code className="block break-all text-xs text-muted-foreground">
                        {openfreeCliStatus?.managed_path ?? "Resolving the app data folder..."}
                      </code>
                      {openfreeCliStatus?.managed_installed && openfreeCliStatus.managed_version && (
                        <p className="text-xs text-muted-foreground">
                          Managed CLI version {openfreeCliStatus.managed_version} is installed.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void installManagedOpenfreeCli()}
                      disabled={checkingOpenfreeCli || savingOpenfreeCliPath || installingOpenfreeCli}
                    >
                      {installingOpenfreeCli
                        ? "Installing OpenCode CLI..."
                        : openfreeCliStatus?.managed_installed
                          ? "Update managed CLI"
                          : "Install managed CLI"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Downloads the official platform package, verifies its integrity, and saves the CLI in this folder.
                    </p>
                  </div>
                  <div className="space-y-2 border-t pt-3">
                    <Label htmlFor="openfree-zen-api-key">OpenCode Zen API key (required)</Label>
                    <Input
                      id="openfree-zen-api-key"
                      type="password"
                      autoComplete="new-password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Paste your OpenCode Zen API key"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Saving this provider signs the CLI in through its API-key prompt when available and stores the key encrypted in KloveRouter.
                    </p>
                  </div>
                </div>
              )}
              {selectedType?.protocol !== "openfree" && <div className="space-y-2">
                <Label htmlFor="provider-url">Base URL</Label>
                <Input
                  id="provider-url"
                  value={baseUrl}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBaseUrl(value);
                  }}
                  placeholder={selectedType?.placeholder}
                />
              </div>}
              {selectedType?.protocol !== "openfree" && selectedType?.protocol !== "codex" &&
                selectedType?.protocol !== "antigravity" && (
                  <div className="space-y-2">
                    {selectedType?.protocol === "conol" ? (
                      <>
                        <Label htmlFor="conol-account-id">Account ID</Label>
                        <Input
                          id="conol-account-id"
                          value={conolAccountId}
                          onChange={(e) => setConolAccountId(e.target.value)}
                          placeholder="account_id from Conol.ai"
                        />
                        <Label htmlFor="provider-key">Cookie</Label>
                        <Input
                          id="provider-key"
                          type="password"
                          value={authCode}
                          onChange={(e) => setAuthCode(e.target.value)}
                          placeholder="Paste the Conol.ai cookie (kept hidden)"
                        />
                        <p className="text-xs text-muted-foreground">Enter Account ID and cookie separately. Cookie stays hidden and is encrypted before storage.</p>
                      </>
                    ) : (
                      <>
                        {selectedType?.protocol === "chatgpt" ? (
                          <div>
                            <Label htmlFor="provider-cookies">cookies.txt (Netscape)</Label>
                            <Input id="provider-cookies" type="file" accept=".txt,text/plain" onChange={(e) => setCookieFile(e.target.files?.[0] ?? null)} />
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor="provider-key">
                              {selectedType?.protocol === "atomesus" ? "Bearer token (optional)" : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" ? "Auth code (optional)" : "API key (optional)"}
                            </Label>
                            <Input id="provider-key" type="password" value={selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" ? authCode : apiKey} onChange={(e) => selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "atomesus" ? setAuthCode(e.target.value) : setApiKey(e.target.value)} placeholder={selectedType?.protocol === "atomesus" ? "Paste your Atomesus bearer token" : selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" ? "Paste your auth token" : "sk-..."} />
                          </div>
                        )}
                    {selectedType?.protocol === "chatgpt" ? (
                      <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">ChatGPT cookies.txt</p>
                        <p>Export your own logged-in ChatGPT cookies in Netscape cookies.txt format. Only chatgpt.com and openai.com cookies are accepted and the resulting Cookie header is encrypted before storage.</p>
                      </div>
                    ) : (selectedType?.protocol === "freebuff" || selectedType?.protocol === "qwen" || selectedType?.protocol === "conol") && (
                      selectedType?.protocol === "conol" ? (
                        <div className="space-y-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">How to get your Conol.ai account and session cookie:</p>
                          <ol className="list-inside list-decimal space-y-1">
                            <li>Go to <a href="https://conol.ai" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">conol.ai</a> and log in</li>
                            <li>Open DevTools (<kbd className="rounded border bg-muted px-1 font-mono">F12</kbd>) → <strong>Network</strong>, then reload the page</li>
                            <li>Open any request to <code>conol.ai</code>, find the <strong>Cookie</strong> request header, and copy its complete value</li>
                            <li>Copy and paste this code in the Console to get the Account ID:</li>
                          </ol>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={async () => {
                                const code = `(()=>{\n  if (!location.hostname.endsWith("conol.ai"))\n    return console.error("Use this on conol.ai");\n  const accountId = location.pathname.match(/\\/accounts\\/([^/]+)/)?.[1] || "(not found)";\n  console.log("Account ID: " + accountId);\n})();`;
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
{`(()=>{
  if (!location.hostname.endsWith("conol.ai"))
    return console.error("Use this on conol.ai");
  const accountId = location.pathname.match(/\\/accounts\\/([^/]+)/)?.[1] || "(not found)";
  console.log("Account ID: " + accountId);
})();`}
                            </pre>
                          </div>
                          <p>Press <kbd className="rounded border bg-muted px-1 font-mono">Enter</kbd>, then paste the Account ID into the Account ID field and the complete cookie string into the Cookie field above.</p>
                        </div>
                      ) : selectedType?.protocol === "qwen" ? (
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
                                const code = `javascript:(()=>{\n  if (location.hostname !== "chat.qwen.ai")\n    return alert("🚀 Use on chat.qwen.ai");\n  const token = localStorage.getItem("token");\n  if (!token)\n    return console.log("❌ Token not found");\n  console.log("🔑 Qwen access_token:\\n", token);\n})();`;
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
    return alert("🚀 Use on chat.qwen.ai");
  const token = localStorage.getItem("token");
  if (!token)
    return console.log("❌ Token not found");
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
                      </>
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
