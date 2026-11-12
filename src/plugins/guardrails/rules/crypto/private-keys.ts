import type { GuardrailViolation } from "../../guardrails.types";

interface PrivateKeyPattern {
  name: string;
  regex: RegExp;
  captureGroupIndex?: number;
  description: string;
}

const PRIVATE_KEY_PATTERNS: PrivateKeyPattern[] = [
  // 1. Ethereum / EVM Private Keys with 0x prefix (64 hex characters)
  {
    name: "evm_hex_0x",
    regex: /\b0x[a-fA-F0-9]{64}\b/g,
    description: "EVM / Ethereum 32-byte Private Key (0x-hex) detected",
  },
  // 2. EVM / Raw Private Keys explicitly assigned (with or without 0x)
  {
    name: "evm_assigned",
    regex: /(?:private[_-]?key|eth[_-]?key|wallet[_-]?key|secret[_-]?key)\s*[:=]\s*['"]?(?:0x)?([a-fA-F0-9]{64})['"]?/gi,
    captureGroupIndex: 1,
    description: "Cryptocurrency Private Key (64-character hex) detected",
  },
  // 3. Bitcoin WIF (Wallet Import Format) Uncompressed (starts with 5, 51 base58 chars)
  {
    name: "btc_wif_uncompressed",
    regex: /\b5[1-9A-HJ-NP-Za-km-z]{50}\b/g,
    description: "Bitcoin WIF Uncompressed Private Key detected",
  },
  // 4. Bitcoin WIF Compressed (starts with K or L, 52 base58 chars)
  {
    name: "btc_wif_compressed",
    regex: /\b[KL][1-9A-HJ-NP-Za-km-z]{51}\b/g,
    description: "Bitcoin WIF Compressed Private Key detected",
  },
  // 5. Solana Keypair JSON byte array (64 bytes: 0-255)
  {
    name: "solana_keypair_json",
    regex: /(?:(?:private[_-]?key|secret[_-]?key|keypair)\s*[:=]\s*)?\[\s*(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\s*,\s*){63}(?:25[0-5]|2[0-4]\d|1?\d{1,2})\s*\]/gi,
    description: "Solana 64-byte Keypair JSON array detected",
  },
  // 6. Solana Base58 Private Key (87 or 88 Base58 characters)
  {
    name: "solana_base58_key",
    regex: /(?:(?:sol(?:ana)?[_-]?)?(?:private[_-]?key|secret[_-]?key)\s*[:=]\s*['"]?|\b)([1-9A-HJ-NP-Za-km-z]{87,88})\b/gi,
    captureGroupIndex: 1,
    description: "Solana Base58 Private Key (64 bytes) detected",
  },
];

export function scanCryptoPrivateKeys(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  for (const pattern of PRIVATE_KEY_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sanitized)) !== null) {
      const matchedStr = pattern.captureGroupIndex !== undefined && match[pattern.captureGroupIndex]
        ? match[pattern.captureGroupIndex]
        : match[0];

      if (matchedStr.includes("[REDACTED_")) {
        continue;
      }

      const preview = matchedStr.length > 20
        ? `${matchedStr.slice(0, 6)}...${matchedStr.slice(-6)}`
        : matchedStr;

      violations.push({
        category: "crypto_private_key",
        description: pattern.description,
        matchedTextPreview: preview,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });

      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    if (pattern.captureGroupIndex !== undefined) {
      sanitized = sanitized.replace(regex, (full, ...args) => {
        const valToReplace = args[pattern.captureGroupIndex! - 1];
        if (!valToReplace || valToReplace.includes("[REDACTED_")) return full;
        return full.replace(valToReplace, "[REDACTED_CRYPTO_PRIVATE_KEY]");
      });
    } else {
      sanitized = sanitized.replace(regex, "[REDACTED_CRYPTO_PRIVATE_KEY]");
    }
  }

  return { violations, sanitized };
}
