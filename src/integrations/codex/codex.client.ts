import { codexAuthService } from "./codex-auth.service";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_CLIENT_VERSION = process.env.CODEX_CLIENT_VERSION || "1.0.0";

type CodexModel = {
  slug?: string;
  display_name?: string;
  visibility?: string;
  supported_in_api?: boolean;
};

export async function codexModels() {
  const token = await codexAuthService.accessToken();
  const accountId = await codexAuthService.accountId();
  const url = new URL(`${CODEX_BASE_URL}/models`);
  url.searchParams.set("client_version", CODEX_CLIENT_VERSION);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "chatgpt-account-id": accountId || "",
      originator: "codex_cli_rs",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Codex models request failed (${response.status})`);
  }

  const payload = await response.json().catch(() => null) as { models?: CodexModel[] } | null;
  const models = (payload?.models || [])
    .filter((model) => model.slug && model.visibility !== "hidden" && model.supported_in_api !== false)
    .map((model) => ({
      id: model.slug!,
      object: "model",
      owned_by: "codex",
      display_name: model.display_name || model.slug!,
    }));

  if (!models.length) {
    throw new Error("Codex returned no API-compatible models");
  }

  return models;
}


export async function codexResponses(body: any, model: string) {
  const token = await codexAuthService.accessToken();
  const accountId = await codexAuthService.accountId();
  const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "chatgpt-account-id": accountId || "", "OpenAI-Beta": "responses=experimental", originator: "codex_cli_rs", session_id: crypto.randomUUID(), Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: body.messages, instructions: "", store: false, stream: true, tools: body.tools ?? [] }),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429 && text.includes("usage_limit_reached")) throw new Error("Codex usage limit reached");
    throw new Error(text || `Codex request failed (${response.status})`);
  }
  return response;
}

export async function codexTest(model: string) {
  const response = await codexResponses({
    messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
  }, model);
  const text = await response.text();
  const reply: string[] = [];

  for (const event of text.split("\n\n")) {
    const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    const data = dataLine.slice(5).trim();
    if (data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
        reply.push(parsed.delta);
      }
    } catch {
      // Ignore non-JSON SSE keepalive events.
    }
  }

  const output = reply.join("").trim();
  if (!output) throw new Error("Codex returned an empty response");
  return output;
}
