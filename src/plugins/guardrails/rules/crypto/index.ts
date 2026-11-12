import type { GuardrailViolation } from "../../guardrails.types";
import { scanCryptoPrivateKeys } from "./private-keys";
import { scanCryptoSeedPhrases } from "./seed-phrases";
import { scanCryptoAddresses } from "./addresses";

export * from "./bip39-words";
export * from "./seed-phrases";
export * from "./private-keys";
export * from "./addresses";

/**
 * Scans text for cryptocurrency private keys, BIP-39 mnemonic seed phrases, and wallet addresses.
 */
export function scanCrypto(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  // 1. Private keys take highest precedence (highest sensitivity)
  const pkResult = scanCryptoPrivateKeys(sanitized);
  violations.push(...pkResult.violations);
  sanitized = pkResult.sanitized;

  // 2. Mnemonic seed phrases take second precedence
  const seedResult = scanCryptoSeedPhrases(sanitized);
  violations.push(...seedResult.violations);
  sanitized = seedResult.sanitized;

  // 3. Wallet addresses
  const addrResult = scanCryptoAddresses(sanitized);
  violations.push(...addrResult.violations);
  sanitized = addrResult.sanitized;

  return { violations, sanitized };
}
