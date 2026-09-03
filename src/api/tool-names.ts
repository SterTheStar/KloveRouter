const MAX_TOOL_NAME_LENGTH = 128;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function shortestRepeatedUnit(value: string): string | null {
  for (let length = 1; length <= Math.floor(value.length / 2); length++) {
    if (value.length % length !== 0) continue;
    const unit = value.slice(0, length);
    if (unit.repeat(value.length / length) === value) return unit;
  }
  return null;
}

export function normalizeToolName(current: string, incoming: unknown): string {
  if (typeof incoming !== "string" || !incoming) return current;
  const value = shortestRepeatedUnit(incoming) ?? incoming;
  if (!current) return value.slice(0, MAX_TOOL_NAME_LENGTH);
  if (value === current || value.startsWith(current)) return value;
  if (current.startsWith(value) || current.endsWith(value)) return current;
  const combined = current + value;
  return combined.slice(0, MAX_TOOL_NAME_LENGTH);
}

export function validateToolName(name: unknown): name is string {
  return typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_TOOL_NAME_LENGTH &&
    TOOL_NAME_PATTERN.test(name);
}

export function normalizeToolDefinitions(tools: unknown): any[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const seen = new Set<string>();
  const normalized: any[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object")
      throw new Error("Each tool must be an object");
    const source = tool as any;
    const functionSource = source.function ?? source;
    const name = normalizeToolName("", functionSource.name);
    if (!validateToolName(name))
      throw new Error(`Tool name must contain only letters, numbers, underscores, or hyphens and be at most ${MAX_TOOL_NAME_LENGTH} characters`);
    if (seen.has(name)) continue;
    seen.add(name);
    normalized.push(source.function
      ? { ...source, function: { ...functionSource, name } }
      : { ...source, name });
  }
  return normalized;
}

export const maxToolNameLength = MAX_TOOL_NAME_LENGTH;
