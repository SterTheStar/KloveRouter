import { Elysia, t } from "elysia";
import { customSkillsProxy } from "./custom-skills.proxy";
import { logger } from "../../logger";

export const customSkillsPlugin = (app: Elysia) =>
  app
    .get("/api/custom-skills", async () => {
      const skills = await customSkillsProxy.list();
      const enriched = await Promise.all(
        skills.map(async (s) => customSkillsProxy.get(s.id)),
      );
      return enriched.filter(Boolean);
    })
    .get(
      "/api/custom-skills/marketplace",
      async ({ query }) => {
        const { search, category, page, limit } = query as {
          search?: string;
          category?: string;
          page?: string;
          limit?: string;
        };

        const res = await customSkillsProxy.listMarketplace({
          search,
          category,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 36,
        });

        return res;
      },
      {
        query: t.Object({
          search: t.Optional(t.String()),
          category: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      },
    )
    .get("/api/custom-skills/marketplace/:slug", async ({ params: { slug }, set }) => {
      const skill = await customSkillsProxy.getMarketplaceSkill(slug);
      if (!skill) {
        set.status = 404;
        return { error: "Marketplace skill not found" };
      }
      return skill;
    })
    .post("/api/custom-skills/marketplace/:slug/install", async ({ params: { slug }, set }) => {
      try {
        const installed = await customSkillsProxy.installMarketplaceSkill(slug);
        return installed;
      } catch (err: any) {
        set.status = 404;
        return { error: err.message || "Failed to install skill" };
      }
    })
    .post("/api/custom-skills/marketplace/:slug/uninstall", async ({ params: { slug }, set }) => {
      const ok = await customSkillsProxy.uninstallMarketplaceSkill(slug);
      if (!ok) {
        set.status = 404;
        return { error: "Skill not installed" };
      }
      return { success: true };
    })
    .get("/api/custom-skills/designs", async ({ query }: { query?: { refresh?: string } }) => {
      const forceRefresh = query?.refresh === "true";
      return customSkillsProxy.listDesignSkills(forceRefresh);
    })
    .post("/api/custom-skills/designs/refresh", async () => {
      return customSkillsProxy.refreshDesignSkills();
    })
    .get("/api/custom-skills/designs/:slug", async ({ params: { slug }, set }) => {
      const design = await customSkillsProxy.getDesignSkill(slug);
      if (!design) {
        set.status = 404;
        return { error: "Design skill not found" };
      }
      return design;
    })
    .post("/api/custom-skills/designs/:slug/activate", async ({ params: { slug }, set }) => {
      try {
        const activated = await customSkillsProxy.activateDesignSkill(slug);
        return activated;
      } catch (err: any) {
        set.status = 404;
        return { error: err.message || "Failed to activate design skill" };
      }
    })
    .post("/api/custom-skills/designs/:slug/deactivate", async ({ params: { slug }, set }) => {
      const ok = await customSkillsProxy.deactivateDesignSkill(slug);
      if (!ok) {
        set.status = 404;
        return { error: "Design skill was not installed" };
      }
      return { success: true };
    })
    .get("/api/custom-skills/:id", async ({ params: { id }, set }) => {
      const skill = await customSkillsProxy.get(id);
      if (!skill) {
        set.status = 404;
        return { error: "Skill not found" };
      }
      return skill;
    })
    .post(
      "/api/custom-skills",
      async ({ body, set }) => {
        const { name, content, description, category, slug, author } = body as {
          name: string;
          content: string;
          description?: string;
          category?: string;
          slug?: string;
          author?: string;
        };
        if (!name?.trim() || !content?.trim()) {
          set.status = 400;
          return { error: "name and content are required" };
        }
        const skill = await customSkillsProxy.create(name.trim(), content, {
          description: description?.trim(),
          category: category?.trim(),
          slug: slug?.trim(),
          author: author?.trim(),
          source: "custom",
        });
        logger.success(`Custom skill created: ${skill.name}`);
        return skill;
      },
      {
        body: t.Object({
          name: t.String(),
          content: t.String(),
          description: t.Optional(t.String()),
          category: t.Optional(t.String()),
          slug: t.Optional(t.String()),
          author: t.Optional(t.String()),
        }),
      },
    )
    .put(
      "/api/custom-skills/:id",
      async ({ params: { id }, body, set }) => {
        const data = body as {
          name?: string;
          content?: string;
          description?: string;
          category?: string;
          is_active?: boolean;
        };
        if (
          (data.name !== undefined && !data.name.trim()) ||
          (data.content !== undefined && !data.content.trim())
        ) {
          set.status = 400;
          return { error: "name and content cannot be empty" };
        }
        const skill = await customSkillsProxy.update(id, data);
        if (!skill) {
          set.status = 404;
          return { error: "Skill not found" };
        }
        logger.info(
          `Custom skill updated: ${skill.name}${
            data.is_active !== undefined ? ` (active: ${data.is_active})` : ""
          }`,
        );
        return skill;
      },
      {
        body: t.Object({
          name: t.Optional(t.String()),
          content: t.Optional(t.String()),
          description: t.Optional(t.String()),
          category: t.Optional(t.String()),
          is_active: t.Optional(t.Boolean()),
        }),
      },
    )
    .delete("/api/custom-skills/:id", async ({ params: { id }, set }) => {
      const ok = await customSkillsProxy.remove(id);
      if (!ok) {
        set.status = 404;
        return { error: "Skill not found" };
      }
      logger.info(`Custom skill deleted: ${id}`);
      return { success: true };
    })
    .post("/api/custom-skills/:id/toggle", async ({ params: { id }, set }) => {
      const skill = await customSkillsProxy.get(id);
      if (!skill) {
        set.status = 404;
        return { error: "Skill not found" };
      }
      const updated = await customSkillsProxy.update(id, {
        is_active: !skill.is_active,
      });
      logger.info(
        `Custom skill toggled: ${updated?.name} ${
          updated?.is_active ? "active" : "inactive"
        }`,
      );
      return updated;
    });
