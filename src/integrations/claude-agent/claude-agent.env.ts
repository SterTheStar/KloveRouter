import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClaudeAgentConnectionConfig } from "./claude-agent.types";

/**
 * Features turned off to isolate Claude Code and let SaturnRouter control UX,
 * matching OpenCode PR #58782.
 */
export const ISOLATION_ENV: Record<string, string | undefined> = {
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  DISABLE_AUTO_COMPACT: "1",
  CLAUDE_CODE_ENABLE_AWAY_SUMMARY: "0",
  ENABLE_TOOL_SEARCH: "false",
  CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1",
  CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: "1",
  CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: "1",
  // Raised so SaturnRouter's own context management applies
  MAX_MCP_OUTPUT_TOKENS: "200000",
  // Allow user's active subscription login
  CLAUDE_CODE_SIMPLE: undefined,
  CLAUDE_CODE_EFFORT_LEVEL: undefined,
  MCP_TOOL_TIMEOUT: undefined,
};

export function resolveClaudeExecutable(customPath?: string | null): string | null {
  if (customPath?.trim()) {
    const cleaned = customPath.trim();
    if (existsSync(cleaned)) return cleaned;
  }

  const envPaths = [
    process.env.SATURN_CLAUDE_PATH,
    process.env.OPENCODE_CLAUDE_PATH,
    process.env.CLAUDE_PATH,
  ].filter(Boolean) as string[];

  for (const envPath of envPaths) {
    const trimmed = envPath.trim();
    if (trimmed && existsSync(trimmed)) return trimmed;
  }

  const binaryOnPath =
    Bun.which("claude") ??
    (process.platform === "win32"
      ? (Bun.which("claude.cmd") ?? Bun.which("claude.exe"))
      : null);
  if (binaryOnPath) return binaryOnPath;

  const home = homedir();
  const knownLocations: string[] = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    knownLocations.push(
      join(appData, "npm", "claude.cmd"),
      join(appData, "npm", "claude.exe"),
      join(localAppData, "Programs", "Claude", "claude.exe"),
      join(home, ".local", "bin", "claude.cmd"),
      join(home, ".local", "bin", "claude.exe"),
    );
  } else {
    knownLocations.push(
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
      join(home, ".local", "bin", "claude"),
      join(home, ".claude", "bin", "claude"),
    );
  }

  for (const loc of knownLocations) {
    if (existsSync(loc)) return loc;
  }

  return null;
}

export function buildConnectionEnv(
  config: ClaudeAgentConnectionConfig,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};

  if (config.baseURL?.trim()) env.ANTHROPIC_BASE_URL = config.baseURL.trim();
  if (config.apiKey?.trim()) env.ANTHROPIC_API_KEY = config.apiKey.trim();
  if (config.authToken?.trim()) env.ANTHROPIC_AUTH_TOKEN = config.authToken.trim();
  if (typeof config.headerTimeout === "number") env.API_TIMEOUT_MS = String(config.headerTimeout);
  if (typeof config.chunkTimeout === "number")
    env.CLAUDE_STREAM_IDLE_TIMEOUT_MS = String(config.chunkTimeout);
  if (typeof config.maxOutputTokens === "number")
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(config.maxOutputTokens);

  if (config.headers && Object.keys(config.headers).length > 0) {
    const lines = Object.entries(config.headers).map(([k, v]) => `${k}: ${v}`);
    env.ANTHROPIC_CUSTOM_HEADERS = lines.join("\n");
  }

  if (config.body && Object.keys(config.body).length > 0) {
    env.CLAUDE_CODE_EXTRA_BODY = JSON.stringify(config.body);
  }

  return env;
}
