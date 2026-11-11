const BLOCKED_EXACT = new Set([
  "chat_20706",
  "chat_23310",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview",
  "tab_flash_lite_previewtab_jump_flash_lite_preview",
]);

export interface AntigravityParsedEffort {
  baseId: string;
  effort: "low" | "medium" | "high" | "none";
  rawSuffix: "low" | "medium" | "high" | "disabled";
  upstreamModel: string;
}

export interface AntigravityReasoningEffort {
  effort: string;
  display_name: string;
  upstream_value: string;
  sort_order: number;
  is_default: boolean;
}

export function isBlockedAntigravityModel(modelId: string): boolean {
  const normalized = modelId
    .trim()
    .toLowerCase()
    .replace(/^models\//, "");
  return (
    BLOCKED_EXACT.has(normalized) ||
    /^gemini-\d+(?:\.\d+)?-flash-tiered$/.test(normalized)
  );
}

export function filterAntigravityModels<T extends { id: string }>(
  models: T[],
): T[] {
  return models.filter((model) => !isBlockedAntigravityModel(model.id));
}

const EFFORT_SUFFIX_REGEX = /^(.*?)-(low|medium|high|disabled)$/i;

export function parseAntigravityModelEffort(
  modelId: string,
): AntigravityParsedEffort | null {
  const normalized = modelId
    .trim()
    .replace(/^models\//i, "");
  const match = normalized.match(EFFORT_SUFFIX_REGEX);
  if (!match) return null;
  const baseId = match[1];
  const rawSuffix = match[2].toLowerCase() as "low" | "medium" | "high" | "disabled";
  const effort = rawSuffix === "disabled" ? "none" : rawSuffix;
  return {
    baseId,
    effort,
    rawSuffix,
    upstreamModel: normalized,
  };
}

export function titleizeModelId(id: string): string {
  return id
    .replace(/^models\//, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) =>
      /^v?\d/.test(part) ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1),
    )
    .join(" ");
}

export const ANTIGRAVITY_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-2.5-flash-thinking": "Gemini 2.5 Flash Thinking",
};

export function cleanAntigravityDisplayName(
  displayName?: string | null,
  modelId?: string | null,
): string {
  if (modelId) {
    const normalized = modelId.trim().toLowerCase().replace(/^models\//i, "");
    if (ANTIGRAVITY_DISPLAY_NAME_OVERRIDES[normalized]) {
      return ANTIGRAVITY_DISPLAY_NAME_OVERRIDES[normalized];
    }
  }
  if (!displayName) return modelId ? titleizeModelId(modelId) : "";
  return displayName
    .replace(/\s*\((?:low|medium|high|disabled)\)\s*$/i, "")
    .trim();
}

const EFFORT_SORT_ORDER: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function groupAntigravityModels<T extends { id: string; display_name?: string }>(
  models: T[],
): Array<T & { reasoning_efforts?: AntigravityReasoningEffort[]; capabilities?: any }> {
  const result: Array<T & { reasoning_efforts?: AntigravityReasoningEffort[]; capabilities?: any }> = [];
  const groups = new Map<
    string,
    {
      baseItem: T;
      variants: Array<{
        parsed: AntigravityParsedEffort;
        item: T;
      }>;
    }
  >();

  for (const model of models) {
    const cleanName = cleanAntigravityDisplayName(model.display_name, model.id);
    const parsed = parseAntigravityModelEffort(model.id);
    if (!parsed) {
      result.push({ ...model, display_name: cleanName });
      continue;
    }

    const existing = groups.get(parsed.baseId);
    if (existing) {
      existing.variants.push({ parsed, item: { ...model, display_name: cleanName } });
    } else {
      const entry = {
        baseItem: { ...model, display_name: cleanName },
        variants: [{ parsed, item: { ...model, display_name: cleanName } }],
      };
      groups.set(parsed.baseId, entry);
      // Mantém a posição na lista final usando um marcador temporário que será preenchido
      result.push(entry as any);
    }
  }

  // Substitui os grupos agrupados pelas entradas consolidadas
  return result.map((entry: any) => {
    if (!entry.variants) {
      return entry;
    }

    const { baseItem, variants } = entry as {
      baseItem: T;
      variants: Array<{ parsed: AntigravityParsedEffort; item: T }>;
    };
    const baseId = variants[0].parsed.baseId;
    const cleanName =
      cleanAntigravityDisplayName(baseItem.display_name, baseId) ||
      cleanAntigravityDisplayName(baseId, baseId);

    const hasOnlyDisabled = variants.every((v) => v.parsed.effort === "none");
    if (hasOnlyDisabled) {
      return {
        ...baseItem,
        id: baseId,
        display_name: cleanName,
        capabilities: {
          ...(baseItem as any).capabilities,
          reasoning: false,
        },
      };
    }

    const activeVariants = variants.filter((v) => v.parsed.effort !== "none");
    const effortsToUse = activeVariants.length > 0 ? activeVariants : variants;

    // Determina o esforço padrão: preferência por 'medium', senão 'high', senão o primeiro
    const hasMedium = effortsToUse.some((v) => v.parsed.effort === "medium");
    const hasHigh = effortsToUse.some((v) => v.parsed.effort === "high");
    const defaultEffort = hasMedium
      ? "medium"
      : hasHigh
        ? "high"
        : effortsToUse[0].parsed.effort;

    const uniqueEfforts = new Map<string, AntigravityReasoningEffort>();
    for (const v of effortsToUse) {
      const eff = v.parsed.effort;
      if (!uniqueEfforts.has(eff)) {
        uniqueEfforts.set(eff, {
          effort: eff,
          display_name: eff[0].toUpperCase() + eff.slice(1),
          upstream_value: eff,
          sort_order: EFFORT_SORT_ORDER[eff] ?? 5,
          is_default: eff === defaultEffort,
        });
      }
    }

    const sortedEfforts = [...uniqueEfforts.values()].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    return {
      ...baseItem,
      id: baseId,
      display_name: cleanName,
      capabilities: {
        ...(baseItem as any).capabilities,
        reasoning: true,
      },
      reasoning_efforts: sortedEfforts,
      default_reasoning_effort: defaultEffort,
    };
  });
}

export function resolveAntigravityUpstreamModel(
  modelId: string,
  effort?: string | null,
): string {
  const normalized = modelId
    .trim()
    .toLowerCase()
    .replace(/^models\//i, "");

  // Se já possui o sufixo upstream (low, medium, high, disabled), mantém inalterado
  if (/-(low|medium|high|disabled)$/i.test(normalized)) {
    return normalized;
  }

  // Modelos com sufixo fixo upstream
  if (normalized === "gemini-4-carbon") {
    return "gemini-4-carbon-disabled";
  }
  if (normalized === "gpt-oss-120b") {
    return "gpt-oss-120b-medium";
  }

  const eff = String(effort || "").toLowerCase().trim();

  // Modelos conhecidos com variações de esforço (Claude Opus/Sonnet, Gemini Flash/Argon)
  const isFamilyWithVariants =
    /^(?:claude-opus-5-5|claude-sonnet-5-5|gemini-3\.8-flash|gemini-4-argon)$/i.test(
      normalized,
    );

  if (isFamilyWithVariants) {
    if (eff === "low" || eff === "minimal") return `${normalized}-low`;
    if (eff === "high" || eff === "xhigh" || eff === "max")
      return `${normalized}-high`;
    // Default para medium se não informado ou especificado
    return `${normalized}-medium`;
  }

  // Tratamento geral para futuros modelos base com reasoning
  if (eff) {
    if (eff === "low" || eff === "minimal") return `${normalized}-low`;
    if (eff === "high" || eff === "xhigh" || eff === "max")
      return `${normalized}-high`;
    if (eff === "medium") return `${normalized}-medium`;
  }

  return normalized;
}
