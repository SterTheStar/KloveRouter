import { describe, expect, it } from "bun:test";
import {
  formatBadge,
  formatMethod,
  formatStartupBanner,
  getRegisteredEndpoints,
} from "./startup-banner";

describe("startup-banner service", () => {
  it("formats method with color codes", () => {
    const post = formatMethod("POST");
    expect(post).toContain("POST");
    const get = formatMethod("GET");
    expect(get).toContain("GET");
  });

  it("formats badge with background color and padding", () => {
    const badge = formatBadge("OPENAI", "\x1b[48;2;16;185;129m", 10);
    expect(badge).toContain("OPENAI");
    expect(badge).toContain("\x1b[48;2;16;185;129m");
  });

  it("returns registered endpoint groups with expected categories and routes", () => {
    const groups = getRegisteredEndpoints({ port: 3000, host: "localhost", oauthPort: 1455 });
    expect(groups.length).toBeGreaterThanOrEqual(4);

    const titles = groups.map((g) => g.title);
    expect(titles).toContain("Control Plane & Management");
    expect(titles).toContain("AI Routing & Gateways");
    expect(titles).toContain("Media & Generation Gateways");
    expect(titles).toContain("Integrations & OAuth");

    const allPaths = groups.flatMap((g) => g.endpoints.map((e) => e.path));
    expect(allPaths).toContain("/v1/chat/completions");
    expect(allPaths).toContain("/v1/messages");
    expect(allPaths).toContain("/v1/responses");
    expect(allPaths).toContain("/v1/models");
    expect(allPaths).toContain("/v1/images/generations");
    expect(allPaths).toContain("/v1/audio/speech");
    expect(allPaths).toContain("/v1/videos");
    expect(allPaths).toContain("/v1/embeddings");
  });

  it("renders a complete startup banner string containing all key details", () => {
    const banner = formatStartupBanner({
      port: 3000,
      host: "localhost",
      version: "0.2.0-beta",
      oauthPort: 1455,
    });

    expect(banner).toContain("Saturn Router");
    expect(banner).toContain("v0.2.0-beta");
    expect(banner).toContain("http://0.0.0.0:3000");
    expect(banner).toContain("http://localhost:3000");
    expect(banner).toContain("OPENAI");
    expect(banner).toContain("ANTHROPIC");
    expect(banner).toContain("RESPONSES");
    expect(banner).toContain("CATALOG");
    expect(banner).toContain("IMAGES");
    expect(banner).toContain("AUDIO");
    expect(banner).toContain("VIDEOS");
    expect(banner).toContain("OAUTH");
    expect(banner).toContain("/v1/chat/completions");
    expect(banner).toContain("/v1/messages");
    expect(banner).toContain("/v1/responses");
  });
});
