import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RiAddLine as Add,
  RiArrowDownSLine as ChevronDown,
  RiArrowLeftLine as ArrowLeft,
  RiCheckLine as Check,
  RiCloseCircleLine as CloseCircle,
  RiCloseLine as CloseLine,
  RiFileCopyLine as Copy,
  RiEyeLine as Eye,
  RiEyeOffLine as EyeOff,
  RiLoader4Line as LoaderCircle,
  RiLoginBoxLine as LoginIcon,
  RiLogoutBoxLine as LogoutIcon,
  RiPencilLine as Pencil,
  RiRefreshLine as RefreshCw,
  RiDeleteBinLine as Trash2,
  RiSearchLine as Search,
  RiPlayCircleLine as PlayCircleLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AvatarUpload from "../components/AvatarUpload";
import AddModelModal from "../components/AddModelModal";
import EditModelModal from "../components/EditModelModal";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  antigravity,
  codex,
  providers,
  models as modelsApi,
} from "../api/client";
import type {
  Model,
  ModelCapabilities,
  Provider,
  ProviderCredential,
} from "../types";
import { copyToClipboard } from "../lib/clipboard";
import { useToast } from "../components/ui/toast";

const metadataCapabilityLabels: Record<keyof ModelCapabilities, string> = {
  reasoning: "Reasoning",
  tools: "Tools",
  vision: "Vision",
  attachments: "Files",
  streaming: "Streaming",
  non_streaming: "Non-streaming",
};

function formatTokenLimit(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return value.toLocaleString();
}

function ModelMetadataBadges({ model }: { model: Model }) {
  const supported = (
    Object.keys(metadataCapabilityLabels) as (keyof ModelCapabilities)[]
  ).filter((key) => model.capabilities?.[key] === true);
  if (model.context_window == null && !supported.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {model.context_window != null && (
        <Badge variant="outline" className="font-mono text-[10px]">
          {formatTokenLimit(model.context_window)} context
        </Badge>
      )}
      {supported.map((key) => (
        <Badge key={key} variant="secondary" className="text-[10px]">
          {metadataCapabilityLabels[key]}
        </Badge>
      ))}
    </div>
  );
}

export default function ProviderDetailPage({
  providerId,
  onBack,
}: {
  providerId: string;
  onBack: () => void;
}) {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [list, setList] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{
    models_found: number;
    existing_models: number;
    models_to_add: number;
    free_models_found: number;
    free_existing_models: number;
    free_models_to_add: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Model | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Model | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, "success" | "error">
  >({});

  const filteredList = useMemo(() => {
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.model_id.toLowerCase().includes(q) ||
          (m.display_name?.toLowerCase().includes(q) ?? false),
      );
    }
    if (freeOnly) {
      result = result.filter(
        (m) =>
          m.model_id.toLowerCase().includes("free") ||
          (m.display_name?.toLowerCase().includes("free") ?? false),
      );
    }
    return result;
  }, [list, searchQuery, freeOnly]);
  const [clearOpen, setClearOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const newKeyLabelRef = useRef<HTMLInputElement>(null);
  const newKeySecretRef = useRef<HTMLInputElement>(null);
  const newAuthCodeRef = useRef<HTMLInputElement>(null);
  const [addingKey, setAddingKey] = useState(false);
  const [showAddKey, setShowAddKey] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [loadingSecretId, setLoadingSecretId] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [authAction, setAuthAction] = useState<"login" | "logout" | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [credentialAction, setCredentialAction] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutCredentialId, setLogoutCredentialId] = useState<string | null>(
    null,
  );
  const [routingSaving, setRoutingSaving] = useState(false);
  const [manualOAuth, setManualOAuth] = useState<{
    protocol: "codex" | "antigravity";
    credentialId: string;
    authUrl: string;
  } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [completingOAuth, setCompletingOAuth] = useState(false);
  const oauthPollRef = useRef<number | null>(null);
  const oauthFinishedRef = useRef(false);

  const routableCredentials = useMemo(
    () =>
      credentials.filter((credential) => {
        if (!credential.is_active) return false;
        if (credential.kind === "api_key" || credential.kind === "freebuff" || credential.kind === "qwen" || credential.kind === "atomesus")
          return Boolean(credential.masked_secret);
        return Boolean(
          credential.account_id || credential.email || credential.project_id,
        );
      }),
    [credentials],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [current, models, providerCredentials] = await Promise.all([
        providers.get(providerId),
        modelsApi.listByProvider(providerId),
        providers.credentials(providerId),
      ]);
      const account =
        current.protocol === "codex" ? await codex.status() : null;
      setProvider(current);
      setList(models);
      setName(current.name);
      setBaseUrl(current.base_url);
      setAvatar(current.avatar_override ?? null);
      setConnectedAccount(
        providerCredentials.find(
          (credential) => credential.kind === "codex" && credential.account_id,
        )?.account_id ??
          account?.account_id ??
          null,
      );
      setCredentials(providerCredentials);
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not load provider", e.message);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const clearOAuthPoll = () => {
    if (oauthPollRef.current !== null) {
      window.clearInterval(oauthPollRef.current);
      oauthPollRef.current = null;
    }
  };
  useEffect(() => {
    load();
    return () => clearOAuthPoll();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await providers.update(providerId, {
        name,
        base_url: baseUrl,
        avatar,
      });
      setProvider(updated);
      setSuccess("Provider updated.");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not update provider", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openSync = async () => {
    setSyncing(true);
    try {
      const result = await modelsApi.sync(providerId, { preview: true });
      setSyncPreview({
        models_found: result.models_found,
        existing_models: result.existing_models ?? 0,
        models_to_add: result.models_to_add ?? 0,
        free_models_found: result.free_models_found ?? 0,
        free_existing_models: result.free_existing_models ?? 0,
        free_models_to_add: result.free_models_to_add ?? 0,
      });
      setSyncOpen(true);
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not preview model sync", e.message);
    } finally {
      setSyncing(false);
    }
  };

  const sync = async (freeOnly = false, existingOnly = false) => {
    setSyncing(true);
    try {
      const result = await modelsApi.sync(providerId, {
        freeOnly,
        existingOnly,
        resetExisting: existingOnly,
      });
      await load();
      setSyncOpen(false);
      setSyncPreview(null);
      setSuccess(result.message || "Models synchronized successfully.");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not sync models", e.message);
    } finally {
      setSyncing(false);
    }
  };

  const waitForOAuth = (
    protocol: "codex" | "antigravity",
    credentialId: string,
  ) => {
    const started = Date.now();
    oauthFinishedRef.current = false;
    clearOAuthPoll();
    oauthPollRef.current = window.setInterval(async () => {
      try {
        const status = await providers.credentialStatus(
          providerId,
          credentialId,
        );
        if (oauthFinishedRef.current) return;
        if (status.authenticated) {
          oauthFinishedRef.current = true;
          clearOAuthPoll();
          setManualOAuth(null);
          setCredentialAction(false);
          setSuccess(
            `${protocol === "antigravity" ? "Google Antigravity" : "Codex"} account connected.`,
          );
          notifySuccess("Account connected");
          await load();
        } else if (Date.now() - started > 5 * 60_000) {
          clearOAuthPoll();
          setCredentialAction(false);
          setError(
            "OAuth login timed out. Restart the login and paste its callback URL.",
          );
          notifyError("Login timed out");
        }
      } catch {
        /* Keep polling during browser login. */
      }
    }, 1500);
  };

  const addOAuthAccount = async () => {
    if (!provider) return;
    const isAntigravity = provider.protocol === "antigravity";
    const popup = window.open(
      "about:blank",
      isAntigravity ? "klove-antigravity-login" : "klove-codex-login",
      "popup,width=520,height=720",
    );
    let createdCredentialId: string | null = null;
    setCredentialAction(true);
    setError(null);
    try {
      const credential = await providers.addCredential(providerId, {
        label: `${isAntigravity ? "Google" : "Codex"} account ${credentials.length + 1}`,
        kind: isAntigravity ? "antigravity" : "codex",
      });
      createdCredentialId = credential.id;
      const result = isAntigravity
        ? await antigravity.login(credential.id)
        : await codex.login(credential.id);
      if (popup) popup.location.href = result.auth_url;
      const protocol = isAntigravity ? "antigravity" : "codex";
      setManualOAuth({
        protocol,
        credentialId: credential.id,
        authUrl: result.auth_url,
      });
      setCallbackUrl("");
      waitForOAuth(protocol, credential.id);
    } catch (e: any) {
      popup?.close();
      if (createdCredentialId)
        await providers
          .removeCredential(providerId, createdCredentialId)
          .catch(() => {});
      setError(e.message);
      notifyError("Could not connect account", e.message);
      setCredentialAction(false);
    }
  };

  const completeOAuthManually = async () => {
    if (!manualOAuth || oauthFinishedRef.current || !callbackUrl.trim()) return;
    setCompletingOAuth(true);
    setError(null);
    try {
      if (manualOAuth.protocol === "codex")
        await codex.completeLogin(callbackUrl.trim(), manualOAuth.credentialId);
      else
        await antigravity.completeLogin(
          callbackUrl.trim(),
          manualOAuth.credentialId,
        );
      oauthFinishedRef.current = true;
      clearOAuthPoll();
      setManualOAuth(null);
      setCallbackUrl("");
      setCredentialAction(false);
      setSuccess(
        `${manualOAuth.protocol === "codex" ? "Codex" : "Google Antigravity"} account connected.`,
      );
      notifySuccess("Account connected");
      await load();
    } catch (e: any) {
      try {
        if (
          (
            await providers.credentialStatus(
              providerId,
              manualOAuth.credentialId,
            )
          ).authenticated
        ) {
          oauthFinishedRef.current = true;
          clearOAuthPoll();
          setManualOAuth(null);
          setCallbackUrl("");
          setCredentialAction(false);
          await load();
          return;
        }
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
    if (!manualOAuth) return;
    const popup = window.open(
      "about:blank",
      manualOAuth.protocol === "codex"
        ? "klove-codex-login"
        : "klove-antigravity-login",
      "popup,width=520,height=720",
    );
    setCompletingOAuth(true);
    setError(null);
    setCallbackUrl("");
    try {
      const result =
        manualOAuth.protocol === "codex"
          ? await codex.login(manualOAuth.credentialId)
          : await antigravity.login(manualOAuth.credentialId);
      if (popup) popup.location.href = result.auth_url;
      setManualOAuth({ ...manualOAuth, authUrl: result.auth_url });
      waitForOAuth(manualOAuth.protocol, manualOAuth.credentialId);
    } catch (e: any) {
      popup?.close();
      setError(e.message);
      notifyError("Could not restart OAuth", e.message);
    } finally {
      setCompletingOAuth(false);
    }
  };

  const cancelManualOAuth = () => {
    oauthFinishedRef.current = true;
    clearOAuthPoll();
    const credentialId = manualOAuth?.credentialId;
    setManualOAuth(null);
    setCallbackUrl("");
    setCredentialAction(false);
    if (credentialId)
      void providers
        .removeCredential(providerId, credentialId)
        .then(() => load())
        .catch(() => {});
  };

  const logoutCodex = async () => {
    if (!logoutCredentialId) return;
    setAuthAction("logout");
    setError(null);
    try {
      await providers.disconnectCredential(providerId, logoutCredentialId);
      setLogoutOpen(false);
      setLogoutCredentialId(null);
      setSuccess("Codex account disconnected. The account was kept.");
      await load();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not disconnect account", e.message);
    } finally {
      setAuthAction(null);
    }
  };

  const setCredentialMode = async (
    mode: "fixed" | "round_robin",
    fixedId?: string | null,
  ) => {
    const selectedId =
      mode === "fixed"
        ? (fixedId ??
          provider?.fixed_credential_id ??
          routableCredentials[0]?.id ??
          null)
        : null;
    if (mode === "fixed" && !selectedId)
      return notifyError(
        "No credential available",
        "Add or connect a credential before selecting fixed routing.",
      );
    setRoutingSaving(true);
    try {
      const updated = await providers.update(providerId, {
        credential_mode: mode,
        fixed_credential_id: selectedId,
      });
      setProvider(updated);
      notifySuccess(
        mode === "round_robin"
          ? "Round robin enabled"
          : "Fixed credential selected",
      );
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not update credential selection", e.message);
    } finally {
      setRoutingSaving(false);
    }
  };

  const addApiKey = async () => {
    const label = newKeyLabelRef.current?.value.trim() ?? "";
    const secret = newKeySecretRef.current?.value ?? "";
    if (!label || !secret.trim()) {
      setError("Key label and value are required.");
      return;
    }
    setAddingKey(true);
    setError(null);
    try {
      await providers.addCredential(providerId, {
        label,
        kind: "api_key",
        secret,
      });
      if (newKeyLabelRef.current) newKeyLabelRef.current.value = "";
      if (newKeySecretRef.current) newKeySecretRef.current.value = "";
      setShowAddKey(false);
      setSuccess("API key added.");
      await load();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not add API key", e.message);
    } finally {
      setAddingKey(false);
    }
  };

  const addFreebuffAuthCode = async () => {
    if (!provider) return;
    const label = newKeyLabelRef.current?.value.trim() ?? "";
    const authCode = newAuthCodeRef.current?.value.trim() ?? "";
    if (!label || !authCode) {
      setError("Auth code label and value are required.");
      return;
    }
    setAddingKey(true);
    setError(null);
    try {
      await providers.addCredential(providerId, {
        label,
        kind: provider.protocol === "qwen" ? "qwen" : provider.protocol === "atomesus" ? "atomesus" : "freebuff",
        secret: authCode,
      });
      if (newKeyLabelRef.current) newKeyLabelRef.current.value = "";
      if (newAuthCodeRef.current) newAuthCodeRef.current.value = "";
      setShowAddKey(false);
      setSuccess(provider.protocol === "atomesus" ? "Atomesus token added." : provider.protocol === "qwen" ? "Qwen auth code added." : "Freebuff auth code added.");
      await load();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not add auth code", e.message);
    } finally {
      setAddingKey(false);
    }
  };

  const removeApiKey = async (credentialId: string) => {
    try {
      await providers.removeCredential(providerId, credentialId);
      setSuccess("API key removed.");
      await load();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not remove API key", e.message);
    }
  };

  const toggleApiKeyVisibility = async (credential: ProviderCredential) => {
    if (revealedKeys[credential.id] !== undefined) {
      setRevealedKeys((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      return;
    }
    setLoadingSecretId(credential.id);
    try {
      const result = await providers.credentialSecret(
        providerId,
        credential.id,
      );
      setRevealedKeys((current) => ({
        ...current,
        [credential.id]: result.secret || "",
      }));
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not reveal API key", e.message);
    } finally {
      setLoadingSecretId(null);
    }
  };

  const copyCredentialSecret = async (credential: ProviderCredential) => {
    setLoadingSecretId(credential.id);
    try {
      const secret =
        revealedKeys[credential.id] ??
        (await providers.credentialSecret(providerId, credential.id)).secret;
      if (!secret) throw new Error("This credential has no API key");
      await copy(secret, "API key copied");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not copy API key", e.message);
    } finally {
      setLoadingSecretId(null);
    }
  };

  const copy = async (value: string, label = "Copied to clipboard") => {
    try {
      await copyToClipboard(value);
      notifySuccess(label);
    } catch (e: any) {
      notifyError(
        "Could not copy",
        e.message || "Clipboard access was denied.",
      );
    }
  };
  const testModel = async (id: string) => {
    setTestingId(id);
    try {
      const result = await modelsApi.test(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: result.success ? "success" : "error",
      }));
      result.success
        ? notifySuccess("Model test passed")
        : notifyError(
            "Model test failed",
            "The provider did not return a successful response.",
          );
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: "error" }));
      notifyError("Model test failed", "Could not reach the provider.");
    }
    setTestingId(null);
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!provider)
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Provider not found.</AlertDescription>
        </Alert>
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Provider configuration
        </h1>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <Check className="size-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Connection settings</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            {(provider.protocol === "codex" ||
              provider.protocol === "antigravity" ||
              provider.protocol === "freebuff" ||
              provider.protocol === "qwen" ||
              provider.protocol === "atomesus") && (
              <>
                <Button
                  variant="outline"
                  onClick={provider.protocol === "freebuff" || provider.protocol === "qwen" || provider.protocol === "atomesus" ? () => {
                    setShowAddKey(true);
                    document.getElementById("provider-credentials")?.scrollIntoView({ behavior: "smooth" });
                  } : addOAuthAccount}
                  disabled={credentialAction}
                >
                  {credentialAction ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <LoginIcon className="size-4" />
                  )}
                  {provider.protocol === "atomesus" ? "Add token" : provider.protocol === "freebuff" || provider.protocol === "qwen" ? "Add auth code" : "Connect account"}
                </Button>
                {provider.protocol !== "freebuff" && provider.protocol !== "qwen" && provider.protocol !== "atomesus" && credentials.some(
                  (credential) =>
                    (credential.kind === "codex" ||
                      credential.kind === "antigravity") &&
                    (credential.account_id || credential.email),
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => setLogoutOpen(true)}
                    disabled={authAction !== null}
                  >
                    <LogoutIcon className="size-4" />
                    Log out
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" onClick={openSync} disabled={syncing}>
              {syncing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sync models
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <AvatarUpload
            value={avatar}
            sources={provider.avatar_sources}
            name={name}
            onChange={setAvatar}
            label="Provider avatar"
            onError={(message) => notifyError("Invalid avatar", message)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider-name">Provider name</Label>
              <Input
                id="provider-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url">Base URL</Label>
              <Input
                id="provider-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </div>
          {routableCredentials.length > 1 && (
            <div className="space-y-2">
              <Label>Credential routing</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        disabled={
                          routingSaving || routableCredentials.length === 0
                        }
                      />
                    }
                  >
                    {provider.credential_mode === "round_robin"
                      ? "Round robin"
                      : "Fixed credential"}
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[var(--anchor-width)]">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Routing strategy</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={provider.credential_mode ?? "fixed"}
                        onValueChange={(value) =>
                          setCredentialMode(value as "fixed" | "round_robin")
                        }
                      >
                        <DropdownMenuRadioItem value="fixed">
                          Fixed credential
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem
                          value="round_robin"
                          disabled={routableCredentials.length < 2}
                        >
                          Round robin
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        disabled={
                          routingSaving ||
                          provider.credential_mode === "round_robin" ||
                          routableCredentials.length === 0
                        }
                      />
                    }
                  >
                    <span className="truncate">
                      {routableCredentials.find(
                        (credential) =>
                          credential.id === provider.fixed_credential_id,
                      )?.label ??
                        routableCredentials[0]?.label ??
                        "No credential"}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[var(--anchor-width)]">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Fixed credential</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={
                          provider.fixed_credential_id ??
                          routableCredentials[0]?.id ??
                          ""
                        }
                        onValueChange={(value) =>
                          setCredentialMode("fixed", value)
                        }
                      >
                        {routableCredentials.map((credential) => (
                          <DropdownMenuRadioItem
                            key={credential.id}
                            value={credential.id}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">
                                {credential.label}
                              </span>
                              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                                {credential.email ||
                                  credential.account_id ||
                                  credential.masked_secret ||
                                  credential.id}
                              </span>
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                {provider.credential_mode === "round_robin"
                  ? `Requests rotate across ${routableCredentials.length} active credentials, selecting the least recently used.`
                  : "Every request uses the selected credential. If it becomes unavailable, the backend falls back to another active credential."}
              </p>
            </div>
          )}
          {provider.protocol === "codex" ||
          provider.protocol === "antigravity" ? (
            <div className="space-y-2">
              <Label>Connected accounts</Label>
              <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                {credentials.filter(
                  (credential) =>
                    (credential.kind === "codex" ||
                      credential.kind === "antigravity") &&
                    (credential.account_id || credential.email),
                ).length > 0 ? (
                  credentials
                    .filter(
                      (credential) =>
                        (credential.kind === "codex" ||
                          credential.kind === "antigravity") &&
                        (credential.account_id || credential.email),
                    )
                    .map((credential) => (
                      <div
                        key={credential.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{credential.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {credential.kind === "antigravity"
                            ? credential.id
                            : credential.account_id || credential.project_id}
                        </span>
                      </div>
                    ))
                ) : (
                  <span className="text-muted-foreground">
                    No account connected
                  </span>
                )}
              </div>
            </div>
          ) : provider.protocol === "freebuff" || provider.protocol === "qwen" || provider.protocol === "atomesus" ? (
            <div id="provider-credentials" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                   <Label>{provider.protocol === "atomesus" ? "Atomesus tokens" : provider.protocol === "qwen" ? "Qwen auth codes" : "Freebuff auth codes"}</Label>
                  <p className="text-xs text-muted-foreground">
                     Tokens are stored encrypted and rotated according to the selected routing strategy.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddKey((value) => !value)}
                >
                  {showAddKey ? <CloseCircle className="size-4" /> : <Add className="size-4" />}
                  {showAddKey ? "Cancel" : "Add auth code"}
                </Button>
              </div>
              <div className="space-y-2">
                {credentials.filter((credential) => credential.kind === "freebuff" || credential.kind === "qwen" || credential.kind === "atomesus").map((credential) => (
                  <div key={credential.id} className="grid items-center gap-2 border-b border-border/60 py-2 md:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1.8fr)_auto]">
                    <Input value={credential.label} readOnly className="h-9 bg-background" />
                    <Input value={credential.masked_secret ?? "Hidden auth code"} readOnly className="h-9 bg-background font-mono" />
                    <Button variant="destructive" size="icon" className="size-9" onClick={() => removeApiKey(credential.id)} title="Remove auth code">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {!credentials.some((credential) => credential.kind === "freebuff" || credential.kind === "qwen" || credential.kind === "atomesus") && (
                  <div className="text-xs text-muted-foreground">No auth codes configured.</div>
                )}
              </div>
              {showAddKey && (
                <div className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-[1fr_1.5fr_auto]">
                  <Input ref={newKeyLabelRef} placeholder="Auth code label" />
                    <Input ref={newAuthCodeRef} type="password" placeholder={provider.protocol === "atomesus" ? "Paste Atomesus bearer token" : provider.protocol === "qwen" ? "Paste Qwen auth token" : "Paste Freebuff auth code"} />
                  <Button onClick={addFreebuffAuthCode} disabled={addingKey}>
                    {addingKey ? <LoaderCircle className="size-4 animate-spin" /> : <Add className="size-4" />}
                    Add code
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>API keys</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddKey((value) => !value)}
                >
                  {showAddKey ? (
                    <CloseCircle className="size-4" />
                  ) : (
                    <Add className="size-4" />
                  )}
                  {showAddKey ? "Cancel" : "Add key"}
                </Button>
              </div>
              <div className="space-y-2">
                {credentials.filter(
                  (credential) => credential.kind === "api_key",
                ).length ? (
                  credentials
                    .filter((credential) => credential.kind === "api_key")
                    .map((credential) => {
                      const revealed = revealedKeys[credential.id];
                      return (
                        <div
                          key={credential.id}
                          className="grid items-center gap-2 border-b border-border/60 py-2 last:border-b-0 md:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1.8fr)_auto]"
                        >
                          <Input
                            value={credential.label}
                            readOnly
                            aria-label={`${credential.label} label`}
                            className="h-9 bg-background"
                          />
                          <div className="relative">
                            <Input
                              value={
                                revealed ??
                                credential.masked_secret ??
                                "Hidden key"
                              }
                              readOnly
                              type="text"
                              aria-label={`${credential.label} secret`}
                              className="h-9 bg-background pr-24 font-mono"
                            />
                            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() =>
                                  toggleApiKeyVisibility(credential)
                                }
                                disabled={loadingSecretId === credential.id}
                                title={
                                  revealed === undefined
                                    ? "Reveal API key"
                                    : "Hide API key"
                                }
                              >
                                {revealed === undefined ? (
                                  <Eye className="size-4" />
                                ) : (
                                  <EyeOff className="size-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => copyCredentialSecret(credential)}
                                disabled={loadingSecretId === credential.id}
                                title="Copy API key"
                              >
                                <Copy className="size-4" />
                              </Button>
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="size-9"
                            onClick={() => removeApiKey(credential.id)}
                            title="Remove API key"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No API keys configured.
                  </div>
                )}
              </div>
              {showAddKey && (
                <div className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-[1fr_1.5fr_auto]">
                  <Input ref={newKeyLabelRef} placeholder="Key label" />
                  <Input
                    ref={newKeySecretRef}
                    type="password"
                    placeholder="sk-..."
                  />
                  <Button onClick={addApiKey} disabled={addingKey}>
                    {addingKey ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Add className="size-4" />
                        Add key
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="plain" className="overflow-hidden p-0 gap-0">
        <CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)">
          <CardTitle>
            Models{" "}
            <span className="text-muted-foreground">({list.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="h-8 w-48 border-none bg-muted pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              variant={freeOnly ? "default" : "secondary"}
              size="sm"
              onClick={() => setFreeOnly(!freeOnly)}
            >
              Free
            </Button>
            {list.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setClearOpen(true)}
              >
                Delete all
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              Add model
            </Button>
          </div>
        </CardHeader>
        <Separator />
        {filteredList.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {list.length === 0
              ? "No models found. Sync the provider or add one manually."
              : "No models match your search."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model ID</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <div className="group flex items-center gap-1 font-mono text-xs">
                      <span>
                        {provider.name.toLowerCase().replace(/\s+/g, "")}/
                        {model.model_id}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 opacity-0 group-hover:opacity-100"
                              onClick={() =>
                                copy(
                                  `${provider.name.toLowerCase().replace(/\s+/g, "")}/${model.model_id}`,
                                )
                              }
                            />
                          }
                        >
                          <Copy className="size-3" />
                        </TooltipTrigger>
                        <TooltipContent>Copy model ID</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      {model.display_name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <ModelMetadataBadges model={model} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={model.is_manual ? "outline" : "secondary"}>
                      {model.is_manual ? "Manual" : "Auto-synced"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {provider.protocol === "qwen" && model.is_active === 0 && !model.is_manual ? (
                      <Badge variant="outline" className="text-muted-foreground">Not supported</Badge>
                    ) : (
                      <Switch
                        checked={model.is_active === 1}
                        onCheckedChange={async () => {
                          const updated = await modelsApi.toggle(model.id);
                          setList((items) =>
                            items.map((item) =>
                              item.id === model.id
                                ? { ...item, is_active: updated.is_active }
                                : item,
                            ),
                          );
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      {testResult[model.id] === "success" ? (
                        <span className="flex size-7 items-center justify-center">
                          <Check className="block size-5 text-green-500" />
                        </span>
                      ) : testResult[model.id] === "error" ? (
                        <span className="flex size-7 items-center justify-center">
                          <CloseLine className="block size-5 text-destructive" />
                        </span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => testModel(model.id)}
                                disabled={testingId === model.id}
                              />
                            }
                          >
                            {testingId === model.id ? (
                              <LoaderCircle className="size-5 animate-spin" />
                            ) : (
                              <PlayCircleLine className="size-5" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>Test</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => setEditTarget(model)}
                            />
                          }
                        >
                          <Pencil className="size-5" />
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive"
                              onClick={() => setDeleteTarget(model)}
                            />
                          }
                        >
                          <Trash2 className="size-5" />
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Synchronize provider models</DialogTitle>
            <DialogDescription>
              Review the available models before updating this provider.
              Existing models will be refreshed and new models will be added.
            </DialogDescription>
          </DialogHeader>
          {syncPreview && (
            <p className="text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">
                {syncPreview.models_found}
              </strong>{" "}
              models found, including <strong className="font-semibold text-foreground">
                {syncPreview.models_to_add}
              </strong>{" "}
              new and <strong className="font-semibold text-foreground">
                {syncPreview.existing_models}
              </strong>{" "}
              already configured; <strong className="font-semibold text-foreground">
                {syncPreview.free_models_found}
              </strong>{" "}
              are free, including <strong className="font-semibold text-foreground">
                {syncPreview.free_models_to_add}
              </strong>{" "}
              new.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => sync(true)}
              disabled={syncing}
            >
              Sync free models ({syncPreview?.free_models_to_add ?? 0} new)
            </Button>
            <Button
              variant="outline"
              onClick={() => sync(false, true)}
              disabled={syncing || !syncPreview?.existing_models}
              title="Replace metadata for configured models without adding new models"
            >
              {syncing ? "Updating..." : `Reset existing (${syncPreview?.existing_models ?? 0})`}
            </Button>
            <Button onClick={() => sync(false)} disabled={syncing}>
              {syncing ? "Synchronizing..." : "Sync all models"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={logoutOpen}
        onOpenChange={(open) => {
          setLogoutOpen(open);
          if (!open) setLogoutCredentialId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out Codex account</DialogTitle>
            <DialogDescription>
              Select the account to disconnect. Other accounts will remain
              connected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {credentials
              .filter(
                (credential) =>
                  (credential.kind === "codex" ||
                    credential.kind === "antigravity") &&
                  (credential.account_id || credential.email),
              )
              .map((credential) => (
                <button
                  key={credential.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm ${logoutCredentialId === credential.id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
                  onClick={() => setLogoutCredentialId(credential.id)}
                >
                  <span>
                    <span className="block">{credential.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {credential.kind === "antigravity"
                        ? credential.id
                        : credential.account_id || credential.project_id}
                    </span>
                  </span>
                  {logoutCredentialId === credential.id && (
                    <Check className="size-4" />
                  )}
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={logoutCodex}
              disabled={!logoutCredentialId || authAction !== null}
            >
              {authAction === "logout" ? "Logging out..." : "Log out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!manualOAuth}
        onOpenChange={(open) => {
          if (!open) cancelManualOAuth();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete OAuth login</DialogTitle>
            <DialogDescription>
              If the browser stopped at localhost, copy the complete URL from
              its address bar and paste it below. You can also wait for
              automatic completion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="manual-oauth-callback">Callback URL</Label>
              {manualOAuth && (
                <a
                  href={manualOAuth.authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary underline underline-offset-4"
                >
                  Open authorization page
                </a>
              )}
            </div>
            <Textarea
              id="manual-oauth-callback"
              className="min-h-28 font-mono text-xs"
              value={callbackUrl}
              onChange={(event) => setCallbackUrl(event.target.value)}
              placeholder={`http://localhost:1455/${manualOAuth?.protocol === "codex" ? "auth" : "antigravity"}/callback?code=...&state=...`}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelManualOAuth}>
              Cancel
            </Button>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AddModelModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={load}
        providerId={providerId}
      />
      <EditModelModal
        isOpen={!!editTarget}
        model={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={load}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete model"
        message={`Remove ${deleteTarget?.model_id}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await modelsApi.remove(deleteTarget.id);
          setList((items) =>
            items.filter((item) => item.id !== deleteTarget.id),
          );
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={clearOpen}
        title="Delete all models"
        message={`Remove all ${list.length} models from ${provider.name}?`}
        confirmLabel="Delete all"
        onConfirm={async () => {
          await modelsApi.deleteAll(providerId);
          setList([]);
          setClearOpen(false);
        }}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
