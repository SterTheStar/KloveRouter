import { describe, expect, it } from "bun:test";
import {
  getUpdateProgress,
  getUpdateSettings,
  resetUpdateState,
  saveUpdateSettings,
} from "./updater.service";

describe("updater service", () => {
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
