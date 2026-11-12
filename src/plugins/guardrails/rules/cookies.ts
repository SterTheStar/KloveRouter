import type { GuardrailViolation } from "../guardrails.types";

interface CookiePatternRule {
  description: string;
  regex: RegExp;
  placeholder?: string;
  captureGroupIndex?: number;
}

/**
 * Known sensitive session cookies and auth tokens stored in cookies.
 */
const SENSITIVE_COOKIE_NAME_PATTERNS = [
  "connect\\.sid",
  "PHPSESSID",
  "JSESSIONID",
  "__Secure-next-auth\\.session-token",
  "__Host-next-auth\\.session-token",
  "next-auth\\.session-token",
  "cf_clearance",
  "__cf_bm",
  "laravel_session",
  "remember_web_[a-zA-Z0-9_]+",
  "sb-[a-z0-9_\\-]+-auth-token(?:\\.[0-9]+)?",
  "_session_id",
  "sessionid",
  "rack\\.session",
  "grafana_session",
  "AWSALB",
  "AWSALBCORS",
  "auth_token",
  "authToken",
  "access_token",
  "accessToken",
  "session_token",
  "sessionToken",
  "user_session",
  "userSession",
  "sid",
  "ssid",
];

const SENSITIVE_COOKIE_NAMES_REGEX = new RegExp(
  `\\b(${SENSITIVE_COOKIE_NAME_PATTERNS.join("|")})\\s*=\\s*([^;\\r\\n\\s"']+)`,
  "gi",
);

/**
 * Regex matching HTTP Cookie / Set-Cookie headers:
 * - Cookie: foo=bar; session=123
 * - Set-Cookie: id=xyz; Path=/; Secure; HttpOnly
 * - -H "Cookie: ..."
 * - "cookie": "..."
 */
const COOKIE_HEADER_REGEX =
  /(?:^|[\r\n]|;|\b)(?:Cookie|Set-Cookie)\s*:\s*([^\r\n]+)/gi;

const DOCUMENT_COOKIE_REGEX =
  /document\.cookie\s*=\s*['"]([^'"]+)['"]/gi;

const JSON_CURL_COOKIE_REGEX =
  /(?:-b|--cookie|["']cookie["']\s*:\s*)\s*['"]([^'"]+)['"]/gi;

/**
 * Sanitizes the value inside a Cookie header or cookie assignment string.
 * Example: `session_id=s%3A123; foo=bar` -> `session_id=[REDACTED_COOKIE]; foo=[REDACTED_COOKIE]`
 */
function sanitizeCookiePairs(rawPairs: string): { sanitized: string; count: number; previews: string[] } {
  const parts = rawPairs.split(";");
  let count = 0;
  const previews: string[] = [];

  const updatedParts = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return part;

    // Attributes like Path=/, HttpOnly, Secure, SameSite=Lax should not be redacted
    const attrMatch = trimmed.match(/^(Path|Expires|Max-Age|Domain|SameSite|HttpOnly|Secure)(?:=(.*))?$/i);
    if (attrMatch) {
      return part;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      return part;
    }

    const name = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();

    // If the cookie value has quotes or is followed by space-separated text on the same line,
    // only the actual cookie token should be extracted and redacted.
    let cookieVal = "";
    let trailing = "";

    if (rawVal.startsWith('"')) {
      const closingQuote = rawVal.indexOf('"', 1);
      if (closingQuote !== -1) {
        cookieVal = rawVal.slice(1, closingQuote);
        trailing = rawVal.slice(closingQuote + 1);
      } else {
        cookieVal = rawVal.slice(1);
      }
    } else {
      const spaceIdx = rawVal.search(/\s/);
      if (spaceIdx !== -1) {
        cookieVal = rawVal.slice(0, spaceIdx);
        trailing = rawVal.slice(spaceIdx);
      } else {
        cookieVal = rawVal;
      }
    }

    if (!cookieVal || cookieVal.startsWith("[REDACTED_")) {
      return part;
    }

    count++;
    const preview = `${name}=${cookieVal.length > 20 ? `${cookieVal.slice(0, 6)}...${cookieVal.slice(-4)}` : cookieVal}`;
    previews.push(preview);

    const leadingSpace = part.startsWith(" ") ? " " : "";
    return `${leadingSpace}${name}=[REDACTED_COOKIE]${trailing}`;
  });

  return {
    sanitized: updatedParts.join(";"),
    count,
    previews,
  };
}

export function scanCookies(text: string): { violations: GuardrailViolation[]; sanitized: string } {
  const violations: GuardrailViolation[] = [];
  let sanitized = text;

  // 1. Scan HTTP Cookie and Set-Cookie headers
  sanitized = sanitized.replace(COOKIE_HEADER_REGEX, (match, headerValue, offset) => {
    const { sanitized: sanitizedValue, count, previews } = sanitizeCookiePairs(headerValue);
    if (count > 0) {
      for (const preview of previews) {
        violations.push({
          category: "browser_cookie",
          description: "Browser HTTP Cookie header with session data detected",
          matchedTextPreview: preview,
          startIndex: offset,
          endIndex: offset + match.length,
        });
      }
      return match.replace(headerValue, sanitizedValue);
    }
    return match;
  });

  // 2. Scan document.cookie = "..."
  sanitized = sanitized.replace(DOCUMENT_COOKIE_REGEX, (match, cookieStr, offset) => {
    const { sanitized: sanitizedValue, count, previews } = sanitizeCookiePairs(cookieStr);
    if (count > 0) {
      for (const preview of previews) {
        violations.push({
          category: "browser_cookie",
          description: "JavaScript document.cookie assignment detected",
          matchedTextPreview: preview,
          startIndex: offset,
          endIndex: offset + match.length,
        });
      }
      return match.replace(cookieStr, sanitizedValue);
    }
    return match;
  });

  // 3. Scan cURL --cookie / "cookie": "..." in JSON
  sanitized = sanitized.replace(JSON_CURL_COOKIE_REGEX, (match, cookieStr, offset) => {
    const { sanitized: sanitizedValue, count, previews } = sanitizeCookiePairs(cookieStr);
    if (count > 0) {
      for (const preview of previews) {
        violations.push({
          category: "browser_cookie",
          description: "cURL or payload cookie string detected",
          matchedTextPreview: preview,
          startIndex: offset,
          endIndex: offset + match.length,
        });
      }
      return match.replace(cookieStr, sanitizedValue);
    }
    return match;
  });

  // 4. Scan standalone sensitive session cookie assignments (e.g. connect.sid=..., PHPSESSID=...)
  // in cases where they are printed in logs, query strings, or unformatted text
  const sensitiveRegex = new RegExp(SENSITIVE_COOKIE_NAMES_REGEX.source, SENSITIVE_COOKIE_NAMES_REGEX.flags);
  let sMatch: RegExpExecArray | null;

  while ((sMatch = sensitiveRegex.exec(sanitized)) !== null) {
    const name = sMatch[1];
    const value = sMatch[2];

    if (!value || value.startsWith("[REDACTED_")) {
      continue;
    }

    const preview = `${name}=${value.length > 20 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value}`;
    violations.push({
      category: "browser_cookie",
      description: `Sensitive browser session cookie (${name}) detected`,
      matchedTextPreview: preview,
      startIndex: sMatch.index,
      endIndex: sMatch.index + sMatch[0].length,
    });
  }

  sanitized = sanitized.replace(
    new RegExp(SENSITIVE_COOKIE_NAMES_REGEX.source, SENSITIVE_COOKIE_NAMES_REGEX.flags),
    (full, name, val) => {
      if (!val || val.startsWith("[REDACTED_")) return full;
      return `${name}=[REDACTED_SESSION_COOKIE]`;
    },
  );

  return { violations, sanitized };
}
