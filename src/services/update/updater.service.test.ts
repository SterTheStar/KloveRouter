import { describe, expect, it } from "bun:test";
import {
  getUpdateProgress,
  getUpdateSettings,
  resetUpdateState,
  saveUpdateSettings,
} from "./updater.service";
import { CURRENT_VERSION, isPrereleaseVersion } from "../../version";

describe("updater service", () => {
  it("forces includePrerelease on when running a prerelease build", () => {
    const original = getUpdateSettings();
    const locked = isPrereleaseVersion(CURRENT_VERSION);
    expect(original.includePrereleaseLocked).toBe(locked);

    if (locked) {
      saveUpdateSettings({ includePrerelease: false });
      const after = getUpdateSettings();
      expect(after.includePrerelease).toBe(true);
      expect(after.includePrereleaseLocked).toBe(true);
    }

    saveUpdateSettings(original);
  });

  it("reads and persists updater settings", () => {
    const original = getUpdateSettings();
    expect(typeof original.autoCheck).toBe("boolean");
    expect(typeof original.includePrerelease).toBe("boolean");

    saveUpdateSettings({
      autoCheck: false,
      includePrerelease: true,
    });

    const updated = getUpdateSettings();
    expect(updated.autoCheck).toBe(false);
    expect(updated.includePrerelease).toBe(true);

    // Restore original
    saveUpdateSettings(original);
  });

  it("manages progress state and reset", () => {
    const progress = getUpdateProgress();
    expect(progress).toHaveProperty("status");
    expect(progress).toHaveProperty("logs");
    expect(Array.isArray(progress.logs)).toBe(true);

    const reset = resetUpdateState();
    expect(reset.status).toBe("idle");
  });
});
