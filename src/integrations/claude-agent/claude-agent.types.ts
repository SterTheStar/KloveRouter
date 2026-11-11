export type ClaudeAgentAccountInfo = {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  apiProvider?: string;
};

export type ClaudeAgentModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: "claude-agent";
  display_name: string;
  context_window: number;
  max_output_tokens?: number;
  capabilities: {
    tools: boolean;
    vision: boolean;
    streaming: boolean;
    non_streaming: boolean;
    reasoning?: boolean;
  };
};

export type ClaudeAgentProbeResult = {
  installed: boolean;
  executablePath: string | null;
  version?: string;
  isLoggedIn: boolean;
  account?: ClaudeAgentAccountInfo;
  models: ClaudeAgentModel[];
  error?: string;
};

export type ClaudeAgentTurnResult = {
  content: string;
  reasoning?: string;
  toolCalls: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  };
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "error";
};

export type ClaudeAgentConnectionConfig = {
  baseURL?: string;
  apiKey?: string;
  authToken?: string;
  headerTimeout?: number;
  chunkTimeout?: number;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  maxOutputTokens?: number;
  effort?: "low" | "medium" | "high" | "max";
  executablePath?: string;
};
