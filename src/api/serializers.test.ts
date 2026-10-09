import { describe, expect, it } from "bun:test";
import { serializeProvider } from "./serializers";
import { publicAvatar } from "../services/avatar.service";
import type { ProviderPublic } from "../services/provider.service";

const dataUrl = "data:image/png;base64,AAECAw==";

function providerFrom(id: string, avatar: string | null): ProviderPublic {
  const resolved = publicAvatar({ id, avatar, protocol: "openai", baseUrl: "https://api.example.com" });
  return {
    id,
    name: "p",
    base_url: "https://api.example.com",
    avatar: resolved.avatar,
    avatar_sources: resolved.sources,
    avatar_override: avatar,
    protocol: "openai",
    credential_mode: "fixed",
    fixed_credential_id: null,
    is_active: 1,
    created_at: "",
    updated_at: "",
  } as ProviderPublic;
}

describe("provider avatar serialization", () => {
  it("never leaks a raw data URL in any avatar field", () => {
    const out = serializeProvider(providerFrom("p1", dataUrl), { includeAvatarOverride: true });
    const json = JSON.stringify(out);
    expect(json).not.toContain("data:image");
    expect(out.avatar).toMatch(/^\/api\/media\/avatars\/p1\/[a-f0-9]{64}$/);
    expect(out.avatar_override).toBe(out.avatar);
  });

  it("keeps detected icons as sources and omits the override by default", () => {
    const out = serializeProvider(providerFrom("p2", null));
    expect(out).not.toHaveProperty("avatar_override");
    expect(out.avatar_sources).toEqual([]);
    expect(out.avatar).toBe("https://www.google.com/s2/favicons?domain=api.example.com&sz=64");
  });
});
