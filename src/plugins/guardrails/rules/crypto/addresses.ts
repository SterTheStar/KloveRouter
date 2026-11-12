import type { GuardrailViolation } from "../../guardrails.types";

interface CryptoAddressRule {
  name: string;
  regex: RegExp;
  placeholder: string;
  description: string;
  captureGroupIndex?: number;
}

const CRYPTO_ADDRESS_RULES: CryptoAddressRule[] = [
  // 1. Ethereum / EVM Wallet Address (0x + 40 hex chars)
  {
    name: "evm_address",
    regex: /\b0x[a-fA-F0-9]{40}\b/g,
    placeholder: "[REDACTED_ETH_ADDRESS]",
    description: "Ethereum / EVM wallet address detected",
  },
  // 2. Bitcoin Native SegWit Bech32 (bc1q...) and Taproot (bc1p...)
  {
    name: "btc_bech32",
    regex: /\bbc1[qp][0-9ac-hj-np-z]{38,58}\b/g,
    placeholder: "[REDACTED_BTC_ADDRESS]",
    description: "Bitcoin SegWit / Taproot address detected",
  },
  // 3. Bitcoin Legacy P2PKH (starts with 1) and P2SH (starts with 3)
  {
    name: "btc_legacy",
    regex: /\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/g,
    placeholder: "[REDACTED_BTC_ADDRESS]",
    description: "Bitcoin Legacy / P2SH address detected",
  },
  // 4. TRON (TRX) Address (starts with T, 34 base58 chars)
  {
    name: "trx_address",
    regex: /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g,
    placeholder: "[REDACTED_TRX_ADDRESS]",
    description: "TRON (TRX) wallet address detected",
  },
  // 5. Dogecoin Address (starts with D, 34 chars)
  {
    name: "doge_address",
    regex: /\bD{1}[5-9A-HJ-NP-U]{1}[1-9A-HJ-NP-Za-km-z]{32}\b/g,
    placeholder: "[REDACTED_DOGE_ADDRESS]",
    description: "Dogecoin wallet address detected",
  },
  // 6. Litecoin Bech32 (ltc1...)
  {
    name: "ltc_bech32",
    regex: /\bltc1[0-9ac-hj-np-z]{38,58}\b/g,
    placeholder: "[REDACTED_LTC_ADDRESS]",
    description: "Litecoin SegWit address detected",
  },
  // 7. Monero Address (starts with 4 or 8, 95 or 106 chars)
  {
    name: "xmr_address",
    regex: /\b[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g,
    placeholder: "[REDACTED_XMR_ADDRESS]",
    description: "Monero (XMR) address detected",
  },
  // 8. Ripple (XRP) Address (starts with r, 25-35 chars, preceded by context or standalone pattern)
  {
    name: "xrp_address",
    regex: /(?:(?:xrp|ripple)[_-]?(?:address|wallet)?\s*[:=]\s*|\b)(r[1-9A-HJ-NP-Za-km-z]{24,34})\b/gi,
    captureGroupIndex: 1,
    placeholder: "[REDACTED_XRP_ADDRESS]",
    description: "Ripple (XRP) address detected",
  },
  // 9. Solana Public Key / Address (43-44 base58 chars or preceded by solana/sol context)
  {
    name: "solana_address",
    regex: /(?:(?:sol(?:ana)?[_-]?(?:address|wallet|pubkey)?|wallet|address)\s*[:=]\s*['"]?|\b)([1-9A-HJ-NP-Za-km-z]{43,44})\b/gi,
    captureGroupIndex: 1,
    placeholder: "[REDACTED_SOL_ADDRESS]",
    description: "Solana wallet public key detected",
  },
];

export function scanCryptoAddresses(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  for (const rule of CRYPTO_ADDRESS_RULES) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sanitized)) !== null) {
      const matchedStr = rule.captureGroupIndex !== undefined && match[rule.captureGroupIndex]
        ? match[rule.captureGroupIndex]
        : match[0];

      if (matchedStr.includes("[REDACTED_")) {
        continue;
      }

      const preview = matchedStr.length > 20
        ? `${matchedStr.slice(0, 6)}...${matchedStr.slice(-4)}`
        : matchedStr;

      violations.push({
        category: "crypto_wallet_address",
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
        if (!valToReplace || valToReplace.includes("[REDACTED_")) return full;
        return full.replace(valToReplace, rule.placeholder);
      });
    } else {
      sanitized = sanitized.replace(regex, rule.placeholder);
    }
  }

  return { violations, sanitized };
}
