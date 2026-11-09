import type { GuardrailViolation } from "../guardrails.types";

export const PROMPT_INJECTION_PATTERNS = [
  {
    regex: /(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?(?:previous|prior|above|former|earlier)\s+(?:instructions|prompts|directions|rules|commands|constraints)/i,
    description: "Instruction override / prompt injection attempt detected",
  },
  {
    regex: /(?:ignore|disregard)\s+(?:everything\s+)?(?:above|previously\s+said|before\s+this)/i,
    description: "Prior instruction wipe attempt detected",
  },
  {
    regex: /you\s+are\s+now\s+(?:in\s+)?(?:DAN|developer\s+mode|unrestricted|god\s+mode|jailbreak|unfiltered\s+mode)/i,
    description: "Jailbreak persona (DAN / Developer mode) attempt detected",
  },
  {
    regex: /pretend\s+(?:you\s+have\s+no\s+(?:rules|filters|limitations)|to\s+be\s+(?:unrestricted|evil|unfiltered))/i,
    description: "Safety bypass via roleplay attempt detected",
  },
  {
    regex: /bypass\s+(?:all\s+)?(?:safety|content|ethical|system)\s+(?:filters|protocols|guidelines|guardrails)/i,
    description: "Explicit guardrail bypass command detected",
  },
  {
    regex: /(?:<\/system>|\[SYSTEM\s+INSTRUCTION\]|<\|im_start\|>system|<<SYS>>|\[INST\]\s*<<SYS>>)/i,
    description: "Fake system prompt wrapper / delimiter injection detected",
  },
];

export const SYSTEM_PROMPT_LEAK_PATTERNS = [
  {
    regex: /(?:repeat|print|output|display|show|reveal|echo)\s+(?:verbatim\s+|word\s+for\s+word\s+)?(?:all\s+)?(?:your\s+)?(?:system|initial)\s+(?:prompt|instructions|message)/i,
    description: "System prompt exfiltration attempt detected",
  },
  {
    regex: /what\s+(?:are|were)\s+your\s+(?:exact\s+)?(?:system|initial)\s+(?:instructions|prompt|rules)/i,
    description: "System prompt inquiry / extraction attempt detected",
  },
  {
    regex: /give\s+me\s+(?:the\s+)?(?:full\s+)?text\s+(?:of\s+your\s+prompt|above|before\s+this)/i,
    description: "Instruction text exfiltration attempt detected",
  },
];

export function scanPromptInjection(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      violations.push({
        category: "prompt_injection",
        description: pattern.description,
        matchedTextPreview: sanitized.slice(0, 50) + "...",
      });
      sanitized = sanitized.replace(new RegExp(pattern.regex.source, "gi"), "[REDACTED_PROMPT_INJECTION]");
    }
  }

  return { violations, sanitized };
}

export function scanSystemPromptLeak(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  for (const pattern of SYSTEM_PROMPT_LEAK_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      violations.push({
        category: "system_prompt_leak",
        description: pattern.description,
        matchedTextPreview: sanitized.slice(0, 50) + "...",
      });
      sanitized = sanitized.replace(new RegExp(pattern.regex.source, "gi"), "[REDACTED_PROMPT_LEAK_ATTEMPT]");
    }
  }

  return { violations, sanitized };
}
