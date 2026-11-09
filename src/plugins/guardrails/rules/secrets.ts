import type { GuardrailViolation } from "../guardrails.types";

export interface ReplacementRule {
  category: "ssh_key" | "api_key" | "database_uri";
  regex: RegExp;
  placeholder: string;
  description: string;
  captureGroupIndex?: number;
}

export const SSH_KEY_REGEX =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g;

export const PGP_KEY_REGEX =
  /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g;

export const DB_URI_REGEX =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|mariadb|mssql|clickhouse|elasticsearch|amqp(?:s)?|couchdb):\/\/[^\s:@]+:[^\s:@]+@[^\s\/]+(?:\/[^\s]*)?\b/gi;

export const SECRET_PATTERNS: ReplacementRule[] = [
  // 1. Cryptographic and SSH/PGP Private Keys
  {
    category: "ssh_key",
    regex: SSH_KEY_REGEX,
    placeholder: "[REDACTED_SSH_KEY]",
    description: "Private SSH / Cryptographic Key detected",
  },
  {
    category: "ssh_key",
    regex: PGP_KEY_REGEX,
    placeholder: "[REDACTED_PGP_KEY]",
    description: "PGP Private Key Block detected",
  },

  // 2. Database Connection URIs with credentials
  {
    category: "database_uri",
    regex: DB_URI_REGEX,
    placeholder: "[REDACTED_DATABASE_URI]",
    description: "Database connection URI with credentials detected",
  },
  {
    category: "database_uri",
    regex: /\bDefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{50,}[^;\s]*\b/gi,
    placeholder: "[REDACTED_AZURE_STORAGE_CONN]",
    description: "Azure Storage Connection String detected",
  },

  // 3. AI & LLM Provider API Keys (specific prefixes before generic ones)
  {
    category: "api_key",
    regex: /\bsk-ant-(?:api\d{2}-)?[A-Za-z0-9_\-]{20,}\b/g,
    placeholder: "[REDACTED_ANTHROPIC_KEY]",
    description: "Anthropic API key detected",
  },
  {
    category: "api_key",
    regex: /\bsk-or-v1-[a-f0-9]{64}\b/g,
    placeholder: "[REDACTED_OPENROUTER_KEY]",
    description: "OpenRouter API key detected",
  },
  {
    category: "api_key",
    regex: /\bsk-(?:live-|proj-)?[A-Za-z0-9_\-]{20,}\b/g,
    placeholder: "[REDACTED_OPENAI_KEY]",
    description: "OpenAI API key detected",
  },
  {
    category: "api_key",
    regex: /\bgsk_[a-zA-Z0-9]{48,60}\b/g,
    placeholder: "[REDACTED_GROQ_KEY]",
    description: "Groq API key detected",
  },
  {
    category: "api_key",
    regex: /\bpplx-[a-f0-9]{40,64}\b/g,
    placeholder: "[REDACTED_PERPLEXITY_KEY]",
    description: "Perplexity API key detected",
  },
  {
    category: "api_key",
    regex: /\br8_[a-zA-Z0-9]{37,40}\b/g,
    placeholder: "[REDACTED_REPLICATE_TOKEN]",
    description: "Replicate API token detected",
  },
  {
    category: "api_key",
    regex: /\bhf_[a-zA-Z0-9]{34}\b/g,
    placeholder: "[REDACTED_HUGGINGFACE_TOKEN]",
    description: "HuggingFace token detected",
  },
  {
    category: "api_key",
    regex: /\bAIza[0-9A-Za-z\-_]{30,45}\b/g,
    placeholder: "[REDACTED_GOOGLE_KEY]",
    description: "Google API key detected",
  },

  // 4. Cloud, Git & Developer Platforms
  {
    category: "api_key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    placeholder: "[REDACTED_AWS_KEY]",
    description: "AWS Access Key ID detected",
  },
  {
    category: "api_key",
    regex: /(aws_secret_access_key|aws_secret|secret_key)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    placeholder: "[REDACTED_AWS_SECRET]",
    description: "AWS Secret Access Key detected",
    captureGroupIndex: 2,
  },
  {
    category: "api_key",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82})\b/g,
    placeholder: "[REDACTED_GITHUB_TOKEN]",
    description: "GitHub personal access token detected",
  },
  {
    category: "api_key",
    regex: /\bglpat-[a-zA-Z0-9\-_]{20,30}\b/g,
    placeholder: "[REDACTED_GITLAB_TOKEN]",
    description: "GitLab personal access token detected",
  },
  {
    category: "api_key",
    regex: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    placeholder: "[REDACTED_NPM_TOKEN]",
    description: "NPM access token detected",
  },
  {
    category: "api_key",
    regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,}\b/g,
    placeholder: "[REDACTED_PYPI_TOKEN]",
    description: "PyPI upload token detected",
  },
  {
    category: "api_key",
    regex: /\bsbp_[a-zA-Z0-9]{40}\b/g,
    placeholder: "[REDACTED_SUPABASE_KEY]",
    description: "Supabase service / API key detected",
  },

  // 5. Communications, Social & Payment Providers
  {
    category: "api_key",
    regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,72}\b/g,
    placeholder: "[REDACTED_SLACK_TOKEN]",
    description: "Slack token detected",
  },
  {
    category: "api_key",
    regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]{8,12}\/B[0-9A-Z]{8,12}\/[0-9A-Za-z]{24}/g,
    placeholder: "[REDACTED_SLACK_WEBHOOK]",
    description: "Slack Incoming Webhook URL detected",
  },
  {
    category: "api_key",
    regex: /\b[MNO][a-zA-Z0-9_-]{23,25}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,38}\b/g,
    placeholder: "[REDACTED_DISCORD_TOKEN]",
    description: "Discord Bot token detected",
  },
  {
    category: "api_key",
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
    placeholder: "[REDACTED_DISCORD_WEBHOOK]",
    description: "Discord Webhook URL detected",
  },
  {
    category: "api_key",
    regex: /\b[0-9]{8,10}:[a-zA-Z0-9_-]{35}\b/g,
    placeholder: "[REDACTED_TELEGRAM_TOKEN]",
    description: "Telegram Bot API token detected",
  },
  {
    category: "api_key",
    regex: /\b(?:sk|pk|rk)_(?:test|live)_[0-9a-zA-Z]{24,}\b/g,
    placeholder: "[REDACTED_STRIPE_KEY]",
    description: "Stripe key detected",
  },
  {
    category: "api_key",
    regex: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    placeholder: "[REDACTED_SENDGRID_KEY]",
    description: "SendGrid API key detected",
  },
  {
    category: "api_key",
    regex: /\bAC[a-f0-9]{32}\b/g,
    placeholder: "[REDACTED_TWILIO_SID]",
    description: "Twilio Account SID detected",
  },
  {
    category: "api_key",
    regex: /\bkey-[a-f0-9]{32}\b/g,
    placeholder: "[REDACTED_MAILGUN_KEY]",
    description: "Mailgun API key detected",
  },
  {
    category: "api_key",
    regex: /\bshpat_[a-fA-F0-9]{32}\b/g,
    placeholder: "[REDACTED_SHOPIFY_TOKEN]",
    description: "Shopify access token detected",
  },
  {
    category: "api_key",
    regex: /\bsq0[a-z]{3}-[0-9A-Za-z\-_]{22,43}\b/g,
    placeholder: "[REDACTED_SQUARE_TOKEN]",
    description: "Square access token detected",
  },

  // 6. Generic Authentication Tokens (JWT & Bearer)
  {
    category: "api_key",
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    placeholder: "[REDACTED_JWT_TOKEN]",
    description: "JWT authentication token detected",
  },
  {
    category: "api_key",
    regex: /(?:Authorization:\s*)?Bearer\s+([a-zA-Z0-9_\-.]{24,100})/gi,
    placeholder: "[REDACTED_BEARER_TOKEN]",
    description: "Authorization Bearer token detected",
    captureGroupIndex: 1,
  },

  // 7. Generic API Key & Secret Assignments (e.g. apiKey = "...", secret_token: '...')
  {
    category: "api_key",
    regex: /(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?token|master[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,80})['"]?/gi,
    placeholder: "[REDACTED_API_KEY]",
    description: "Generic API Key / Secret credential detected",
    captureGroupIndex: 2,
  },
];

export function scanSecrets(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  for (const rule of SECRET_PATTERNS) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sanitized)) !== null) {
      const matchedStr = rule.captureGroupIndex !== undefined && match[rule.captureGroupIndex]
        ? match[rule.captureGroupIndex]
        : match[0];

      // Avoid catching already-redacted placeholders
      if (matchedStr.startsWith("[REDACTED_")) {
        continue;
      }

      const preview = matchedStr.length > 30 ? `${matchedStr.slice(0, 8)}...${matchedStr.slice(-8)}` : matchedStr;

      violations.push({
        category: rule.category,
        description: rule.description,
        matchedTextPreview: preview,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });

      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    if (rule.captureGroupIndex !== undefined) {
      sanitized = sanitized.replace(regex, (full, ...args) => {
        const valToReplace = args[rule.captureGroupIndex! - 1];
        if (!valToReplace || valToReplace.startsWith("[REDACTED_")) return full;
        return full.replace(valToReplace, rule.placeholder);
      });
    } else {
      sanitized = sanitized.replace(regex, rule.placeholder);
    }
  }

  return { violations, sanitized };
}
