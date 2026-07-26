const acronymWords = new Set(["ai", "api", "gpt", "llm", "mcp", "ui", "ux"]);

function titleWord(word: string) {
  const lower = word.toLowerCase();
  if (acronymWords.has(lower)) return lower.toUpperCase();
  return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : "";
}

export function generateDisplayName(modelId: string) {
  const raw =
    modelId.trim().split("/").filter(Boolean).at(-1) || modelId.trim();
  const free = /(?:^|[:-])free$/i.test(raw);
  const base = raw
    .replace(/:free$/i, "")
    .replace(/-free$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = base.split(" ").map(titleWord).filter(Boolean).join(" ");
  return free ? `${name} (Free)` : name;
}
