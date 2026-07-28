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
        const { name, content } = body as { name: string; content: string };
        if (!name?.trim() || !content?.trim()) {
          set.status = 400;
          return { error: "name and content are required" };
        }
        const skill = await customSkillsProxy.create(name.trim(), content);
        logger.success(`Custom skill created: ${skill.name}`);
        return skill;
      },
      { body: t.Object({ name: t.String(), content: t.String() }) },
    )
    .put(
      "/api/custom-skills/:id",
      async ({ params: { id }, body, set }) => {
        const data = body as {
          name?: string;
          content?: string;
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
        logger.info(`Custom skill updated: ${skill.name}${data.is_active !== undefined ? ` (active: ${data.is_active})` : ""}`);
        return skill;
      },
      {
        body: t.Object({
          name: t.Optional(t.String()),
          content: t.Optional(t.String()),
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
       logger.info(`Custom skill toggled: ${updated?.name} ${updated?.is_active ? "active" : "inactive"}`);
      return updated;
    });
