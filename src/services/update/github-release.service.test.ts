import { describe, expect, it, beforeEach } from "bun:test";
import {
  checkForUpdates,
  clearReleaseCache,
  DEFAULT_REPO,
  getEffectiveRepo,
} from "./github-release.service";
import { CURRENT_VERSION } from "../../version";

describe("github release service", () => {
  beforeEach(() => {
    clearReleaseCache();
    delete process.env.SATURN_UPDATE_REPO;
  });

  it("resolves default repo when no overrides provided", () => {
    expect(getEffectiveRepo()).toBe(DEFAULT_REPO);
  });

  it("respects env variable override if provided", () => {
    process.env.SATURN_UPDATE_REPO = "env-org/env-saturn";
    expect(getEffectiveRepo()).toBe("env-org/env-saturn");
  });

  it("respects direct argument override if provided", () => {
    expect(getEffectiveRepo("custom/repo")).toBe("custom/repo");
    process.env.SATURN_UPDATE_REPO = "env-org/env-saturn";
    expect(getEffectiveRepo("custom/repo")).toBe("custom/repo");
  });

  it("handles check for updates safely even if repo has no releases", async () => {
    const result = await checkForUpdates({ repo: "SterTheStar/SaturnRouter", force: true });
    expect(result.currentVersion).toBe(CURRENT_VERSION);
    expect(typeof result.hasUpdate).toBe("boolean");
    expect(Array.isArray(result.releases)).toBe(true);
    expect(result.repo).toBe("SterTheStar/SaturnRouter");
  });
});
