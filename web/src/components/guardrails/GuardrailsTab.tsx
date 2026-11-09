import { useState, useEffect } from "react";
import {
  RiShieldLine as ShieldLine,
  RiKey2Line as KeyLine,
  RiTerminalBoxLine as TerminalLine,
  RiUserSearchLine as UserSearchLine,
  RiBugLine as BugLine,
  RiEyeCloseLine as EyeCloseLine,
  RiArrowDownLine as ArrowDownLine,
  RiArrowUpLine as ArrowUpLine,
  RiRefreshLine as RefreshLine,
  RiCheckLine as CheckLine,
  RiLoader4Line as LoaderCircle,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { guardrails } from "../../api/client";
import { useToast } from "../ui/toast";
import type { GuardrailsSettings, GuardrailsStats } from "../../types";

const RULES = [
  {
    id: "protectSecrets" as const,
    name: "Secrets & API Credentials",
    description: "Detects cloud API keys, cryptographic tokens, database connection strings, and bearer tokens.",
    examples: "OpenAI, Anthropic, AWS, GitHub, Stripe, DB URIs, JWTs",
    icon: KeyLine,
  },
  {
    id: "protectEnvVars" as const,
    name: "Environment Variables (.env)",
    description: "Intercepts exported environment variables or pasted .env snippets containing credentials.",
    examples: "DATABASE_URL, JWT_SECRET, API_KEY, AWS_SECRET",
    icon: TerminalLine,
  },
  {
    id: "protectPii" as const,
    name: "Personal Information (PII)",
    description: "Validates identification numbers, credit cards (Luhn algorithm), email addresses, and phone numbers.",
    examples: "CPF/CNPJ, Credit Cards, RFC Email, E.164 Phone",
    icon: UserSearchLine,
  },
  {
    id: "protectPromptInjection" as const,
    name: "Prompt Injections & Jailbreaks",
    description: "Prevents instruction overriding, DAN/god-mode personas, delimiter escapes, and system role impersonation.",
    examples: "Ignore previous instructions, DAN mode, </system>, <|im_start|>",
    icon: BugLine,
  },
  {
    id: "protectSystemPromptLeak" as const,
    name: "System Prompt Exfiltration",
    description: "Blocks attempts to reveal, repeat verbatim, dump, or extract internal system instructions.",
    examples: "Repeat verbatim, reveal system prompt, dump instructions",
    icon: EyeCloseLine,
  },
];

const ACTIONS = [
  {
    id: "block" as const,
    label: "Block",
    description: "Immediately rejects violating requests with HTTP 400 and blocks sensitive responses.",
  },
  {
    id: "redact" as const,
    label: "Redact",
    description: "Replaces detected credentials, keys, and PII with safe typed placeholders before sending.",
  },
  {
    id: "audit" as const,
    label: "Audit Only",
    description: "Passes all traffic through untouched while silently recording security violations in logs.",
  },
];

export default function GuardrailsTab() {
  const { success: notifySuccess, error: notifyError } = useToast();

  const [config, setConfig] = useState<GuardrailsSettings | null>(null);
  const [stats, setStats] = useState<GuardrailsStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  const fetchSettings = async () => {
    try {
      const data = await guardrails.settings();
      setConfig(data);
    } catch (e: any) {
      notifyError("Failed to load guardrails settings", e.message);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await guardrails.stats();
      setStats(data);
    } catch {
      // Non-blocking
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchStats();
  }, []);

  const updateField = async (field: keyof GuardrailsSettings, value: any) => {
    if (!config) return;
    const next = { ...config, [field]: value };
    setConfig(next);
    setSaving(true);
    try {
      const res = await guardrails.updateSettings({ [field]: value });
      setConfig(res.settings);
      notifySuccess("Guardrails updated");
    } catch (e: any) {
      notifyError("Failed to update guardrails", e.message);
      fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  const activeRulesCount = config
    ? [
        config.protectSecrets,
        config.protectEnvVars,
        config.protectPii,
        config.protectPromptInjection,
        config.protectSystemPromptLeak,
      ].filter(Boolean).length
    : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Card with Master Toggle */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldLine className="size-5 shrink-0" />
                <span>Guardrails &amp; Firewall</span>
                {saving && <LoaderCircle className="size-3.5 animate-spin text-tertiary" />}
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect and sanitize prompts and completions in real time to prevent credential leaks, PII exposure, and prompt injections.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <span className="text-xs font-medium text-foreground">
                {config?.enabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={config?.enabled ?? false}
                onCheckedChange={(checked) => updateField("enabled", checked)}
                disabled={saving || !config}
                aria-label="Toggle Guardrails"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 2. Compact Telemetry Strip */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
            <div className="p-4">
              <span className="text-xs font-medium text-tertiary">Scanned Requests</span>
              <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">
                {stats ? stats.scannedRequests.toLocaleString() : "0"}
              </p>
            </div>

            <div className="p-4">
              <span className="text-xs font-medium text-tertiary">Blocked</span>
              <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">
                {stats ? stats.blockedRequests.toLocaleString() : "0"}
              </p>
            </div>

            <div className="p-4">
              <span className="text-xs font-medium text-tertiary">Redacted</span>
              <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">
                {stats ? stats.redactedRequests.toLocaleString() : "0"}
              </p>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-tertiary">Active Rules</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-tertiary hover:text-foreground"
                  onClick={fetchStats}
                  disabled={loadingStats}
                  title="Refresh statistics"
                >
                  <RefreshLine className={cn("size-3", loadingStats && "animate-spin")} />
                </Button>
              </div>
              <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">
                {activeRulesCount} <span className="font-sans text-xs font-normal text-tertiary">/ 5</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Settings Body */}
      <div className={cn("space-y-6 transition-opacity", !config?.enabled && "pointer-events-none opacity-50")}>
        {/* 3. Enforcement Policy & Traffic Scope */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Enforcement Policy</CardTitle>
            <CardDescription className="text-xs">
              Configure how detected security violations are handled and what traffic directions are scanned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Action Segmented Selector */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {ACTIONS.map((action) => {
                const isSelected = config?.action === action.id;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => updateField("action", action.id)}
                    disabled={saving || !config}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-3.5 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-accent/60 text-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent/30",
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sm font-semibold">{action.label}</span>
                      {isSelected && (
                        <CheckLine className="size-3.5 text-primary" />
                      )}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-tertiary">
                      {action.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <Separator />

            {/* Traffic Scope */}
            <div>
              <span className="text-xs font-medium text-foreground">Inspection Scope</span>
              <div className="mt-2.5 divide-y divide-border rounded-lg border border-border">
                <div className="flex items-center justify-between gap-4 p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <ArrowDownLine className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Inbound Filtering</p>
                      <p className="text-xs text-tertiary">
                        Scans incoming prompts, system instructions, and tool call parameters before reaching the AI provider.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.scanInbound ?? true}
                    onCheckedChange={(val) => updateField("scanInbound", val)}
                    disabled={saving || !config}
                    aria-label="Toggle inbound filtering"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <ArrowUpLine className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Outbound Filtering</p>
                      <p className="text-xs text-tertiary">
                        Scans generated assistant completions to prevent the model from regurgitating sensitive tokens or PII.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config?.scanOutbound ?? true}
                    onCheckedChange={(val) => updateField("scanOutbound", val)}
                    disabled={saving || !config}
                    aria-label="Toggle outbound filtering"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Security Rules List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Detection Rules</CardTitle>
                <CardDescription className="text-xs">
                  Active security engines for sensitive data prevention and jailbreak protection.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {activeRulesCount} of {RULES.length} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {RULES.map((rule) => {
                const Icon = rule.icon;
                const isEnabled = config ? (config[rule.id] ?? true) : true;
                return (
                  <div key={rule.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent/20">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Icon className="size-5 shrink-0 text-muted-foreground" />
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-medium text-foreground">{rule.name}</p>
                        <p className="text-xs leading-relaxed text-tertiary">{rule.description}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          <span className="text-tertiary/70">Coverage: </span>{rule.examples}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(val) => updateField(rule.id, val)}
                      disabled={saving || !config}
                      aria-label={`Toggle ${rule.name}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
