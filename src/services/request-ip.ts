import { config } from "../config";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Resolve the client IP for logging. Direct connections from loopback are
 * trusted as internal forwarders (Klove self-calls /v1/chat/completions and
 * pool sub-requests from 127.0.0.1 carrying the original client in
 * x-forwarded-for); external clients cannot reach the listener from loopback,
 * and a local process can only spoof this within the host, which is already
 * fully trusted in a self-hosted deployment. TRUSTED_PROXY_IPS still applies
 * for remote reverse proxies.
 */
export function resolveClientIp(
  headers: Record<string, string | undefined>,
  direct?: string | null,
): string {
  const trusted = Boolean(direct && (config.trustedProxyIps.has(direct) || LOOPBACK_ADDRESSES.has(direct)));
  if (trusted) {
    return (
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      headers["cf-connecting-ip"] ||
      direct ||
      "unknown"
    );
  }
  return direct || "unknown";
}

export function clientIp(
  request: Request,
  headers: Record<string, string | undefined>,
  server?: { requestIP?: (request: Request) => { address?: string } | null } | null,
): string {
  const direct = server?.requestIP?.(request)?.address ?? null;
  return resolveClientIp(headers, direct);
}
