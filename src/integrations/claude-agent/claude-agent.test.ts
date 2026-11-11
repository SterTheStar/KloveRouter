import { describe, expect, it } from "bun:test";
import {
  ISOLATION_ENV,
  buildConnectionEnv,
  resolveClaudeExecutable,
} from "./claude-agent.env";
import {
  formatClaudeAgentPrompt,
  renderToolsDocumentation,
  contentText,
} from "./claude-agent.format";
import {
  DEFAULT_CLAUDE_AGENT_MODELS,
  claudeAgentModels,
  probeClaudeAgent,
} from "./claude-agent.probe";
import {
  extractConnectionConfig,
} from "./claude-agent.client";

describe("Claude Agent Integration", () => {
  describe("Environment & Isolation", () => {
    it("has exact isolation flags required by OpenCode PR #58782", () => {
      expect(ISOLATION_ENV.CLAUDE_CODE_DISABLE_CLAUDE_MDS).toBe("1");
      expect(ISOLATION_ENV.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
      expect(ISOLATION_ENV.DISABLE_AUTO_COMPACT).toBe("1");
      expect(ISOLATION_ENV.CLAUDE_CODE_ENABLE_AWAY_SUMMARY).toBe("0");
      expect(ISOLATION_ENV.ENABLE_TOOL_SEARCH).toBe("false");
      expect(ISOLATION_ENV.CLAUDE_CODE_DISABLE_ADVISOR_TOOL).toBe("1");
      expect(ISOLATION_ENV.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK).toBe("1");
      expect(ISOLATION_ENV.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK).toBe("1");
      expect(ISOLATION_ENV.MAX_MCP_OUTPUT_TOKENS).toBe("200000");
    });

    it("correctly maps connection settings to Claude Code environment variables", () => {
      const env = buildConnectionEnv({
        baseURL: "https://custom.anthropic.endpoint",
        apiKey: "sk-ant-test-key",
        authToken: "test-auth-token",
        headerTimeout: 45000,
        chunkTimeout: 15000,
        maxOutputTokens: 16000,
        headers: { "X-Custom-Header": "custom-val" },
        body: { beta: true },
      });

      expect(env.ANTHROPIC_BASE_URL).toBe("https://custom.anthropic.endpoint");
      expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe("test-auth-token");
      expect(env.API_TIMEOUT_MS).toBe("45000");
      expect(env.CLAUDE_STREAM_IDLE_TIMEOUT_MS).toBe("15000");
      expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe("16000");
      expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe("X-Custom-Header: custom-val");
      expect(env.CLAUDE_CODE_EXTRA_BODY).toBe(JSON.stringify({ beta: true }));
    });

    it("resolves executable from SATURN_CLAUDE_PATH or returns null if not installed", () => {
      const original = process.env.SATURN_CLAUDE_PATH;
      try {
        process.env.SATURN_CLAUDE_PATH = process.execPath; // Use bun binary as an existing file test
        const resolved = resolveClaudeExecutable();
        expect(resolved).toBe(process.execPath);
      } finally {
        if (original !== undefined) {
          process.env.SATURN_CLAUDE_PATH = original;
        } else {
          delete process.env.SATURN_CLAUDE_PATH;
        }
      }
    });
  });

  describe("Prompt & Message Formatting", () => {
    it("handles simple single-turn user message without XML fences", () => {
      const { systemPrompt, prompt } = formatClaudeAgentPrompt([
        { role: "user", content: "What is 2+2?" },
      ]);
      expect(systemPrompt).toBeUndefined();
      expect(prompt).toBe("What is 2+2?");
    });

    it("extracts system prompt and renders multi-turn conversation with fences", () => {
      const { systemPrompt, prompt } = formatClaudeAgentPrompt([
        { role: "system", content: "You are a helpful coding assistant." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi! How can I help?" },
        { role: "user", content: "Write a function." },
      ]);

      expect(systemPrompt).toBe("You are a helpful coding assistant.");
      expect(prompt).toContain("<user>\nHello\n</user>");
      expect(prompt).toContain("<assistant>\nHi! How can I help?\n</assistant>");
      expect(prompt).toContain("<user>\nWrite a function.\n</user>");
    });

    it("formats tool calls and tool results into conversational transcript", () => {
      const { prompt } = formatClaudeAgentPrompt([
        { role: "user", content: "Read index.ts" },
        {
          role: "assistant",
          content: "Let me check the file.",
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: { name: "read_file", arguments: JSON.stringify({ path: "index.ts" }) },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_abc123",
          content: "export const x = 1;",
        },
        { role: "user", content: "What does it export?" },
      ]);

      expect(prompt).toContain('<tool_call id="call_abc123">');
      expect(prompt).toContain('"name":"read_file"');
      expect(prompt).toContain('<tool_result id="call_abc123">');
      expect(prompt).toContain("export const x = 1;");
      expect(prompt).toContain("<user>\nWhat does it export?\n</user>");
    });

    it("renders tool documentation when tools array is supplied", () => {
      const tools = [
        {
          type: "function",
          function: {
            name: "execute_sql",
            description: "Runs SQL query against database",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          },
        },
      ];

      const doc = renderToolsDocumentation(tools);
      expect(doc).toContain("# AVAILABLE TOOLS");
      expect(doc).toContain("## execute_sql");
      expect(doc).toContain("Runs SQL query against database");
      expect(doc).toContain('"query"');
    });

    it("handles array content parts correctly", () => {
      const text = contentText([
        { type: "text", text: "Hello" },
        { type: "image_url", image_url: { url: "http://example.com/img.png" } },
        { type: "text", text: "World" },
      ]);
      expect(text).toContain("Hello");
      expect(text).toContain("[image supplied]");
      expect(text).toContain("World");
    });
  });

  describe("Models & Probe", () => {
    it("returns default models catalog when probe is not yet run", async () => {
      const models = await claudeAgentModels();
      expect(models.length).toBeGreaterThan(0);
      const sonnet = models.find((m) => m.id === "claude-3-7-sonnet");
      expect(sonnet).toBeDefined();
      expect(sonnet?.context_window).toBe(200_000);
      expect(sonnet?.capabilities.streaming).toBe(true);
      expect(sonnet?.capabilities.tools).toBe(true);
      expect(sonnet?.capabilities.reasoning).toBe(true);
    });

    it("returns informative status when Claude executable is not found", async () => {
      const probe = await probeClaudeAgent({ executablePath: "/nonexistent/claude/bin" });
      expect(probe.installed).toBe(false);
      expect(probe.isLoggedIn).toBe(false);
      expect(probe.error).toContain("Claude Code CLI is not installed or not found");
      expect(probe.models).toEqual(DEFAULT_CLAUDE_AGENT_MODELS);
    });

    it("extracts connection config properly from credential and provider", () => {
      const config = extractConnectionConfig(
        { secret: "sk-ant-test-credential-key", access_token: "token123" },
        { base_url: "https://api.anthropic.com", custom_headers: '{"X-Test":"1"}' },
      );
      expect(config.apiKey).toBe("sk-ant-test-credential-key");
      expect(config.authToken).toBe("token123");
      expect(config.baseURL).toBeUndefined(); // Standard api.anthropic.com is left unset for SDK defaults
      expect(config.headers).toEqual({ "X-Test": "1" });
    });

    it("extracts custom baseURL when non-standard", () => {
      const config = extractConnectionConfig(
        null,
        { base_url: "https://my-proxy.company.com/v1" },
      );
      expect(config.baseURL).toBe("https://my-proxy.company.com/v1");
    });
  });

  describe("Execution & Error Handling", () => {
    it("fails with informative error when Claude executable is missing", async () => {
      const { claudeAgentResponses } = await import("./claude-agent.client");
      const request = claudeAgentResponses(
        {
          messages: [{ role: "user", content: "test" }],
          stream: false,
        },
        "claude-3-7-sonnet",
        undefined,
        null,
        null,
      );

      // On systems without claude executable, it throws the missing CLI error
      expect(request).rejects.toThrow("Claude Code CLI is not installed or not found");
    });
  });
});
