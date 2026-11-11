export const PRESET_AVATAR_BASE = "/api/media/avatars/presets";

export type ProviderProtocol =
  | "openai"
  | "openai-responses"
  | "antigravity"
  | "anthropic"
  | "codex"
  | "chatgpt"
  | "freebuff"
  | "qwen"
  | "atomesus"
  | "conol"
  | "perch"
  | "openfree"
  | "claude-agent"
  | "deepai";

export type ProviderCategory = "official" | "hosted" | "local" | "aggregator";

export type IntegrationType =
  | "local-bridge"
  | "web-session"
  | "oauth"
  | "cli-session"
  | "local-server"
  | "cloud-api";

export type ProviderTemplate = {
  id: string;
  protocol: ProviderProtocol;
  name: string;
  description: string;
  website?: string;
  docsUrl?: string;
  placeholder: string;
  logo: string;
  preset: boolean;
  category?: ProviderCategory;
  integrationType?: IntegrationType;
  disabled?: boolean;
};

const modules = import.meta.glob<ProviderTemplate>("../templates/providers/*.json", {
  eager: true,
  import: "default",
});

const PRIORITY_ORDER: string[] = [
  "openai",
  "openai-responses",
  "anthropic",
  "antigravity",
  "codex",
  "chatgpt",
  "deepai",
  "openfree",
  "qwen",
  "atomesus",
  "conol",
  "perch",
  "freebuff",
];

const loadedTemplates: ProviderTemplate[] = Object.values(modules);

export const PROVIDER_TEMPLATES: readonly ProviderTemplate[] = [...loadedTemplates]
  .filter((template) => !template.disabled)
  .sort(
  (a, b) => {
    const idxA = PRIORITY_ORDER.indexOf(a.id);
    const idxB = PRIORITY_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  }
);
