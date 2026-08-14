import { afterEach, describe, expect, it } from "bun:test";
import { atomesusResponses, encodeAtomesusConfig } from "./atomesus.client";

describe("Atomesus integration", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("encodes the upstream model cookie", () => {
    const encoded = encodeAtomesusConfig("atomesus-2", "High", 123);
    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual({
      m: "atomesus-2",
      e: "High",
      t: 123,
    });
  });

  it("reports gateway outages separately from invalid tokens", async () => {
    globalThis.fetch = (async () => new Response("<html>504 Gateway Time-out</html>", { status: 504 })) as unknown as typeof fetch;
    await expect(
      atomesusResponses(
        { messages: [{ role: "user", content: "Say ok." }], stream: false },
        "atomesus-2",
        { id: "credential", secret: "redacted-test-token" },
        "https://api.atomesus.com",
      ),
    ).rejects.toThrow("gateway unavailable (504)");
  });
});
