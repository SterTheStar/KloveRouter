export type GuardrailAction = "block" | "redact" | "audit";

export interface GuardrailsSettings {
  enabled: boolean;
  action: GuardrailAction;
  protectSecrets: boolean;
  protectEnvVars: boolean;
  protectPii: boolean;
  protectPromptInjection: boolean;
  protectSystemPromptLeak: boolean;
  scanInbound: boolean;
  scanOutbound: boolean;
}

export type ViolationCategory =
  | "ssh_key"
  | "api_key"
  | "database_uri"
  | "env_var"
  | "cpf"
  | "cnpj"
  | "credit_card"
  | "email"
  | "phone"
  | "prompt_injection"
  | "system_prompt_leak";

export interface GuardrailViolation {
  category: ViolationCategory;
  description: string;
  matchedTextPreview: string;
  startIndex?: number;
  endIndex?: number;
}

export interface ScanResult {
  hasViolations: boolean;
  shouldBlock: boolean;
  actionTaken: GuardrailAction;
  violations: GuardrailViolation[];
  sanitizedText: string;
}

export interface InboundScanResult {
  hasViolations: boolean;
  shouldBlock: boolean;
  actionTaken: GuardrailAction;
  violations: GuardrailViolation[];
  sanitizedMessages: any[];
}

export interface GuardrailsStats {
  scannedRequests: number;
  blockedRequests: number;
  redactedRequests: number;
  violationsCount: Record<ViolationCategory, number>;
}
