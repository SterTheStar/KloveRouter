import { config } from "./config";

type Level = "debug" | "info" | "success" | "warn" | "error";
type Context = Record<string, unknown>;

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  white: "\x1b[97m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
};
const levels: Record<Level, { label: string; color: string }> = {
  debug: { label: "DBG", color: colors.gray },
  info: { label: "INFO", color: colors.cyan },
  success: { label: "OK", color: colors.green },
  warn: { label: "WARN", color: colors.yellow },
  error: { label: "ERR", color: colors.red },
};

function safe(value: unknown): unknown {
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /token|secret|password|authorization|api.?key/i.test(key)
          ? "[redacted]"
          : safe(item),
      ]),
    );
  return value;
}

function write(level: Level, message: string, context?: Context) {
  const item = levels[level];
  const details =
    context && Object.keys(context).length
      ? ` ${colors.dim}${JSON.stringify(safe(context))}${colors.reset}`
      : "";
  const line = `${colors.gray}${new Date().toISOString()}${colors.reset} ${item.color}${colors.bold}[${item.label}]${colors.reset} ${message}${details}`;
  (level === "error"
    ? console.error
    : level === "warn"
      ? console.warn
      : console.log)(line);
}

export const logger = {
  debug: (message: string, context?: Context) =>
    config.logLevel === "debug" && write("debug", message, context),
  info: (message: string, context?: Context) => write("info", message, context),
  success: (message: string, context?: Context) =>
    write("success", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, context?: Context) =>
    write("error", message, context),
  badge: (label: string, message: string, color = colors.blue) =>
    console.log(
      `${color}${colors.white}${colors.bold} ${label} ${colors.reset} ${message}`,
    ),
};

const requestStarted = new WeakMap<Request, number>();
export const requestHooks = {
  onRequest({ request }: { request: Request }) {
    requestStarted.set(request, performance.now());
  },
  onAfterHandle({
    request,
    set,
  }: {
    request: Request;
    set: { status?: number | string };
  }) {
    logger.info(`${request.method} ${new URL(request.url).pathname}`, {
      status: Number(set.status || 200),
      duration_ms: Math.round(
        performance.now() - (requestStarted.get(request) ?? performance.now()),
      ),
    });
  },
  onError({
    request,
    error,
    set,
  }: {
    request: Request;
    error: unknown;
    set: { status?: number | string };
  }) {
    logger.error(`${request.method} ${new URL(request.url).pathname} failed`, {
      status: Number(set.status || 500),
      error,
      duration_ms: Math.round(
        performance.now() - (requestStarted.get(request) ?? performance.now()),
      ),
    });
  },
};
