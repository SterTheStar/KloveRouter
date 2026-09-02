import type { Model, ReasoningEffort } from "./model.service";

export type NormalizedReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | string;

export class ReasoningRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReasoningRequestError";
  }
}

const aliases: Record<string, string> = {
  off: "none",
  disabled: "none",
  false: "none",
  min: "minimal",
  normal: "medium",
  max: "xhigh",
};

export function normalizeReasoningEffort(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "boolean")
    throw new ReasoningRequestError("Reasoning effort must be a string");
  const normalized = String(value).trim().toLowerCase();
  if (!normalized)
    throw new ReasoningRequestError("Reasoning effort cannot be empty");
  return aliases[normalized] ?? normalized;
}

// "default" resolves per model, so it never goes through the static alias table.
function isDefaultAlias(effort: string) {
  return effort === "default";
}

export function parseReasoningEffort(body: any): {
  explicit: boolean;
  effort?: string;
} {
  const supplied = [
    ["reasoning.effort", body?.reasoning?.effort],
    ["reasoning_effort", body?.reasoning_effort],
    ["effort", body?.effort],
  ].filter(([, value]) => value !== undefined) as Array<
    [string, unknown]
  >;
  if (!supplied.length) return { explicit: false };
  const normalized = supplied.map(([field, value]) => ({
    field,
    effort: normalizeReasoningEffort(value),
  }));
  if (new Set(normalized.map((item) => item.effort)).size > 1)
    throw new ReasoningRequestError(
      `Conflicting reasoning efforts supplied in ${normalized.map((item) => item.field).join(", ")}`,
    );
  return { explicit: true, effort: normalized[0].effort };
}

function configuredEffort(efforts: ReasoningEffort[], requested: string) {
  return efforts.find(
    (item) => normalizeReasoningEffort(item.effort) === requested,
  );
}

export function resolveReasoningEffort(body: any, model: Model): {
  explicit: boolean;
  effort?: string;
  upstreamValue?: string;
} {
  const parsed = parseReasoningEffort(body);
  if (parsed.explicit && model.capabilities.reasoning === false)
    throw new ReasoningRequestError(
      `Model "${model.model_id}" does not support reasoning effort`,
    );

  let selected: ReasoningEffort | undefined;
  if (parsed.effort) {
    if (!model.reasoning_efforts.length) {
      // No configured list: pass the effort through, guessing medium for "default"
      // so downstream consumers get a real level instead of the literal alias.
      const effort = isDefaultAlias(parsed.effort) ? "medium" : parsed.effort;
      return {
        explicit: true,
        effort,
        upstreamValue: effort,
      };
    }
    if (isDefaultAlias(parsed.effort))
      selected = model.reasoning_efforts.find((item) => item.is_default) ??
        model.reasoning_efforts[0];
    else selected = configuredEffort(model.reasoning_efforts, parsed.effort);
    if (!selected) {
      // Disabling thinking is always allowed for reasoning models: "none"
      // resolves even when the configured list has no none row.
      if (parsed.effort === "none")
        selected = {
          effort: "none",
          display_name: "None",
          upstream_value: "none",
          sort_order: -1,
          is_default: false,
        };
      else
        throw new ReasoningRequestError(
          `Reasoning effort "${parsed.effort}" is not configured for model "${model.model_id}"`,
        );
    }
  } else {
    selected = model.reasoning_efforts.find((item) => item.is_default);
  }
  return {
    explicit: parsed.explicit,
    effort: selected ? normalizeReasoningEffort(selected.effort) : undefined,
    upstreamValue: selected?.upstream_value,
  };
}

export function applyResolvedReasoning(body: any, model: Model) {
  const resolved = resolveReasoningEffort(body, model);
  delete body.effort;
  if (resolved.upstreamValue !== undefined) {
    body.reasoning_effort = resolved.upstreamValue;
    body.reasoning = {
      ...(body.reasoning && typeof body.reasoning === "object"
        ? body.reasoning
        : {}),
      effort: resolved.upstreamValue,
    };
  } else {
    delete body.reasoning_effort;
    if (body.reasoning && typeof body.reasoning === "object") {
      const { effort: _effort, ...rest } = body.reasoning;
      body.reasoning = Object.keys(rest).length ? rest : undefined;
    }
  }
  Object.defineProperty(body, "__klove_reasoning", {
    value: resolved,
    configurable: true,
    writable: true,
    enumerable: false,
  });
  return resolved;
}
