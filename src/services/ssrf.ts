import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const allowInsecure = /^(1|true|yes)$/i.test(process.env.ALLOW_INSECURE_URLS?.trim() ?? "");

function blockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function ipv6Groups(address: string): number[] | null {
  let value = address.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const high = (octets[0] << 8) | octets[1];
    const low = (octets[2] << 8) | octets[3];
    value = `${value.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string) => half ? half.split(":").map((group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    return Number.parseInt(group, 16);
  }) : [];
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if ([...left, ...right].some((group) => group === null)) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  return [...left, ...Array(missing).fill(0), ...right] as number[];
}

function mappedIpv4(address: string): string | null {
  const groups = ipv6Groups(address);
  if (!groups || groups.length !== 8) return null;
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
}

function blockedAddress(address: string): boolean {
  if (isIP(address) === 4) return blockedIpv4(address);
  if (isIP(address) === 6) {
    const ipv4 = mappedIpv4(address);
    if (ipv4) return blockedIpv4(ipv4);
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return false;
}

export function insecureUrlsAllowed(): boolean {
  return allowInsecure;
}

export async function assertSafeRemoteUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Remote URL is invalid");
  }
  if (!allowInsecure) {
    if (url.protocol !== "https:") throw new Error("Remote URL must use HTTPS");
    if (url.username || url.password) throw new Error("Remote URL cannot contain credentials");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowInsecure && (hostname === "localhost" || hostname.endsWith(".localhost") || blockedAddress(hostname))) {
    throw new Error("Remote URL points to a private or local address");
  }
  if (!allowInsecure) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => blockedAddress(address))) {
      throw new Error("Remote URL resolves to a private or local address");
    }
  }
  return url;
}
