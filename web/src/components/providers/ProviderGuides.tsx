import { useState } from "react";
import {
  RiCheckLine,
  RiFileCopyLine,
  RiInformationLine,
  RiAlertLine,
} from "@remixicon/react";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";

const CONOL_SCRIPT = `(() => {
  if (!location.hostname.endsWith("conol.ai")) return console.error("Use this on conol.ai");
  const accountId = location.pathname.match(/\\/accounts\\/([^/]+)/)?.[1] || "(not found)";
  console.log("Account ID: " + accountId);
})();`;

const QWEN_SCRIPT = `javascript:(() => {
  if (location.hostname !== "chat.qwen.ai") return alert("Use on chat.qwen.ai");
  const token = localStorage.getItem("token");
  if (!token) return console.log("Token not found");
  console.log("Qwen access_token:\\n", token);
})();`;

export function ConolGuide() {
  const { success, error: notifyError } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(CONOL_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success("Setup code copied");
    } catch (e: any) {
      notifyError("Could not copy setup code", e.message);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-normal text-foreground">
        <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
        <span>Conol.ai setup instructions</span>
      </div>
      <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
        <li>Log in to <a href="https://conol.ai" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">conol.ai</a>.</li>
        <li>Open DevTools (<kbd className="rounded border border-border px-1 font-mono text-[10px]">F12</kbd>) → Network tab, then reload.</li>
        <li>Inspect any request to conol.ai, copy the complete <code>Cookie</code> header.</li>
        <li>Run this script in the Console to extract your Account ID:</li>
      </ol>
      <div className="relative mt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <RiCheckLine className="size-3 text-foreground" /> : <RiFileCopyLine className="size-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-2 pt-6 font-mono text-[11px] leading-relaxed text-foreground">
          {CONOL_SCRIPT}
        </pre>
      </div>
    </div>
  );
}

export function QwenGuide() {
  const { success, error: notifyError } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(QWEN_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success("Setup code copied");
    } catch (e: any) {
      notifyError("Could not copy setup code", e.message);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-normal text-foreground">
        <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
        <span>Qwen authentication instructions</span>
      </div>
      <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
        <li>Log in to <a href="https://chat.qwen.ai" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">chat.qwen.ai</a>.</li>
        <li>Open browser DevTools (<kbd className="rounded border border-border px-1 font-mono text-[10px]">F12</kbd> → Console).</li>
        <li>Paste and run this snippet to get your access token:</li>
      </ol>
      <div className="relative mt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <RiCheckLine className="size-3 text-foreground" /> : <RiFileCopyLine className="size-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-2 pt-6 font-mono text-[11px] leading-relaxed text-foreground">
          {QWEN_SCRIPT}
        </pre>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste the logged token in the token input. It is encrypted before storage.
      </p>
    </div>
  );
}

export function TermsWarning({
  providerName,
  detail,
}: {
  providerName: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
      <RiAlertLine className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1">
        <p className="font-normal text-foreground">
          Terms of service & ban warning
        </p>
        <p className="leading-relaxed text-[11px] text-muted-foreground">
          {detail ||
            `Accessing or authenticating with ${providerName} through third-party platforms violates their official terms of service and may result in an immediate account suspension or permanent ban. Proceed only with accounts you accept the risk of losing.`}
        </p>
      </div>
    </div>
  );
}

export function PerchGuide() {
  return (
    <div className="space-y-2.5">
      <TermsWarning
        providerName="Perch AI"
        detail="Perch explicitly warns that connecting or querying its models outside the official CLI violates their terms of service and risks permanent account suspension or ban. Use strictly at your own discretion."
      />
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-normal text-foreground">
          <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
          <span>Perch AI session instructions</span>
        </div>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>Leave the session field blank to use the active host session from <code>perch login</code> (<code>~/.perch/cli-auth-session.json</code>).</li>
          <li>Or paste the full <code>cli-auth-session.json</code> content or an access token.</li>
          <li>After saving, sync models to load available catalog entries.</li>
        </ol>
      </div>
    </div>
  );
}

export function DeepAIGuide() {
  return (
    <div className="space-y-2.5">
      <TermsWarning
        providerName="DeepAI Code"
        detail="Authenticating via OAuth or calling DeepAI Code models through unauthorized third-party routers violates DeepAI's terms of service and can result in your account being flagged and permanently banned. Proceed only if you understand and accept this risk."
      />
      <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-normal text-foreground">
          <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
          <span>DeepAI OAuth authorization</span>
        </div>
        <p>
          DeepAI Code uses loopback browser authorization. Account session tokens are encrypted in SQLite on your router.
        </p>
      </div>
    </div>
  );
}

export function ChatGptCookiesGuide() {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-normal text-foreground">
        <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
        <span>Netscape cookies.txt format</span>
      </div>
      <p>
        Export your authenticated ChatGPT session cookies in standard Netscape format. Only chatgpt.com and openai.com cookies are parsed, and session headers are stored encrypted.
      </p>
    </div>
  );
}

export function OAuthInfoGuide({ protocol }: { protocol: "codex" | "antigravity" | "deepai" }) {
  const providerTitle =
    protocol === "codex"
      ? "OpenAI Codex"
      : protocol === "deepai"
        ? "DeepAI Code"
        : "Google Antigravity";

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-normal text-foreground">
        <RiInformationLine className="size-4 shrink-0 text-muted-foreground" />
        <span>OAuth 2.0 authentication</span>
      </div>
      <p>
        Connect your {providerTitle} account securely. SaturnRouter stores tokens encrypted in SQLite and routes through private provider endpoints.
      </p>
    </div>
  );
}
