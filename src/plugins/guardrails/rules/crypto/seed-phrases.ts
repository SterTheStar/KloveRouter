import type { GuardrailViolation } from "../../guardrails.types";
import { isBip39Word } from "./bip39-words";

const ALLOWED_LENGTHS = new Set([12, 15, 18, 21, 24]);

/**
 * Checks whether a candidate list of tokens forms a valid BIP-39 sequence.
 */
function isValidBip39Sequence(words: string[]): boolean {
  if (!ALLOWED_LENGTHS.has(words.length)) return false;
  return words.every((w) => isBip39Word(w));
}

/**
 * Normalizes a candidate token, stripping numbering like "1.", "1:", "1-", etc.
 */
function cleanWordToken(token: string): string {
  return token.replace(/^\d+[\.:\)\-\/]\s*/, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
}

export function scanCryptoSeedPhrases(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  // 1. Detect explicitly labeled mnemonic phrases:
  // e.g. "seed phrase: abandon ability able about ...", "mnemonic = ..."
  const labeledRegex =
    /(?:(?:seed\s*phrase|recovery\s*phrase|mnemonic(?:\s*phrase)?|secret\s*(?:recovery\s*)?phrase|backup\s*phrase)\s*[:=]\s*)(['"]?)([\s\S]*?)\1(?=[,\.;\r\n\)]|$)/gi;

  sanitized = sanitized.replace(labeledRegex, (fullMatch, quote, content, offset) => {
    // Extract tokens
    const tokens = content.trim().split(/\s+/).map(cleanWordToken).filter(Boolean);
    if (ALLOWED_LENGTHS.has(tokens.length) && tokens.every((w) => isBip39Word(w))) {
      violations.push({
        category: "crypto_seed_phrase",
        description: `BIP-39 Mnemonic Seed Phrase (${tokens.length} words) detected`,
        matchedTextPreview: `${tokens[0]} ${tokens[1]} ... ${tokens[tokens.length - 1]}`,
        startIndex: offset,
        endIndex: offset + fullMatch.length,
      });
      return fullMatch.replace(content, "[REDACTED_CRYPTO_SEED_PHRASE]");
    }
    return fullMatch;
  });

  // 2. Detect numbered word lists:
  // e.g. "1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident"
  const numberedListRegex =
    /(?:\b1[\.:\)\-]\s*[a-zA-Z]+(?:\s+|\n|,)+2[\.:\)\-]\s*[a-zA-Z]+[\s\S]*?\b(?:12|15|18|21|24)[\.:\)\-]\s*[a-zA-Z]+)/gi;

  sanitized = sanitized.replace(numberedListRegex, (match, offset) => {
    const rawTokens = match.split(/(?:\s+|\n|,)+/);
    const words: string[] = [];
    for (const raw of rawTokens) {
      const cleaned = cleanWordToken(raw);
      if (cleaned) {
        words.push(cleaned);
      }
    }

    if (ALLOWED_LENGTHS.has(words.length) && words.every((w) => isBip39Word(w))) {
      violations.push({
        category: "crypto_seed_phrase",
        description: `Numbered BIP-39 Mnemonic Seed Phrase (${words.length} words) detected`,
        matchedTextPreview: `${words[0]} ${words[1]} ... ${words[words.length - 1]}`,
        startIndex: offset,
        endIndex: offset + match.length,
      });
      return "[REDACTED_CRYPTO_SEED_PHRASE]";
    }
    return match;
  });

  // 3. Scan paragraphs / word sequences for raw 12, 15, 18, 21, or 24 consecutive BIP-39 words.
  // We match runs of lowercase words and verify if an exact chunk of 12-24 BIP-39 words exists.
  const wordRunRegex = /\b[a-z]{3,8}(?:[ \t\r\n]+[a-z]{3,8}){11,23}\b/g;

  sanitized = sanitized.replace(wordRunRegex, (match, offset) => {
    // Avoid double redacting
    if (match.includes("REDACTED")) return match;

    const words = match.trim().split(/[ \t\r\n]+/).map((w) => w.toLowerCase());
    if (ALLOWED_LENGTHS.has(words.length) && words.every((w) => isBip39Word(w))) {
      violations.push({
        category: "crypto_seed_phrase",
        description: `Unlabeled BIP-39 Mnemonic Seed Phrase (${words.length} words) detected`,
        matchedTextPreview: `${words[0]} ${words[1]} ... ${words[words.length - 1]}`,
        startIndex: offset,
        endIndex: offset + match.length,
      });
      return "[REDACTED_CRYPTO_SEED_PHRASE]";
    }

    return match;
  });

  return { violations, sanitized };
}
