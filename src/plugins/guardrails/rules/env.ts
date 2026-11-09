import type { GuardrailViolation } from "../guardrails.types";

const SENSITIVE_VAR_PATTERN =
  /(?:KEY|SECRET|PASSWORD|PASSWD|TOKEN|AUTH|CREDENTIAL|PRIVATE|ENCRYPT|DB_PASS|DATABASE|JWT)/i;

const ENV_LINE_PATTERN =
  /^[ \t]*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"]?)([^\r\n"']{4,})\2/gim;

export function scanEnvVars(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  const regex = new RegExp(ENV_LINE_PATTERN.source, ENV_LINE_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const varName = match[1];
    if (!SENSITIVE_VAR_PATTERN.test(varName)) {
      continue;
    }

    const quote = match[2] || "";
    const value = match[3];
    const previewVal = value.length > 8 ? `${value.slice(0, 3)}...${value.slice(-3)}` : "***";

    violations.push({
      category: "env_var",
      description: `Environment secret variable detected: ${varName}`,
      matchedTextPreview: `${varName}=${quote}${previewVal}${quote}`,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  const sanitized = text.replace(
    new RegExp(ENV_LINE_PATTERN.source, ENV_LINE_PATTERN.flags),
    (fullMatch, varName, quote) => {
      if (!SENSITIVE_VAR_PATTERN.test(varName)) {
        return fullMatch;
      }
      const isExport = /^\s*export\s+/i.test(fullMatch);
      return `${isExport ? "export " : ""}${varName}=${quote}[REDACTED_ENV_VAR]${quote}`;
    },
  );

  return { violations, sanitized };
}
