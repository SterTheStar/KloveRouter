import {
  RiShieldKeyholeLine,
  RiTerminalBoxLine,
  RiTerminalLine,
  RiWindowLine,
  RiServerLine,
  RiKey2Line,
} from "@remixicon/react";
import type { IntegrationType, ProviderTemplate } from "@/lib/provider-templates";

export function resolveIntegrationType(template: ProviderTemplate): IntegrationType {
  if (template.integrationType) return template.integrationType;
  if (template.protocol === "openfree" || template.id === "openfree") return "local-bridge";
  if (
    template.protocol === "qwen" ||
    template.protocol === "atomesus" ||
    template.protocol === "conol" ||
    template.protocol === "chatgpt" ||
    template.id === "qwen" ||
    template.id === "atomesus" ||
    template.id === "conol" ||
    template.id === "chatgpt"
  ) {
    return "web-session";
  }
  if (
    template.protocol === "deepai" ||
    template.protocol === "codex" ||
    template.protocol === "antigravity" ||
    template.id === "deepai" ||
    template.id === "codex" ||
    template.id === "antigravity"
  ) {
    return "oauth";
  }
  if (template.protocol === "perch" || template.id === "perch") return "cli-session";
  if (template.category === "local" || template.id === "lm-studio" || template.id === "vllm") return "local-server";
  return "cloud-api";
}

const META: Record<
  IntegrationType,
  { label: string; icon: typeof RiShieldKeyholeLine }
> = {
  "local-bridge": {
    label: "Local Bridge",
    icon: RiTerminalBoxLine,
  },
  "web-session": {
    label: "Web Session",
    icon: RiWindowLine,
  },
  oauth: {
    label: "OAuth 2.0",
    icon: RiShieldKeyholeLine,
  },
  "cli-session": {
    label: "CLI Session",
    icon: RiTerminalLine,
  },
  "local-server": {
    label: "Local Server",
    icon: RiServerLine,
  },
  "cloud-api": {
    label: "Cloud API",
    icon: RiKey2Line,
  },
};

type Props = {
  template: ProviderTemplate;
  size?: "sm" | "md";
  showCloudApi?: boolean;
};

export function IntegrationBadge({
  template,
  size = "md",
  showCloudApi = false,
}: Props) {
  const type = resolveIntegrationType(template);

  // Na listagem, omitir Cloud API padrão para manter o design desobstruído
  if (type === "cloud-api" && !showCloudApi) return null;

  const info = META[type] ?? META["cloud-api"];
  const Icon = info.icon;

  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-normal text-muted-foreground select-none">
        <Icon className="size-2.5" />
        <span>{info.label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[10px] font-normal text-foreground select-none">
      <Icon className="size-3 text-muted-foreground" />
      <span>{info.label}</span>
    </span>
  );
}
