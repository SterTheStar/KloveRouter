import { useEffect, useRef, useState } from "react";
import { RiArrowLeftSLine as ArrowLeft } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  antigravity,
  codex,
  deepai,
  openfreeCli,
  providers,
  type OpenFreeCliStatus,
} from "../api/client";
import { useToast } from "./ui/toast";
import {
  PROVIDER_TEMPLATES,
  type ProviderTemplate,
} from "../lib/provider-templates";
import type { ProviderBillingType } from "@/types";
import { isEndpointFavicon, isPersistableAvatar, logoToDataUrl } from "@/lib/provider-icons";
import { invalidateProviders } from "../lib/query-cache";
import {
  ProviderListColumn,
  ProviderInfoColumn,
  ProviderAuthForm,
} from "./providers";

function defaultBillingForTemplate(template: ProviderTemplate | null): ProviderBillingType {
  if (!template) return "pay_as_you_go";
  if (template.protocol === "openfree") return "free";
  const normName = template.name.toLowerCase();
  if (
    template.protocol === "antigravity" ||
    template.protocol === "codex" ||
    template.protocol === "chatgpt" ||
    template.protocol === "perch" ||
    template.protocol === "deepai" ||
    normName.includes("perch") ||
    normName.includes("deepcode")
  ) {
    return "subscription";
  }
  return "pay_as_you_go";
}

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
  const [selectedType, setSelectedType] = useState<ProviderTemplate | null>(
    () => PROVIDER_TEMPLATES[0] ?? null,
  );
  const [billingType, setBillingType] = useState<ProviderBillingType>(() =>
    defaultBillingForTemplate(PROVIDER_TEMPLATES[0] ?? null),
  );
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
    protocol: "codex" | "antigravity" | "deepai";
    providerId: string;
    credentialId: string;
    authUrl: string;
  } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [completingOAuth, setCompletingOAuth] = useState(false);
  const pollRef = useRef<number | null>(null);
  const oauthFinishedRef = useRef(false);

  const unavailableProtocols = new Set(["chatgpt", "freebuff"]);

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
    setSelectedType(PROVIDER_TEMPLATES[0] ?? null);
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

  const finishOAuth = (protocol: "codex" | "antigravity" | "deepai") => {
    if (oauthFinishedRef.current) return;
    oauthFinishedRef.current = true;
    clearPoll();
    invalidateProviders();
    success(
      "Account connected",
      protocol === "codex"
        ? "Codex is ready to use."
        : protocol === "deepai"
          ? "DeepAI Code is ready to use."
          : "Google Antigravity is ready to use.",
    );
    onSuccess();
    reset();
    onClose();
  };

  const waitForOAuth = (
    protocol: "codex" | "antigravity" | "deepai",
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
          (await providers.credentialStatus(providerId, credentialId)).authenticated
        ) {
          finishOAuth(protocol);
        } else if (Date.now() - started > (protocol === "deepai" ? 10 : 5) * 60_000) {
          clearPoll();
          setLoading(false);
          setError("OAuth login timed out. Start a new login and paste its callback URL.");
        }
      } catch {
        /* Keep polling during browser login. */
      }
    }, 1500);
  };

  const completeOAuthManually = async () => {
    if (!pendingOAuth || oauthFinishedRef.current || !callbackUrl.trim()) {
      return setError("Paste the complete localhost callback URL.");
    }
    setCompletingOAuth(true);
    setError(null);
    try {
      if (pendingOAuth.protocol === "deepai") {
        const callback = new URL(callbackUrl.trim());
        if (
          callback.protocol !== "http:" ||
          !["127.0.0.1", "localhost", "[::1]"].includes(callback.hostname) ||
          !callback.port ||
          callback.pathname !== "/auth-callback"
        ) {
          throw new Error("Expected the DeepAI loopback callback URL");
        }
        const code = callback.searchParams.get("code");
        const state = callback.searchParams.get("state");
        if (!code || !state || callback.searchParams.has("error")) {
          throw new Error("Callback URL is missing valid DeepAI code and state");
        }
        await deepai.completeLogin(pendingOAuth.credentialId, code, state);
      } else if (pendingOAuth.protocol === "codex") {
        await codex.completeLogin(callbackUrl.trim(), pendingOAuth.credentialId);
      } else {
        await antigravity.completeLogin(callbackUrl.trim(), pendingOAuth.credentialId);
      }
      finishOAuth(pendingOAuth.protocol);
    } catch (e: any) {
      try {
        if ((await providers.credentialStatus(pendingOAuth.providerId, pendingOAuth.credentialId)).authenticated) {
          return finishOAuth(pendingOAuth.protocol);
        }
      } catch {
        /* Report original error */
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
      pendingOAuth.protocol === "deepai"
        ? "saturn-deepai-login"
        : pendingOAuth.protocol === "codex"
          ? "saturn-codex-login"
          : "saturn-antigravity-login",
      "popup,width=520,height=720",
    );
    setLoading(true);
    setError(null);
    setCallbackUrl("");
    try {
      const result =
        pendingOAuth.protocol === "deepai"
          ? await deepai.login(pendingOAuth.credentialId)
          : pendingOAuth.protocol === "codex"
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
    setBillingType(defaultBillingForTemplate(type));
    setAvatar(null);
    setAvatarManuallySet(false);
    setError(null);
    setStep("form");
  };

  const startDeepAIConnection = async () => {
    if (!name || !baseUrl) return setError("Provider name and base URL are required.");
    const popup = window.open("about:blank", "saturn-deepai-login", "popup,width=520,height=720");
    setLoading(true);
    setError(null);
    let createdProviderId: string | null = null;
    try {
      const created = await providers.create({
        name,
        base_url: baseUrl,
        protocol: "deepai",
        billing_type: billingType,
        avatar: await resolveAvatarPayload(),
      });
      createdProviderId = created.id;
      const credential = (await providers.credentials(created.id)).find((item) => item.kind === "api_key");
      if (!credential) throw new Error("Could not create the DeepAI account credential");
      const login = await deepai.login(credential.id);
      if (popup) popup.location.href = login.auth_url;
      setLoading(false);
      waitForOAuth("deepai", created.id, credential.id, login.auth_url);
    } catch (cause: any) {
      popup?.close();
      if (createdProviderId) await providers.remove(createdProviderId).catch(() => {});
      const message = cause?.message ?? "Could not start DeepAI Code sign-in";
      setLoading(false);
      setError(message);
      notifyError("Could not connect DeepAI Code", message);
    }
  };

  const connectAntigravity = async () => {
    const popup = window.open("about:blank", "saturn-antigravity-login", "popup,width=520,height=720");
    let createdProviderId: string | null = null;
    setLoading(true);
    setError(null);
    try {
      const provider = await providers.create({
        name: name.trim() || "antigravity",
        base_url: baseUrl || "https://daily-cloudcode-pa.googleapis.com",
        protocol: "antigravity",
        billing_type: billingType,
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
      if (createdProviderId) await providers.remove(createdProviderId).catch(() => {});
      setError(e.message);
      notifyError("Could not connect Google", e.message);
      setLoading(false);
    }
  };

  const connectCodex = async () => {
    const popup = window.open("about:blank", "saturn-codex-login", "popup,width=520,height=720");
    let createdProviderId: string | null = null;
    setLoading(true);
    setError(null);
    try {
      const provider = await providers.create({
        name: name.trim() || "codex",
        base_url: baseUrl || "https://chatgpt.com/backend-api/codex",
        api_key: "codex-session",
        protocol: "codex",
        billing_type: billingType,
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
      if (createdProviderId) await providers.remove(createdProviderId).catch(() => {});
      setError(e.message);
      notifyError("Could not connect Codex", e.message);
      setLoading(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (selectedType?.protocol === "deepai") return startDeepAIConnection();
    if (selectedType?.protocol === "codex") return connectCodex();
    if (selectedType?.protocol === "antigravity") return connectAntigravity();
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
        `Installed in SaturnRouter's managed folder: ${status.managed_path}`,
      );
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      notifyError("Could not install OpenCode CLI", message);
    } finally {
      setInstallingOpenfreeCli(false);
    }
  };

  const resolveAvatarPayload = async (): Promise<string | undefined> => {
    if (avatarManuallySet) return isPersistableAvatar(avatar) ? avatar : undefined;
    const logo = selectedType?.logo;
    if (!logo || isEndpointFavicon(logo)) return undefined;
    if (logo.startsWith("/api/media/avatars/")) return logo;
    return (await logoToDataUrl(logo)) ?? undefined;
  };

  const submit = async (skipVerification: boolean) => {
    if (selectedType?.protocol === "openfree" && !apiKey.trim()) {
      return setError("Enter your OpenCode Zen API key.");
    }
    if (selectedType?.protocol !== "openfree" && (!name || !baseUrl)) {
      return setError("Provider name and base URL are required.");
    }
    const conolParsedAccountId =
      selectedType?.protocol === "conol"
        ? (conolAccountId.trim() || undefined)
        : undefined;

    const hasCredentialToVerify =
      selectedType?.protocol === "chatgpt"
        ? Boolean(cookieFile)
        : selectedType?.protocol === "freebuff" ||
            selectedType?.protocol === "qwen" ||
            selectedType?.protocol === "atomesus" ||
            selectedType?.protocol === "conol" ||
            selectedType?.protocol === "perch"
          ? Boolean(authCode.trim())
          : Boolean(apiKey.trim());

    const shouldVerify =
      !skipVerification && hasCredentialToVerify && selectedType?.protocol !== "openfree";

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

      if (shouldVerify && selectedType?.protocol !== "chatgpt") {
        await providers.validateCredential({
          base_url: baseUrl,
          ...(selectedType?.protocol === "freebuff" ||
          selectedType?.protocol === "qwen" ||
          selectedType?.protocol === "atomesus" ||
          selectedType?.protocol === "perch"
            ? { auth_code: authCode }
            : selectedType?.protocol === "conol"
              ? { secret: authCode, account_id: conolParsedAccountId }
              : { api_key: apiKey }),
          protocol: selectedType?.protocol,
        });
      }

      setVerifying(false);
      const created = await providers.create({
        name,
        base_url: baseUrl,
        ...(selectedType?.protocol === "chatgpt"
          ? {}
          : selectedType?.protocol === "openfree"
            ? (apiKey.trim() ? { api_key: apiKey.trim() } : {})
            : selectedType?.protocol === "freebuff" ||
                selectedType?.protocol === "qwen" ||
                selectedType?.protocol === "atomesus" ||
                selectedType?.protocol === "perch"
              ? (authCode.trim() ? { auth_code: authCode } : {})
              : selectedType?.protocol === "conol"
                ? { secret: authCode, account_id: conolParsedAccountId }
                : { api_key: apiKey }),
        protocol: selectedType?.protocol,
        billing_type: billingType,
        avatar: await resolveAvatarPayload(),
      });

      if (selectedType?.protocol === "chatgpt" && cookieFile) {
        await providers.uploadCookies(created.id, cookieFile);
      }

      invalidateProviders();
      success(
        "Provider added",
        openfreeLoginWarning
          ? `The API key is saved. ${openfreeLoginWarning}`
          : `${name} is ready to use.`,
      );
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl h-[85vh] max-h-[740px] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            {step === "form" && (
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
            )}
            <div>
              <DialogTitle className="text-sm font-normal">
                {step === "select" ? "Add provider" : `Configure ${selectedType?.name || "Provider"}`}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {step === "select"
                  ? "Choose a provider template to connect and access its language models."
                  : "Review provider details and enter your connection parameters."}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* 2-Column Content Body */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {step === "select" ? (
            <>
              {/* Left Column: Search & Provider List */}
              <div className="flex flex-col md:col-span-5 border-r border-border p-4 min-h-0 overflow-hidden">
                <ProviderListColumn
                  templates={PROVIDER_TEMPLATES}
                  selectedTemplate={selectedType}
                  onSelect={(tpl) => setSelectedType(tpl)}
                  onConfirm={(tpl) => selectType(tpl)}
                  unavailableProtocols={unavailableProtocols}
                />
              </div>

              {/* Right Column: Provider Details Preview & Action */}
              <div className="flex flex-col md:col-span-7 p-5 min-h-0 overflow-hidden bg-muted/10">
                <ProviderInfoColumn
                  template={selectedType}
                  onSelect={(tpl) => selectType(tpl)}
                  mode="select"
                  unavailableProtocols={unavailableProtocols}
                />
              </div>
            </>
          ) : (
            <>
              {/* Left Column: Provider Info & Reference Guide */}
              <div className="flex flex-col md:col-span-5 border-r border-border p-5 min-h-0 overflow-hidden bg-muted/10">
                <ProviderInfoColumn
                  template={selectedType}
                  mode="form"
                  unavailableProtocols={unavailableProtocols}
                />
              </div>

              {/* Right Column: Connection Form Inputs & Actions */}
              <div className="flex flex-col md:col-span-7 p-5 min-h-0 overflow-hidden">
                {selectedType && (
                  <ProviderAuthForm
                    template={selectedType}
                    name={name}
                    setName={setName}
                    baseUrl={baseUrl}
                    setBaseUrl={setBaseUrl}
                    apiKey={apiKey}
                    setApiKey={setApiKey}
                    authCode={authCode}
                    setAuthCode={setAuthCode}
                    conolAccountId={conolAccountId}
                    setConolAccountId={setConolAccountId}
                    cookieFile={cookieFile}
                    setCookieFile={setCookieFile}
                    avatar={avatar}
                    setAvatar={setAvatar}
                    avatarManuallySet={avatarManuallySet}
                    setAvatarManuallySet={setAvatarManuallySet}
                    billingType={billingType}
                    setBillingType={setBillingType}
                    notifyError={notifyError}
                    openfreeCliStatus={openfreeCliStatus}
                    openfreeCliPath={openfreeCliPath}
                    setOpenfreeCliPath={setOpenfreeCliPath}
                    checkingOpenfreeCli={checkingOpenfreeCli}
                    savingOpenfreeCliPath={savingOpenfreeCliPath}
                    installingOpenfreeCli={installingOpenfreeCli}
                    onSaveOpenfreeCli={saveOpenfreeCli}
                    onInstallOpenfreeCli={installManagedOpenfreeCli}
                    pendingOAuth={pendingOAuth}
                    callbackUrl={callbackUrl}
                    setCallbackUrl={setCallbackUrl}
                    completingOAuth={completingOAuth}
                    onCompleteOAuthManually={completeOAuthManually}
                    onRestartOAuth={restartOAuth}
                    loading={loading}
                    verifying={verifying}
                    verificationWarning={verificationWarning}
                    error={error}
                    onDismissWarning={() => setVerificationWarning(null)}
                    onSubmit={submit}
                    onConnectOAuth={handleOAuthConnect}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
