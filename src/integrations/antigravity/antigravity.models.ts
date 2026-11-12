const BLOCKED_EXACT = new Set([
  "chat_20706",
  "chat_23310",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview",
  "tab_flash_lite_previewtab_jump_flash_lite_preview",
]);

export interface AntigravityParsedEffort {
  baseId: string;
  effort: "low" | "medium" | "high" | "xhigh" | "none";
  rawSuffix: "low" | "medium" | "high" | "xhigh" | "disabled";
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

const EFFORT_SUFFIX_REGEX = /^(.*?)-(low|medium|high|xhigh|disabled)$/i;

export function parseAntigravityModelEffort(
  modelId: string,
): AntigravityParsedEffort | null {
  const normalized = modelId
    .trim()
    .replace(/^models\//i, "");
  const match = normalized.match(EFFORT_SUFFIX_REGEX);
  if (!match) return null;
  const baseId = match[1];
  const rawSuffix = match[2].toLowerCase() as "low" | "medium" | "high" | "xhigh" | "disabled";
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
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
};

export const HYDROGEN_STANDARD_EFFORTS: AntigravityReasoningEffort[] = [
  { effort: "low", display_name: "Low", upstream_value: "low", sort_order: 1, is_default: false },
  { effort: "medium", display_name: "Medium", upstream_value: "medium", sort_order: 2, is_default: false },
  { effort: "high", display_name: "High", upstream_value: "high", sort_order: 3, is_default: true },
  { effort: "xhigh", display_name: "XHigh", upstream_value: "xhigh", sort_order: 4, is_default: false },
];

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
    .replace(/\s*\((?:low|medium|high|xhigh|disabled)\)\s*$/i, "")
    .trim();
}

const EFFORT_SORT_ORDER: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
};

const KNOWN_EFFORT_FAMILIES = new Set(["gemini-4-hydrogen"]);

export function groupAntigravityModels<T extends { id: string; display_name?: string }>(
  models: T[],
): Array<T & { reasoning_efforts?: AntigravityReasoningEffort[]; capabilities?: any }> {
  const result: Array<T & { reasoning_efforts?: AntigravityReasoningEffort[]; capabilities?: any }> = [];
  const groups = new Map<
    string,
    {
      baseId: string;
      baseItem: T;
      variants: Array<{
        parsed: AntigravityParsedEffort;
        item: T;
      }>;
    }
  >();

  const parsedMap = new Map<T, AntigravityParsedEffort | null>();
  const baseIdsWithSuffixes = new Set<string>();

  for (const model of models) {
    const parsed = parseAntigravityModelEffort(model.id);
    parsedMap.set(model, parsed);
    if (parsed) {
      baseIdsWithSuffixes.add(parsed.baseId.toLowerCase());
    }
  }

  for (const model of models) {
    const normalized = model.id.trim().toLowerCase().replace(/^models\//i, "");
    const cleanName = cleanAntigravityDisplayName(model.display_name, model.id);
    const parsed = parsedMap.get(model);

    if (parsed) {
      const baseKey = parsed.baseId.toLowerCase();
      const existing = groups.get(baseKey);
      if (existing) {
        existing.variants.push({ parsed, item: { ...model, display_name: cleanName } });
      } else {
        const entry = {
          baseId: parsed.baseId,
          baseItem: { ...model, display_name: cleanName },
          variants: [{ parsed, item: { ...model, display_name: cleanName } }],
        };
        groups.set(baseKey, entry);
        result.push(entry as any);
      }
      continue;
    }

    if (baseIdsWithSuffixes.has(normalized) || KNOWN_EFFORT_FAMILIES.has(normalized)) {
      const existing = groups.get(normalized);
      if (existing) {
        existing.baseItem = { ...model, display_name: cleanName };
      } else {
        const entry = {
          baseId: normalized,
          baseItem: { ...model, display_name: cleanName },
          variants: [],
        };
        groups.set(normalized, entry);
        result.push(entry as any);
      }
      continue;
    }

    result.push({ ...model, display_name: cleanName });
  }

  // Substitui os grupos agrupados pelas entradas consolidadas
  return result.map((entry: any) => {
    if (!entry.variants) {
      return entry;
    }

    const { baseId, baseItem, variants } = entry as {
      baseId: string;
      baseItem: T;
      variants: Array<{ parsed: AntigravityParsedEffort; item: T }>;
    };
    const cleanName =
      cleanAntigravityDisplayName(baseItem.display_name, baseId) ||
      cleanAntigravityDisplayName(baseId, baseId);

    const hasOnlyDisabled = variants.length > 0 && variants.every((v) => v.parsed.effort === "none");
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

    const isHydrogen = baseId.toLowerCase() === "gemini-4-hydrogen";
    if (isHydrogen) {
      return {
        ...baseItem,
        id: baseId,
        display_name: cleanName,
        capabilities: {
          ...(baseItem as any).capabilities,
          reasoning: true,
        },
        reasoning_efforts: HYDROGEN_STANDARD_EFFORTS,
        default_reasoning_effort: "high",
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
        : (effortsToUse[0]?.parsed.effort ?? "medium");

    const uniqueEfforts = new Map<string, AntigravityReasoningEffort>();
    for (const v of effortsToUse) {
      const eff = v.parsed.effort;
      if (!uniqueEfforts.has(eff)) {
        uniqueEfforts.set(eff, {
          effort: eff,
          display_name: eff === "xhigh" ? "XHigh" : eff[0].toUpperCase() + eff.slice(1),
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

  // Se já possui o sufixo upstream (low, medium, high, xhigh, disabled), mantém inalterado
  if (/-(low|medium|high|xhigh|disabled)$/i.test(normalized)) {
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

  // Gemini 4 Hydrogen possui 4 níveis de esforço (low, medium, high [default], xhigh)
  if (normalized === "gemini-4-hydrogen") {
    if (eff === "low" || eff === "minimal") return `${normalized}-low`;
    if (eff === "medium") return `${normalized}-medium`;
    if (eff === "high") return `${normalized}-high`;
    if (eff === "xhigh" || eff === "max") return `${normalized}-xhigh`;
    // Default para Hydrogen é high
    return `${normalized}-high`;
  }

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
    if (eff === "xhigh") return `${normalized}-xhigh`;
    if (eff === "high" || eff === "max") return `${normalized}-high`;
    if (eff === "medium") return `${normalized}-medium`;
  }

  return normalized;
}
