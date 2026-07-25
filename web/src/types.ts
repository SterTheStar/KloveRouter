export interface Provider {
  id: string;
  name: string;
  base_url: string;
  avatar: string | null;
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

export type Page =
  | "dashboard"
  | "models"
  | "keys"
  | "settings"
  | "login"
  | "provider-detail";
