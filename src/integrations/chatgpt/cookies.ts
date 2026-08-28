const ALLOWED_DOMAINS = new Set(["chatgpt.com", "openai.com"]);
const MAX_BYTES = 512 * 1024;
const MAX_LINES = 10_000;
const MAX_COOKIES = 1_000;
const MAX_HEADER_BYTES = 64 * 1024;

export class ChatGptCookieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatGptCookieError";
  }
}

function allowedDomain(domain: string): boolean {
  const normalized = domain.replace(/^#HttpOnly_/i, "").replace(/^\./, "").toLowerCase();
  return [...ALLOWED_DOMAINS].some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
}

function cookieOrder(name: string): [string, number] {
  const match = name.match(/^(.*)\.(\d+)$/);
  return match ? [match[1], Number(match[2])] : [name, -1];
}

export function parseChatGptCookies(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > MAX_BYTES) throw new ChatGptCookieError("cookies.txt exceeds the 512 KiB limit");
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_LINES) throw new ChatGptCookieError("cookies.txt contains too many lines");
  const cookies = new Map<string, { name: string; value: string; domain: string; order: number }>();
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") && !trimmed.startsWith("#HttpOnly_")) continue;
    const fields = line.split("\t");
    if (fields.length !== 7) throw new ChatGptCookieError(`Invalid Netscape cookie on line ${index + 1}`);
    let [domain, , path, secure, , name, value] = fields;
    if (domain.startsWith("#HttpOnly_")) domain = domain.slice("#HttpOnly_".length);
    if (!domain || !allowedDomain(domain) || !path || !name) throw new ChatGptCookieError(`Cookie domain or fields are not allowed on line ${index + 1}`);
    if (secure !== "TRUE" && secure !== "FALSE") throw new ChatGptCookieError(`Invalid secure flag on line ${index + 1}`);
    const [base, numeric] = cookieOrder(name);
    cookies.set(name, { name, value, domain, order: numeric >= 0 ? numeric : -1 });
  }
  if (!cookies.size) throw new ChatGptCookieError("cookies.txt contains no allowed cookies");
  if (cookies.size > MAX_COOKIES) throw new ChatGptCookieError("cookies.txt contains too many cookies");
  const ordered = [...cookies.values()].sort((a, b) => {
    const [abase] = cookieOrder(a.name);
    const [bbase] = cookieOrder(b.name);
    if (abase === bbase) return a.order - b.order || a.name.localeCompare(b.name);
    return abase.localeCompare(bbase);
  });
  const header = ordered.map(({ name, value }) => `${name}=${value}`).join("; ");
  if (new TextEncoder().encode(header).byteLength > MAX_HEADER_BYTES) throw new ChatGptCookieError("Cookie header exceeds the 64 KiB limit");
  return header;
}
