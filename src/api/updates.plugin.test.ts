import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { updatesPlugin } from "./updates.plugin";
import { CURRENT_VERSION } from "../version";

describe("updatesPlugin API endpoints", () => {
  const app = new Elysia().use(updatesPlugin);

  it("GET /api/updates/status returns valid version and progress structure", async () => {
    const res = await app.handle(new Request("http://localhost/api/updates/status"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.currentVersion).toBe(CURRENT_VERSION);
    expect(typeof body.hasUpdate).toBe("boolean");
    expect(body.progress).toHaveProperty("status");
    expect(body.settings).toHaveProperty("autoCheck");
  });

  it("GET /api/updates/progress returns current updater state", async () => {
    const res = await app.handle(new Request("http://localhost/api/updates/progress"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("step");
    expect(body).toHaveProperty("progress");
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("GET /api/updates/settings and PUT /api/updates/settings manage preferences", async () => {
    const getRes = await app.handle(new Request("http://localhost/api/updates/settings"));
    expect(getRes.status).toBe(200);
    const initialSettings = await getRes.json();

    const putRes = await app.handle(
      new Request("http://localhost/api/updates/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoCheck: true,
          includePrerelease: true,
        }),
      }),
    );
    expect(putRes.status).toBe(200);
    const updated = await putRes.json();
    expect(updated.autoCheck).toBe(true);
    expect(updated.includePrerelease).toBe(true);

    // Restore
    await app.handle(
      new Request("http://localhost/api/updates/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoCheck: initialSettings.autoCheck,
          includePrerelease: initialSettings.includePrerelease,
        }),
      }),
    );
  });
});
