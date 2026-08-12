export interface Provider {
  id: string;
  name: string;
  base_url: string;
  avatar: string | null;
  avatar_override?: string | null;
  protocol: "openai" | "anthropic" | "codex" | "antigravity" | "freebuff" | "qwen" | "atomesus";
  is_active: number;
  created_at: string;
  updated_at: string;
  api_key?: string;
  credential_mode?: "fixed" | "round_robin";
  fixed_credential_id?: string | null;
}

export interface ProviderDetail extends Provider {
  api_key: string;
}

export interface ProviderCredential {
  id: string;
  provider_id: string;
  label: string;
  kind: "api_key" | "codex" | "antigravity" | "freebuff" | "qwen" | "atomesus";
  account_id: string | null;
  email?: string | null;
  project_id?: string | null;
  masked_secret: string | null;
  is_active: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string | null;
  is_manual: number;
  is_active: number;
  created_at: string;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: ModelCapabilities;
  reasoning_efforts: ReasoningEffort[];
  pricing_tiers?: PricingTier[];
}

export interface ModelCapabilities {
  reasoning: boolean | null;
  tools: boolean | null;
  vision: boolean | null;
  attachments: boolean | null;
  streaming: boolean | null;
  non_streaming: boolean | null;
}

export interface ReasoningEffort {
  effort: string;
  display_name: string;
  upstream_value: string;
  sort_order: number;
  is_default: boolean;
}

export interface ModelMetadataInput {
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: ModelCapabilities;
  reasoning_efforts: ReasoningEffort[];
}

export interface PricingTier {
  id?: string;
  threshold_tokens: number;
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million: number;
  cache_write_per_million: number;
}

export interface ModelWithProvider extends Model {
  provider_name: string;
  provider_avatar: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  is_active: number;
  created_at: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  raw_key: string;
  warning: string;
}

export interface StatsOverview {
  total_requests: number;
  total_tokens: number;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  avg_tokens_per_request: number;
  avg_duration_ms: number;
  estimated_cost_usd: number;
  total_tokens_cache: number;
}

export interface StatsByProvider {
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
  estimated_cost_usd: number;
}

export interface StatsByModel {
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
  tokens_prompt: number;
  tokens_completion: number;
  avg_duration_ms: number;
  tps: number | null;
  tokens_cache_read: number;
  estimated_cost_usd: number;
}

export interface DailyStats {
  date: string;
  requests: number;
  tokens_total: number;
  estimated_cost_usd: number;
}

export interface CodexUsageWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
}

export interface CodexUsage {
  plan_type?: string;
  rate_limit?: {
    allowed?: boolean;
    limit_reached?: boolean;
    primary_window?: CodexUsageWindow | null;
    secondary_window?: CodexUsageWindow | null;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: string | number;
  };
}

export interface AntigravityQuota {
  group_name: string;
  limit_name: string;
  remaining_fraction: number;
  used_percent: number;
  reset_at: string | null;
  reset_in: string | null;
  model_ids: string[];
}

export type Page =
  | "dashboard"
  | "chat"
  | "models"
  | "stats"
  | "usage"
  | "request-logs"
  | "keys"
  | "settings"
  | "login"
  | "provider-detail";

export interface RequestLog {
  id: string;
  provider_id: string | null;
  provider_name: string;
  model_name: string;
  client_ip: string | null;
  requester_name: string | null;
  credential_label: string | null;
  credential_identity: string | null;
  status: "pending" | "success" | "error";
  status_code: number | null;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  tokens_total: number;
  estimated_cost_usd: number;
  tps: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface UserProfile {
  name: string;
  avatar: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface PersistedChatMessage extends ChatMessage {
  chat_id: string;
  sequence: number;
  created_at: string;
}

export interface ChatStats {
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  tps: number;
}

export interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatAttachmentPreview {
  id: string;
  name: string;
  kind: "image" | "text";
  mimeType: string;
  data: string;
  preview?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string | ChatContentPart[];
  attachments?: ChatAttachmentPreview[];
  reasoning?: string;
  stats?: ChatStats | null;
  error?: string | null;
}

export interface RtkStatus {
  installed: boolean;
  enabled: boolean;
  version: string | null;
  binaryPath: string | null;
  platform: string | null;
  arch: string | null;
  downloadUrl: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

export interface CavemanStatus {
  enabled: boolean;
  level: "lite" | "full" | "ultra" | "wenyan-lite" | "wenyan-full" | "wenyan-ultra";
  installed: boolean;
  version: string | null;
  skillPath: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

export interface CustomSkill {
  id: string;
  name: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
