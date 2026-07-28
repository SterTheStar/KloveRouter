import { afterEach, describe, expect, it } from "bun:test";
import { encodeAtomesusConfig } from "./atomesus.client";

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
});
