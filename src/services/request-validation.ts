import type { Model } from "./model.service";

export class ModelRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRequestError";
  }
}

const outputTokenFields = [
  "max_output_tokens",
  "max_completion_tokens",
  "max_tokens",
] as const;

export function resolveRequestedOutputTokens(body: any): {
  value?: number;
  field?: (typeof outputTokenFields)[number];
} {
  const supplied = outputTokenFields
    .filter((field) => body?.[field] !== undefined)
    .map((field) => ({ field, value: body[field] }));
  if (!supplied.length) return {};
  for (const item of supplied) {
    if (!Number.isInteger(item.value) || item.value <= 0)
      throw new ModelRequestError(`${item.field} must be a positive integer`);
  }
  if (new Set(supplied.map((item) => item.value)).size > 1)
    throw new ModelRequestError(
      `Conflicting output token limits supplied in ${supplied.map((item) => item.field).join(", ")}`,
    );
  return supplied[0];
}

function textCharacters(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, part) => {
    if (!part || typeof part !== "object") return total;
    const record = part as Record<string, unknown>;
    return total +
      (typeof record.text === "string" ? record.text.length : 0) +
      (typeof record.content === "string" ? record.content.length : 0);
  }, 0);
}

export function estimateRequestTextTokens(body: any): number {
  if (!Array.isArray(body?.messages)) return 0;
  const characters = body.messages.reduce(
    (total: number, message: unknown) =>
      total +
      (message && typeof message === "object"
        ? textCharacters((message as Record<string, unknown>).content)
        : 0),
    0,
  );
  return Math.ceil(characters / 4);
}

export function validateModelRequest(body: any, model: Model): void {
  const output = resolveRequestedOutputTokens(body);
  if (
    output.value !== undefined &&
    model.max_output_tokens !== null &&
    output.value > model.max_output_tokens
  )
    throw new ModelRequestError(
      `${output.field} (${output.value}) exceeds model "${model.model_id}" maximum output of ${model.max_output_tokens} tokens`,
    );

  if (output.value !== undefined) {
    body.max_output_tokens = output.value;
    delete body.max_completion_tokens;
    delete body.max_tokens;
  }

  if (
    model.capabilities.tools === false &&
    (body?.tools !== undefined || body?.functions !== undefined)
  )
    throw new ModelRequestError(
      `Model "${model.model_id}" does not support tools or functions`,
    );

  if (model.context_window === null) return;
  const inputEstimate = estimateRequestTextTokens(body);
  const requestedOutput = output.value ?? 0;
  const totalEstimate = inputEstimate + requestedOutput;
  if (totalEstimate > model.context_window)
    throw new ModelRequestError(
      `Request clearly exceeds model "${model.model_id}" context window: estimated ${inputEstimate} input tokens + ${requestedOutput} requested output tokens = ${totalEstimate}, maximum ${model.context_window}. Request was not truncated.`,
    );
}
