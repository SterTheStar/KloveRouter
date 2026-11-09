import type { GuardrailViolation } from "../guardrails.types";

/**
 * Validates CPF with standard Brazilian verification algorithm (2 check digits).
 */
export function isValidCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // Reject repeated digits like 111.111.111-11

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Validates CNPJ with standard Brazilian verification algorithm.
 */
export function isValidCnpj(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(clean.charAt(i), 10) * weightsFirst[i];
  let rest = sum % 11;
  const digit1 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(clean.charAt(12), 10) !== digit1) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(clean.charAt(i), 10) * weightsSecond[i];
  rest = sum % 11;
  const digit2 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(clean.charAt(13), 10) !== digit2) return false;

  return true;
}

/**
 * Validates credit card number with Luhn algorithm (Mod 10).
 */
export function isValidCreditCard(numberStr: string): boolean {
  const clean = numberStr.replace(/\D/g, "");
  if (clean.length < 13 || clean.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let n = parseInt(clean.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CPF_CANDIDATE_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_CANDIDATE_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CARD_CANDIDATE_REGEX = /\b(?:\d{4}[ -]?){3}\d{1,4}\b|\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b/g;
const PHONE_REGEX = /(?<!\d)(?:(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\d{4}|\d{4})[-.\s]?\d{4}|\+\d{1,3}[-.\s]?(?:\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4})\b/g;

export function scanPii(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  // 1. Credit Cards (checked with Luhn)
  sanitized = sanitized.replace(CARD_CANDIDATE_REGEX, (match) => {
    if (isValidCreditCard(match)) {
      violations.push({
        category: "credit_card",
        description: "Valid credit card number detected",
        matchedTextPreview: `${match.slice(0, 4)} **** **** ${match.slice(-4)}`,
      });
      return "[REDACTED_CREDIT_CARD]";
    }
    return match;
  });

  // 2. CPF (checked with Brazilian validation algorithm)
  sanitized = sanitized.replace(CPF_CANDIDATE_REGEX, (match) => {
    if (isValidCpf(match)) {
      violations.push({
        category: "cpf",
        description: "Valid Brazilian CPF detected",
        matchedTextPreview: `${match.slice(0, 3)}.***.***-**`,
      });
      return "[REDACTED_CPF]";
    }
    return match;
  });

  // 3. CNPJ (checked with Brazilian validation algorithm)
  sanitized = sanitized.replace(CNPJ_CANDIDATE_REGEX, (match) => {
    if (isValidCnpj(match)) {
      violations.push({
        category: "cnpj",
        description: "Valid Brazilian CNPJ detected",
        matchedTextPreview: `${match.slice(0, 2)}.***.***/****-**`,
      });
      return "[REDACTED_CNPJ]";
    }
    return match;
  });

  // 4. Email addresses
  sanitized = sanitized.replace(EMAIL_REGEX, (match) => {
    violations.push({
      category: "email",
      description: "Email address detected",
      matchedTextPreview: match.replace(/^(.)(.*)(@.*)$/, "$1***$3"),
    });
    return "[REDACTED_EMAIL]";
  });

  // 5. Phone numbers
  sanitized = sanitized.replace(PHONE_REGEX, (match) => {
    // Avoid redacting small purely numeric sequences that aren't phone numbers
    if (match.replace(/\D/g, "").length >= 8) {
      violations.push({
        category: "phone",
        description: "Phone number detected",
        matchedTextPreview: match.slice(0, 4) + "...",
      });
      return "[REDACTED_PHONE]";
    }
    return match;
  });

  return { violations, sanitized };
}
