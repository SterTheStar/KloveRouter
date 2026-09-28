process.env.DB_PATH = ":memory:";

import { describe, expect, test } from "bun:test";
const { getDb } = await import("../db/connection");
const { modelService } = await import("./model.service");

describe("model multimodal capabilities persistence", () => {
  test("creates and updates all capability fields without placeholder mismatch", () => {
    const db = getDb();
    const providerId = crypto.randomUUID();
    db.query("INSERT INTO providers (id, name, base_url, api_key) VALUES (?, ?, ?, ?)")
      .run(providerId, `test-${providerId}`, "https://example.com/v1", "");
    const model = modelService.create({
      provider_id: providerId,
      model_id: "multimodal-test",
      capabilities: {
        reasoning: null,
        tools: null,
        vision: true,
        audio_input: true,
        audio_output: true,
        video: true,
        attachments: true,
        streaming: null,
        non_streaming: null,
      },
    });

    const updated = modelService.update(model.id, {
      capabilities: {
        reasoning: null,
        tools: null,
        vision: false,
        audio_input: false,
        audio_output: true,
        video: false,
        attachments: true,
        streaming: null,
        non_streaming: null,
      },
    });

    expect(updated?.capabilities).toEqual({
      reasoning: null,
      tools: null,
      vision: false,
      audio_input: false,
      audio_output: true,
      video: false,
      attachments: true,
      streaming: null,
      non_streaming: null,
    });
    modelService.remove(model.id);
    db.query("DELETE FROM providers WHERE id = ?").run(providerId);
  });
});
