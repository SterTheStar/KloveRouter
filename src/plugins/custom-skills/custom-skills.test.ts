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

  it("filters marketplace by search query and category", async () => {
    // 1. Single word search
    const pySearch = await customSkillsProxy.listMarketplace({ search: "python" });
    expect(pySearch.total).toBeGreaterThan(0);
    for (const skill of pySearch.skills) {
      const match =
        skill.name.toLowerCase().includes("python") ||
        (skill.description && skill.description.toLowerCase().includes("python")) ||
        (skill.tags && skill.tags.some((t) => t.toLowerCase().includes("python")));
      expect(match).toBe(true);
    }

    // 2. Multi-word search
    const multiSearch = await customSkillsProxy.listMarketplace({ search: "fastapi clean" });
    expect(multiSearch.total).toBeGreaterThan(0);
    const hasFastApi = multiSearch.skills.some((s) => s.slug === "python-fastapi-architect");
    expect(hasFastApi).toBe(true);

    // 3. Category + search combined
    const devSearch = await customSkillsProxy.listMarketplace({
      search: "typescript",
      category: "Development",
    });
    expect(devSearch.total).toBeGreaterThan(0);
    expect(devSearch.skills.some((s) => s.slug === "typescript-strict-engineer")).toBe(true);

    // 4. Non-matching search returns 0
    const emptySearch = await customSkillsProxy.listMarketplace({
      search: "nonexistent-xyz-random-12345",
    });
    expect(emptySearch.total).toBe(0);
    expect(emptySearch.skills.length).toBe(0);
  });

  it("handles awesome design skills and enforces single-active rule", async () => {
    // 1. List designs
    const designs = await customSkillsProxy.listDesignSkills();
    expect(designs.length).toBeGreaterThanOrEqual(10);
    const neo = designs.find((d) => d.slug === "neobrutalism");
    expect(neo).toBeDefined();
    expect(neo?.palette.primary).toBe("#FFE600");

    // 2. Activate Neobrutalism
    const active1 = await customSkillsProxy.activateDesignSkill("neobrutalism");
    expect(active1.is_active).toBe(true);
    expect(active1.category).toBe("UI Design");

    const designsAfter1 = await customSkillsProxy.listDesignSkills();
    const neoStatus = designsAfter1.find((d) => d.slug === "neobrutalism");
    expect(neoStatus?.is_active).toBe(true);

    // 3. Activate Glassmorphism -> MUST automatically deactivate Neobrutalism!
    const active2 = await customSkillsProxy.activateDesignSkill("glassmorphism");
    expect(active2.is_active).toBe(true);

    const designsAfter2 = await customSkillsProxy.listDesignSkills();
    const neoStatus2 = designsAfter2.find((d) => d.slug === "neobrutalism");
    const glassStatus2 = designsAfter2.find((d) => d.slug === "glassmorphism");

    expect(glassStatus2?.is_active).toBe(true);
    expect(neoStatus2?.is_active).toBe(false); // Verified: only 1 design skill active at a time!

    // 4. Deactivate Glassmorphism
    const deactivated = await customSkillsProxy.deactivateDesignSkill("glassmorphism");
    expect(deactivated).toBe(true);

    const designsAfter3 = await customSkillsProxy.listDesignSkills();
    const glassStatus3 = designsAfter3.find((d) => d.slug === "glassmorphism");
    expect(glassStatus3?.is_active).toBe(false);

    // Clean up test skills
    if (active1.id) await customSkillsProxy.remove(active1.id);
    if (active2.id) await customSkillsProxy.remove(active2.id);
  });
});
