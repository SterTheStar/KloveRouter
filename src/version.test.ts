import { describe, expect, it } from "bun:test";
import { cleanVersionTag, compareSemver, CURRENT_VERSION, isNewerVersion, isPrereleaseVersion, parseSemver } from "./version";

describe("version utilities", () => {
  it("detects prerelease versions", () => {
    expect(isPrereleaseVersion("0.1.2-beta")).toBe(true);
    expect(isPrereleaseVersion("v1.0.0-rc.1")).toBe(true);
    expect(isPrereleaseVersion("1.0.0")).toBe(false);
    expect(isPrereleaseVersion("v1.2.3")).toBe(false);
  });

  it("has a valid CURRENT_VERSION string", () => {
    expect(CURRENT_VERSION).toBeDefined();
    expect(typeof CURRENT_VERSION).toBe("string");
    expect(parseSemver(CURRENT_VERSION)).not.toBeNull();
  });

  it("cleans version tags correctly", () => {
    expect(cleanVersionTag("v1.2.3")).toBe("1.2.3");
    expect(cleanVersionTag("V2.0.0")).toBe("2.0.0");
    expect(cleanVersionTag("  v1.0.4  ")).toBe("1.0.4");
    expect(cleanVersionTag("1.0.0")).toBe("1.0.0");
  });

  it("parses semver versions properly", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseSemver("v2.10.5-beta.1")).toEqual({ major: 2, minor: 10, patch: 5, prerelease: "beta.1" });
    expect(parseSemver("invalid")).toBeNull();
  });

  it("compares semver versions correctly", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
    expect(compareSemver("v1.1.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0-rc1")).toBe(1);
    expect(compareSemver("1.0.0-rc1", "1.0.0")).toBe(-1);
  });

  it("detects newer versions", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "v1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.2.0", "1.1.5")).toBe(false);
  });
});
