import type {
  ClaudeAgentModel,
  ClaudeAgentProbeResult,
  ClaudeAgentConnectionConfig,
} from "./claude-agent.types";
import { resolveClaudeExecutable, buildConnectionEnv, ISOLATION_ENV } from "./claude-agent.env";

const MODELS_CACHE_TTL_MS = 5 * 60_000;
let cachedModels: ClaudeAgentModel[] = [];
let cachedModelsExpiresAt = 0;

export const DEFAULT_CLAUDE_AGENT_MODELS: ClaudeAgentModel[] = [
  {
    id: "claude-3-7-sonnet",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "claude-agent",
    display_name: "Claude 3.7 Sonnet (Claude Agent)",
    context_window: 200_000,
    max_output_tokens: 64_000,
    capabilities: {
      tools: true,
      vision: true,
      streaming: true,
      non_streaming: true,
      reasoning: true,
    },
  },
  {
    id: "claude-3-5-sonnet",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "claude-agent",
    display_name: "Claude 3.5 Sonnet (Claude Agent)",
    context_window: 200_000,
    max_output_tokens: 8_192,
    capabilities: {
      tools: true,
      vision: true,
      streaming: true,
      non_streaming: true,
      reasoning: false,
    },
  },
  {
    id: "claude-3-5-haiku",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "claude-agent",
    display_name: "Claude 3.5 Haiku (Claude Agent)",
    context_window: 200_000,
    max_output_tokens: 8_192,
    capabilities: {
      tools: true,
      vision: true,
      streaming: true,
      non_streaming: true,
      reasoning: false,
    },
  },
  {
    id: "claude-opus-4",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "claude-agent",
    display_name: "Claude Opus 4 (Claude Agent)",
    context_window: 200_000,
    max_output_tokens: 16_384,
    capabilities: {
      tools: true,
      vision: true,
      streaming: true,
      non_streaming: true,
      reasoning: true,
    },
  },
  {
    id: "default",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "claude-agent",
    display_name: "Default (Claude Agent)",
    context_window: 200_000,
    max_output_tokens: 8_192,
    capabilities: {
      tools: true,
      vision: true,
      streaming: true,
      non_streaming: true,
      reasoning: true,
    },
  },
];

async function* waitFor(done: Promise<void>): AsyncGenerator<never> {
  await done;
}

export async function probeClaudeAgent(
  config: ClaudeAgentConnectionConfig = {},
): Promise<ClaudeAgentProbeResult> {
  const executablePath = resolveClaudeExecutable(config.executablePath);
  if (!executablePath) {
    return {
      installed: false,
      executablePath: null,
      isLoggedIn: false,
      models: DEFAULT_CLAUDE_AGENT_MODELS,
      error:
        "Claude Code CLI is not installed or not found on PATH. Install Claude Code (e.g. 'npm install -g @anthropic-ai/claude-code') or set SATURN_CLAUDE_PATH in environment or provider settings.",
    };
  }

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const stop = Promise.withResolvers<void>();
    const connectionEnv = buildConnectionEnv(config);

    const session = query({
      prompt: waitFor(stop.promise) as any,
      options: {
        pathToClaudeCodeExecutable: executablePath,
        env: {
          ...process.env,
          ...connectionEnv,
          ...ISOLATION_ENV,
        },
        settingSources: [],
        settings: { disableAllHooks: true },
        strictMcpConfig: true,
        skills: [],
        tools: [],
        permissionMode: "dontAsk",
        verbatimPrompts: true,
        persistSession: false,
      },
    });

    const initTimeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Claude Code initialization timed out after 30 seconds")),
        30_000,
      );
      timer.unref?.();
    });

    try {
      const init = await Promise.race([session.initializationResult(), initTimeout]);
      const account = init.account;
      const isLoggedIn =
        Boolean(account) &&
        (account.tokenSource !== "none" || account.apiKeySource !== undefined);

      const discoveredModels: ClaudeAgentModel[] = (init.models || []).map((m: any) => ({
        id: m.value || m.id || m.name,
        object: "model" as const,
        created: Math.floor(Date.now() / 1000),
        owned_by: "claude-agent" as const,
        display_name: `${m.name || m.value} (Claude Agent)`,
        context_window: 200_000,
        capabilities: {
          tools: true,
          vision: true,
          streaming: true,
          non_streaming: true,
          reasoning: true,
        },
      }));

      const models = discoveredModels.length ? discoveredModels : DEFAULT_CLAUDE_AGENT_MODELS;

      return {
        installed: true,
        executablePath,
        version: (init as any).claude_code_version,
        isLoggedIn,
        account,
        models,
      };
    } finally {
      stop.resolve();
      session.close();
    }
  } catch (error: any) {
    return {
      installed: true,
      executablePath,
      isLoggedIn: false,
      models: DEFAULT_CLAUDE_AGENT_MODELS,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function claudeAgentModels(
  config?: ClaudeAgentConnectionConfig,
): Promise<ClaudeAgentModel[]> {
  const now = Date.now();
  if (cachedModels.length > 0 && now < cachedModelsExpiresAt) {
    return cachedModels;
  }

  const probe = await probeClaudeAgent(config ?? {}).catch(() => null);
  if (probe && probe.models.length > 0) {
    cachedModels = probe.models;
    cachedModelsExpiresAt = now + MODELS_CACHE_TTL_MS;
    return cachedModels;
  }

  return DEFAULT_CLAUDE_AGENT_MODELS;
}
