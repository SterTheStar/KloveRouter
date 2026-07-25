export interface Provider {
  id: string;
  name: string;
  base_url: string;
  avatar: string | null;
  protocol: "openai" | "anthropic";
  is_active: number;
  created_at: string;
  updated_at: string;
  api_key?: string;
}

export interface ProviderDetail extends Provider {
  api_key: string;
}

export interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string | null;
  is_manual: number;
  is_active: number;
  created_at: string;
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
}

export interface StatsByProvider {
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
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
}

export interface DailyStats {
  date: string;
  requests: number;
  tokens_total: number;
}

export type Page =
  | "dashboard"
  | "models"
  | "stats"
  | "keys"
  | "settings"
  | "login"
  | "provider-detail";
