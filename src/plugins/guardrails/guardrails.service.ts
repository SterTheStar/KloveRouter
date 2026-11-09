import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import type {
  GuardrailsSettings,
  GuardrailViolation,
  ScanResult,
  InboundScanResult,
  GuardrailsStats,
  ViolationCategory,
} from "./guardrails.types";
import {
  scanSecrets,
  scanEnvVars,
  scanPii,
  scanPromptInjection,
  scanSystemPromptLeak,
} from "./rules";

export const DEFAULT_GUARDRAILS_SETTINGS: GuardrailsSettings = {
  enabled: false,
  action: "block",
  protectSecrets: true,
  protectEnvVars: true,
  protectPii: true,
  protectPromptInjection: true,
  protectSystemPromptLeak: true,
  scanInbound: true,
  scanOutbound: true,
};

const SETTINGS_KEY = "guardrails_settings";

class GuardrailsService {
  private cachedSettings: GuardrailsSettings | null = null;

  public getSettings(): GuardrailsSettings {
    if (this.cachedSettings) return this.cachedSettings;
    try {
      const db = getDb();
      const row = db
        .query("SELECT value FROM settings WHERE key = ?")
        .get(SETTINGS_KEY) as { value: string } | undefined;

      if (row?.value) {
        this.cachedSettings = { ...DEFAULT_GUARDRAILS_SETTINGS, ...JSON.parse(row.value) };
        return this.cachedSettings!;
      }
    } catch (err) {
      logger.error("Failed to load guardrails settings from DB", { error: err });
    }

    this.cachedSettings = { ...DEFAULT_GUARDRAILS_SETTINGS };
    return this.cachedSettings;
  }

  public updateSettings(partial: Partial<GuardrailsSettings>): GuardrailsSettings {
    const current = this.getSettings();
    const updated: GuardrailsSettings = { ...current, ...partial };
    try {
      const db = getDb();
      db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        SETTINGS_KEY,
        JSON.stringify(updated),
      );
      this.cachedSettings = updated;
      logger.info("Guardrails settings updated", { enabled: updated.enabled, action: updated.action });
    } catch (err) {
      logger.error("Failed to save guardrails settings to DB", { error: err });
      throw err;
    }
    return updated;
  }

  public getStats(): GuardrailsStats {
    try {
      const db = getDb();
      const row = db
        .query("SELECT value FROM settings WHERE key = ?")
        .get("guardrails_stats") as { value: string } | undefined;

      if (row?.value) {
        return JSON.parse(row.value);
      }
    } catch {}

    return {
      scannedRequests: 0,
      blockedRequests: 0,
      redactedRequests: 0,
      violationsCount: {
        ssh_key: 0,
        api_key: 0,
        database_uri: 0,
        env_var: 0,
        cpf: 0,
        cnpj: 0,
        credit_card: 0,
        email: 0,
        phone: 0,
        prompt_injection: 0,
        system_prompt_leak: 0,
      },
    };
  }

  public recordViolationStats(violations: GuardrailViolation[], actionTaken: "block" | "redact"): void {
    try {
      const stats = this.getStats();
      stats.scannedRequests += 1;
      if (actionTaken === "block") stats.blockedRequests += 1;
      if (actionTaken === "redact") stats.redactedRequests += 1;

      for (const v of violations) {
        stats.violationsCount[v.category] = (stats.violationsCount[v.category] || 0) + 1;
      }

      const db = getDb();
      db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "guardrails_stats",
        JSON.stringify(stats),
      );
    } catch (err) {
      logger.warn("Failed to update guardrails stats", { error: err });
    }
  }

  /**
   * Scans a single string of text according to specified or current settings.
   */
  public scanText(text: string, customSettings?: Partial<GuardrailsSettings>): ScanResult {
    const settings = { ...this.getSettings(), ...customSettings };
    const allViolations: GuardrailViolation[] = [];
    let sanitized = text;

    // 1. Secrets (SSH, API keys, DB URIs)
    if (settings.protectSecrets) {
      const { violations, sanitized: nextText } = scanSecrets(sanitized);
      allViolations.push(...violations);
      sanitized = nextText;
    }

    // 2. Environment variables (.env)
    if (settings.protectEnvVars) {
      const { violations, sanitized: nextText } = scanEnvVars(sanitized);
      allViolations.push(...violations);
      sanitized = nextText;
    }

    // 3. PII (CPF, CNPJ, Credit Cards, Email, Phone)
    if (settings.protectPii) {
      const { violations, sanitized: nextText } = scanPii(sanitized);
      allViolations.push(...violations);
      sanitized = nextText;
    }

    // 4. Prompt Injection & Jailbreaks
    if (settings.protectPromptInjection) {
      const { violations, sanitized: nextText } = scanPromptInjection(sanitized);
      allViolations.push(...violations);
      sanitized = nextText;
    }

    // 5. System Prompt Exfiltration
    if (settings.protectSystemPromptLeak) {
      const { violations, sanitized: nextText } = scanSystemPromptLeak(sanitized);
      allViolations.push(...violations);
      sanitized = nextText;
    }

    const hasViolations = allViolations.length > 0;
    const shouldBlock = hasViolations && settings.action === "block";

    return {
      hasViolations,
      shouldBlock,
      actionTaken: settings.action,
      violations: allViolations,
      sanitizedText: sanitized,
    };
  }

  /**
   * Scans inbound chat messages from a user/client.
   */
  public scanInbound(messages: any[]): InboundScanResult {
    const settings = this.getSettings();
    if (!settings.enabled || !settings.scanInbound || !Array.isArray(messages)) {
      return {
        hasViolations: false,
        shouldBlock: false,
        actionTaken: settings.action,
        violations: [],
        sanitizedMessages: messages,
      };
    }

    const allViolations: GuardrailViolation[] = [];
    const sanitizedMessages: any[] = [];

    for (const msg of messages) {
      // We primarily inspect user / system messages, but inspecting all roles prevents nested injections
      if (!msg) {
        sanitizedMessages.push(msg);
        continue;
      }

      if (typeof msg.content === "string") {
        const scan = this.scanText(msg.content, settings);
        if (scan.hasViolations) {
          allViolations.push(...scan.violations);
        }
        sanitizedMessages.push({
          ...msg,
          content: settings.action === "redact" ? scan.sanitizedText : msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        const updatedParts = msg.content.map((part: any) => {
          if (part?.type === "text" && typeof part.text === "string") {
            const scan = this.scanText(part.text, settings);
            if (scan.hasViolations) {
              allViolations.push(...scan.violations);
            }
            return {
              ...part,
              text: settings.action === "redact" ? scan.sanitizedText : part.text,
            };
          }
          return part;
        });
        sanitizedMessages.push({
          ...msg,
          content: updatedParts,
        });
      } else {
        sanitizedMessages.push(msg);
      }
    }

    const hasViolations = allViolations.length > 0;
    const shouldBlock = hasViolations && settings.action === "block";

    if (hasViolations && (settings.action === "block" || settings.action === "redact")) {
      this.recordViolationStats(allViolations, settings.action);
    }

    return {
      hasViolations,
      shouldBlock,
      actionTaken: settings.action,
      violations: allViolations,
      sanitizedMessages: settings.action === "redact" ? sanitizedMessages : messages,
    };
  }

  /**
   * Scans outbound text generated by the model.
   */
  public scanOutbound(text: string): ScanResult {
    const settings = this.getSettings();
    if (!settings.enabled || !settings.scanOutbound || !text) {
      return {
        hasViolations: false,
        shouldBlock: false,
        actionTaken: settings.action,
        violations: [],
        sanitizedText: text,
      };
    }

    // On outbound, we specifically want to guard against secret leaks and PII leaks
    const result = this.scanText(text, settings);

    if (result.hasViolations && (settings.action === "block" || settings.action === "redact")) {
      this.recordViolationStats(result.violations, settings.action);
    }

    return result;
  }
}

export const guardrailsService = new GuardrailsService();
