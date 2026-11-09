import { describe, expect, it } from "bun:test";
import { customSkillsProxy } from "./custom-skills.proxy";

describe("Custom Skills & Marketplace", () => {
  it("lists marketplace skills with metadata", async () => {
    const marketplace = await customSkillsProxy.listMarketplace();
    expect(marketplace.skills.length).toBeGreaterThanOrEqual(10);
    const tsSkill = marketplace.skills.find((s) => s.slug === "typescript-strict-engineer");
    expect(tsSkill).toBeDefined();
    expect(tsSkill?.category).toBe("Development");
  });

  it("installs and uninstalls a marketplace skill", async () => {
    const slug = "docker-container-hardening";

    // Install
    const installed = await customSkillsProxy.installMarketplaceSkill(slug);
    expect(installed).toBeDefined();
    expect(installed.name).toBe("Docker Container Hardening");
    expect(installed.slug).toBe(slug);
    expect(installed.source).toBe("marketplace");
    expect(installed.is_active).toBe(true);

    // Verify marketplace reflects installation
    const marketplace = await customSkillsProxy.listMarketplace();
    const item = marketplace.skills.find((s) => s.slug === slug);
    expect(item?.is_installed).toBe(true);
    expect(item?.installed_id).toBe(installed.id);

    // Idempotent install returns existing
    const reinstalled = await customSkillsProxy.installMarketplaceSkill(slug);
    expect(reinstalled.id).toBe(installed.id);

    // Uninstall
    const uninstalled = await customSkillsProxy.uninstallMarketplaceSkill(slug);
    expect(uninstalled).toBe(true);

    // Verify removed
    const marketplaceAfter = await customSkillsProxy.listMarketplace();
    const itemAfter = marketplaceAfter.skills.find((s) => s.slug === slug);
    expect(itemAfter?.is_installed).toBe(false);
  });

  it("creates, updates, toggles and removes a custom skill", async () => {
    const custom = await customSkillsProxy.create(
      "Test Custom Expert",
      "Always reply with polite brevity.",
      {
        description: "Test description",
        category: "Testing",
        author: "Tester",
      },
    );
    expect(custom.id).toBeDefined();
    expect(custom.name).toBe("Test Custom Expert");
    expect(custom.is_active).toBe(true);

    // Toggle active state
    const toggled = await customSkillsProxy.update(custom.id, { is_active: false });
    expect(toggled?.is_active).toBe(false);

    // Update content and name
    const updated = await customSkillsProxy.update(custom.id, {
      name: "Renamed Custom Expert",
      content: "Always reply with extreme brevity.",
    });
    expect(updated?.name).toBe("Renamed Custom Expert");
    expect(updated?.content).toBe("Always reply with extreme brevity.");

    // Remove
    const removed = await customSkillsProxy.remove(custom.id);
    expect(removed).toBe(true);
  });

  it("injects active skills into system prompt messages", async () => {
    const skill = await customSkillsProxy.create(
      "Tone Master",
      "Adopt a friendly tone.",
      { category: "Custom" },
    );

    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];

    const injected = await customSkillsProxy.injectSkills(messages);
    expect(injected[0].role).toBe("system");
    expect(injected[0].content).toContain("You are a helpful assistant.");
    expect(injected[0].content).toContain("## Tone Master");
    expect(injected[0].content).toContain("Adopt a friendly tone.");

    // Clean up
    await customSkillsProxy.remove(skill.id);
  });
});
