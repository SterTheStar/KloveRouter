import { useState } from "react";
import { RiCoinsLine, RiVipCrownLine, RiCheckLine } from "@remixicon/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import AvatarUpload from "@/components/AvatarUpload";
import type { ProviderTemplate } from "@/lib/provider-templates";
import { faviconForEndpoint } from "@/lib/provider-icons";
import type { OpenFreeCliStatus } from "@/api/client";
import type { ProviderBillingType } from "@/types";
import { TermsWarning } from "./ProviderGuides";

type Props = {
  template: ProviderTemplate;
  name: string;
  setName: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  authCode: string;
  setAuthCode: (v: string) => void;
  conolAccountId: string;
  setConolAccountId: (v: string) => void;
  cookieFile: File | null;
  setCookieFile: (f: File | null) => void;
  avatar: string | null;
  setAvatar: (a: string | null) => void;
  avatarManuallySet: boolean;
  setAvatarManuallySet: (b: boolean) => void;
  billingType?: ProviderBillingType;
  setBillingType?: (b: ProviderBillingType) => void;
  notifyError: (title: string, message: string) => void;

  // OpenFREE
  openfreeCliStatus: OpenFreeCliStatus | null;
  openfreeCliPath: string;
  setOpenfreeCliPath: (p: string) => void;
  checkingOpenfreeCli: boolean;
  savingOpenfreeCliPath: boolean;
  installingOpenfreeCli: boolean;
  onSaveOpenfreeCli: (path: string) => Promise<void>;
  onInstallOpenfreeCli: () => Promise<void>;

  // OAuth
  pendingOAuth: {
    protocol: "codex" | "antigravity" | "deepai";
    providerId: string;
    credentialId: string;
    authUrl: string;
  } | null;
  callbackUrl: string;
  setCallbackUrl: (url: string) => void;
  completingOAuth: boolean;
  onCompleteOAuthManually: () => Promise<void>;
  onRestartOAuth: () => void;

  // General state
  loading: boolean;
  verifying: boolean;
  verificationWarning: string | null;
  error: string | null;
  onDismissWarning: () => void;
  onSubmit: (skipVerification: boolean) => Promise<void>;
  onConnectOAuth: () => Promise<void>;
};

export function ProviderAuthForm({
  template,
  name,
  setName,
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  authCode,
  setAuthCode,
  conolAccountId,
  setConolAccountId,
  cookieFile,
  setCookieFile,
  avatar,
  setAvatar,
  avatarManuallySet,
  setAvatarManuallySet,
  billingType,
  setBillingType,
  notifyError,
  openfreeCliStatus,
  openfreeCliPath,
  setOpenfreeCliPath,
  checkingOpenfreeCli,
  savingOpenfreeCliPath,
  installingOpenfreeCli,
  onSaveOpenfreeCli,
  onInstallOpenfreeCli,
  pendingOAuth,
  callbackUrl,
  setCallbackUrl,
  completingOAuth,
  onCompleteOAuthManually,
  onRestartOAuth,
  loading,
  verifying,
  verificationWarning,
  error,
  onDismissWarning,
  onSubmit,
  onConnectOAuth,
}: Props) {
  const isOAuth =
    template.protocol === "codex" ||
    template.protocol === "antigravity" ||
    template.protocol === "deepai";

  return (
    <div className="flex h-full flex-col justify-between space-y-4 overflow-y-auto pr-1">
      <div className="space-y-4">
        {/* Avatar Upload */}
        <AvatarUpload
          value={avatarManuallySet ? avatar : null}
          previewSrc={template.logo}
          previewFallbackUrl={faviconForEndpoint(baseUrl)}
          name={name || template.name || "Provider"}
          onChange={(value) => {
            setAvatar(value);
            setAvatarManuallySet(value !== null);
          }}
          label="Provider avatar"
          onError={(msg) => notifyError("Invalid avatar", msg)}
        />

        {/* Ban risk warning for Perch & DeepAI */}
        {template.protocol === "deepai" && (
          <TermsWarning
            providerName="DeepAI Code"
            detail="Using DeepAI Code via OAuth or third-party tools violates their terms of service. You risk having your account banned. Connect only accounts you are prepared to lose."
          />
        )}
        {template.protocol === "perch" && (
          <TermsWarning
            providerName="Perch AI"
            detail="Connecting Perch AI outside the official CLI violates Perch's terms of service and can result in an immediate account ban."
          />
        )}
        {template.protocol === "claude-agent" && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Claude Code Local Session</p>
            <p>
              Runs through your local Claude Code login. Sign in with <code className="font-mono text-[11px] bg-background px-1 py-0.5 rounded border border-border">claude auth login</code> in your terminal.
            </p>
            <p>
              Optionally, you can enter an Anthropic API key below to override terminal auth.
            </p>
          </div>
        )}

        {/* Name input */}
        <div className="space-y-1.5">
          <Label htmlFor="provider-name" className="text-xs">Provider name</Label>
          <Input
            id="provider-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={template.name}
            className="h-9 text-xs"
          />
        </div>

        {/* Base URL (when not openfree) */}
        {template.protocol !== "openfree" && (
          <div className="space-y-1.5">
            <Label htmlFor="provider-url" className="text-xs">Base URL</Label>
            <Input
              id="provider-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={template.placeholder}
              className="h-9 text-xs"
            />
          </div>
        )}

        {/* Billing & Quota Mode */}
        {setBillingType && (
          <div className="space-y-1.5">
            <Label className="text-xs">Billing & Quota Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBillingType("subscription")}
                className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all text-xs cursor-pointer ${
                  billingType === "subscription"
                    ? "border-purple-500 bg-purple-500/10 text-foreground"
                    : "border-border bg-card hover:border-border-strong text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1 font-normal text-xs text-foreground">
                  <RiVipCrownLine className="size-3 text-purple-500" />
                  Subscription
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">Quota · $0 direct</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingType("pay_as_you_go")}
                className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all text-xs cursor-pointer ${
                  billingType === "pay_as_you_go"
                    ? "border-blue-500 bg-blue-500/10 text-foreground"
                    : "border-border bg-card hover:border-border-strong text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1 font-normal text-xs text-foreground">
                  <RiCoinsLine className="size-3 text-blue-500" />
                  Pay-As-You-Go
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">Commercial API</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingType("free")}
                className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all text-xs cursor-pointer ${
                  billingType === "free"
                    ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                    : "border-border bg-card hover:border-border-strong text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1 font-normal text-xs text-foreground">
                  <RiCheckLine className="size-3 text-emerald-500" />
                  Free
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">Zero cost</span>
              </button>
            </div>
          </div>
        )}

        {/* Credentials per protocol */}
        {template.protocol === "openfree" && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-xs">
            <Alert
              variant={openfreeCliStatus?.warning && !openfreeCliStatus.path ? "destructive" : "default"}
              className="py-2"
            >
              <AlertDescription className="text-xs">
                {checkingOpenfreeCli
                  ? "Checking for OpenCode CLI on the SaturnRouter host..."
                  : openfreeCliStatus?.path
                    ? (
                      <>
                        {`OpenCode CLI found${openfreeCliStatus.source ? ` (${openfreeCliStatus.source})` : ""}:`}
                        <br />
                        <code className="break-all font-mono text-[11px] text-muted-foreground">{openfreeCliStatus.path}</code>
                      </>
                    )
                    : openfreeCliStatus
                      ? "No OpenCode CLI was found on the SaturnRouter host. Enter its executable path below."
                      : "Could not check for the OpenCode CLI."}
                {openfreeCliStatus?.warning && <><br />{openfreeCliStatus.warning}</>}
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="openfree-cli-path" className="text-xs">OpenCode CLI executable path</Label>
              <Input
                id="openfree-cli-path"
                value={openfreeCliPath}
                onChange={(e) => setOpenfreeCliPath(e.target.value)}
                placeholder={openfreeCliStatus?.path ?? "/absolute/path/to/opencode"}
                className="h-8 text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void onSaveOpenfreeCli(openfreeCliPath)}
                disabled={checkingOpenfreeCli || savingOpenfreeCliPath || !openfreeCliPath.trim()}
              >
                {savingOpenfreeCliPath ? "Saving..." : "Save CLI path"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onSaveOpenfreeCli("")}
                disabled={checkingOpenfreeCli || savingOpenfreeCliPath || !openfreeCliStatus?.saved_path}
              >
                Auto detect
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onInstallOpenfreeCli()}
                disabled={checkingOpenfreeCli || savingOpenfreeCliPath || installingOpenfreeCli}
              >
                {installingOpenfreeCli
                  ? "Installing..."
                  : openfreeCliStatus?.managed_installed
                    ? "Update CLI"
                    : "Install CLI"}
              </Button>
            </div>

            <div className="space-y-1.5 border-t border-border pt-2.5">
              <Label htmlFor="openfree-zen-api-key" className="text-xs">OpenCode Zen API key (required)</Label>
              <Input
                id="openfree-zen-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your OpenCode Zen API key"
                className="h-8 text-xs"
                required
              />
            </div>
          </div>
        )}

        {template.protocol === "conol" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="conol-account-id" className="text-xs">Account ID</Label>
              <Input
                id="conol-account-id"
                value={conolAccountId}
                onChange={(e) => setConolAccountId(e.target.value)}
                placeholder="account_id from Conol.ai"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conol-cookie" className="text-xs">Session Cookie</Label>
              <Input
                id="conol-cookie"
                type="password"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Paste the Conol.ai cookie"
                className="h-9 text-xs"
              />
            </div>
          </div>
        )}

        {template.protocol === "chatgpt" && (
          <div className="space-y-1.5">
            <Label htmlFor="provider-cookies" className="text-xs">cookies.txt (Netscape format)</Label>
            <Input
              id="provider-cookies"
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => setCookieFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
        )}

        {!isOAuth && template.protocol !== "openfree" && template.protocol !== "conol" && template.protocol !== "chatgpt" && (
          <div className="space-y-1.5">
            <Label htmlFor="provider-key" className="text-xs">
              {template.protocol === "atomesus"
                ? "Bearer token (optional)"
                : template.protocol === "perch"
                  ? "Session JSON or access token (optional)"
                  : template.protocol === "freebuff" || template.protocol === "qwen"
                    ? "Auth code / Token (optional)"
                    : "API key (optional)"}
            </Label>
            <Input
              id="provider-key"
              type="password"
              value={
                template.protocol === "freebuff" ||
                template.protocol === "qwen" ||
                template.protocol === "atomesus" ||
                template.protocol === "perch"
                  ? authCode
                  : apiKey
              }
              onChange={(e) => {
                const val = e.target.value;
                if (
                  template.protocol === "freebuff" ||
                  template.protocol === "qwen" ||
                  template.protocol === "atomesus" ||
                  template.protocol === "perch"
                ) {
                  setAuthCode(val);
                } else {
                  setApiKey(val);
                }
              }}
              placeholder={
                template.protocol === "atomesus"
                  ? "Paste your Atomesus bearer token"
                  : template.protocol === "perch"
                    ? "Paste perch session JSON or leave blank"
                    : template.protocol === "claude-agent"
                      ? "Optional: leave blank to use terminal login, or enter API key"
                    : template.protocol === "freebuff" || template.protocol === "qwen"
                      ? "Paste token / auth code"
                      : "sk-..."
              }
              className="h-9 text-xs"
            />
          </div>
        )}

        {/* Pending OAuth manual completion */}
        {pendingOAuth && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-normal text-foreground">OAuth Manual Callback</span>
              <a
                href={pendingOAuth.authUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-foreground underline underline-offset-4"
              >
                Open auth page
              </a>
            </div>
            <Textarea
              id="oauth-callback-url"
              className="min-h-20 font-mono text-[11px]"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.target.value)}
              placeholder={
                pendingOAuth.protocol === "deepai"
                  ? "http://127.0.0.1:<port>/auth-callback?code=...&state=..."
                  : `http://localhost:1455/${pendingOAuth.protocol === "codex" ? "auth" : "antigravity"}/callback?code=...&state=...`
              }
            />
            <p className="text-[11px] text-muted-foreground">
              If the browser callback did not complete automatically, paste the full URL from your address bar here.
            </p>
          </div>
        )}

        {/* Status / Verifying / Warning / Errors */}
        {verifying && (
          <Alert className="py-2">
            <AlertDescription className="text-xs">
              Verifying credential with provider endpoint...
            </AlertDescription>
          </Alert>
        )}

        {verificationWarning && (
          <Alert className="py-2 border-border">
            <AlertDescription className="text-xs">
              Could not verify this credential. The endpoint may still work. Do you want to continue anyway?
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {pendingOAuth ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestartOAuth}
              disabled={completingOAuth}
            >
              Restart login
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void onCompleteOAuthManually()}
              disabled={completingOAuth || !callbackUrl.trim()}
            >
              {completingOAuth ? "Completing..." : "Complete login"}
            </Button>
          </>
        ) : isOAuth ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void onConnectOAuth()}
            disabled={loading}
          >
            {loading ? "Opening authorization..." : `Sign in with ${template.name}`}
          </Button>
        ) : verificationWarning ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDismissWarning}
              disabled={loading}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void onSubmit(true)}
              disabled={loading}
            >
              Continue anyway
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void onSubmit(false)}
            disabled={loading}
          >
            {verifying ? "Verifying..." : loading ? "Saving..." : "Save provider"}
          </Button>
        )}
      </div>
    </div>
  );
}
