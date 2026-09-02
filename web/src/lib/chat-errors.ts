export type ChatErrorKind =
  | "rate_limit"
  | "auth"
  | "config"
  | "transient"
  | "provider"
  | "unknown";

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  title: string;
  hint?: string;
  retryable: boolean;
}

const patterns: Array<{
  kind: ChatErrorKind;
  pattern: RegExp;
  title: string;
  hint?: string;
  retryable: boolean;
}> = [
  {
    kind: "rate_limit",
    pattern: /\b429\b|rate.?limit|usage_limit|quota exceeded|too many requests/i,
    title: "Rate limited",
    hint: "The provider is throttling requests. Wait a moment, switch credentials, or try another model.",
    retryable: true,
  },
  {
    kind: "auth",
    pattern:
      /\b401\b|\b403\b|unauthorized|forbidden|not authenticated|credential|api key|sign in|expired session/i,
    title: "Authentication problem",
    hint: "Check the provider credentials for this model.",
    retryable: false,
  },
  {
    kind: "config",
    pattern:
      /not configured|does not support|unsupported|invalid reasoning|multimodal|invalid model|not found or inactive/i,
    title: "Unsupported request",
    hint: "This request does not match the model configuration. Adjust the model or reasoning settings.",
    retryable: false,
  },
  {
    kind: "transient",
    pattern:
      /timeout|timed out|aborted|interrupted|econn|fetch failed|overloaded|\b502\b|\b503\b|\b504\b/i,
    title: "Temporary failure",
    hint: "The provider is temporarily unavailable. Retrying usually works.",
    retryable: true,
  },
  {
    kind: "provider",
    pattern: /\b5\d\d\b|internal server error|provider.*(failed|error)|bad gateway/i,
    title: "Provider error",
    hint: "The provider returned an error. Retrying or switching models may help.",
    retryable: true,
  },
];

/**
 * Maps raw upstream error strings to a user-facing category with an
 * actionable hint, so the chat can offer the right next step (retry vs.
 * reconfigure).
 */
export function classifyChatError(message: string): ClassifiedChatError {
  for (const entry of patterns)
    if (entry.pattern.test(message))
      return { kind: entry.kind, title: entry.title, hint: entry.hint, retryable: entry.retryable };
  return {
    kind: "unknown",
    title: "Chat request failed",
    hint: message,
    retryable: true,
  };
}
