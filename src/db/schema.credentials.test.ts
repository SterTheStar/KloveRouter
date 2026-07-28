import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { decryptSecret } from "../services/secret.service";
import { initSchema } from "./schema";

let db: Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe("provider credential migration", () => {
  it("encrypts legacy and existing secrets without double-encrypting", () => {
    db = new Database(":memory:");
    initSchema(db);
    db.query(
      "INSERT INTO providers (id, name, base_url, api_key) VALUES (?, ?, ?, ?)",
    ).run("legacy", "Legacy", "https://example.com", "legacy-secret");
    db.query(
      "INSERT INTO providers (id, name, base_url, api_key) VALUES (?, ?, ?, ?)",
    ).run("existing", "Existing", "https://example.net", "provider-secret");
    db.query(
      "INSERT INTO provider_credentials (id, provider_id, label, kind, secret) VALUES (?, ?, ?, ?, ?)",
    ).run("existing-credential", "existing", "Existing", "api_key", "credential-secret");

    initSchema(db);

    const legacyProvider = db
      .query("SELECT api_key FROM providers WHERE id = ?")
      .get("legacy") as { api_key: string };
    const legacyCredential = db
      .query("SELECT secret FROM provider_credentials WHERE provider_id = ?")
      .get("legacy") as { secret: string };
    const existingCredential = db
      .query("SELECT secret FROM provider_credentials WHERE id = ?")
      .get("existing-credential") as { secret: string };
    const existingProvider = db
      .query("SELECT api_key FROM providers WHERE id = ?")
      .get("existing") as { api_key: string };

    expect(legacyProvider.api_key).toStartWith("enc:v1:");
    expect(decryptSecret(legacyProvider.api_key)).toBe("legacy-secret");
    expect(decryptSecret(legacyCredential.secret)).toBe("legacy-secret");
    expect(decryptSecret(existingProvider.api_key)).toBe("provider-secret");
    expect(decryptSecret(existingCredential.secret)).toBe("credential-secret");

    const encryptedValues = [
      legacyProvider.api_key,
      legacyCredential.secret,
      existingProvider.api_key,
      existingCredential.secret,
    ];
    initSchema(db);
    expect([
      (db.query("SELECT api_key FROM providers WHERE id = ?").get("legacy") as { api_key: string }).api_key,
      (db.query("SELECT secret FROM provider_credentials WHERE provider_id = ?").get("legacy") as { secret: string }).secret,
      (db.query("SELECT api_key FROM providers WHERE id = ?").get("existing") as { api_key: string }).api_key,
      (db.query("SELECT secret FROM provider_credentials WHERE id = ?").get("existing-credential") as { secret: string }).secret,
    ]).toEqual(encryptedValues);
  });
});
