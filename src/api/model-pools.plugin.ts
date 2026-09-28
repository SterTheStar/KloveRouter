import { Elysia, t } from "elysia";
import { modelPoolService, InvalidModelPoolError } from "../services/model-pool.service";
import { modelService } from "../services/model.service";
import { keyService } from "../services/key.service";

const memberSchema = t.Object({ model_id: t.String({ minLength: 1 }), priority: t.Integer({ minimum: 0 }) });
const inputSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  slug: t.String({ minLength: 1, maxLength: 80, pattern: "^[a-z0-9][a-z0-9_-]*$" }),
  strategy: t.Union([t.Literal("priority"), t.Literal("random")]),
  hide_members: t.Boolean(),
  is_active: t.Boolean(),
  max_input_tokens: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), t.Null()])),
  max_output_tokens: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), t.Null()])),
  members: t.Array(memberSchema, { minItems: 2 }),
});

export const modelPoolsPlugin = (app: Elysia) =>
  app
    .get("/api/model-pools", () => modelPoolService.list())
    .get("/api/model-pools/models", () => {
      const pools = modelPoolService.list();
      return modelService.findAllWithProvider().map((model) => ({
        ...model,
        pool_member_of: pools.filter((pool) => pool.members.some((member) => member.id === model.id)).map((pool) => pool.name),
      }));
    })
    .post("/api/model-pools/:id/test", async ({ params, set }) => {
      const result = await modelPoolService.test(params.id, `Bearer ${keyService.internalKey()}`);
      if (!result.success) set.status = 502;
      return result;
    }, { params: t.Object({ id: t.String({ minLength: 1 }) }) })
    .post("/api/model-pools", ({ body, set }) => {
      try {
        return modelPoolService.create({ ...body, max_input_tokens: body.max_input_tokens ?? null, max_output_tokens: body.max_output_tokens ?? null });
      } catch (error) {
        if (error instanceof InvalidModelPoolError) {
          set.status = 400;
          return { error: "Invalid compound model", message: error.message };
        }
        throw error;
      }
    }, { body: inputSchema })
    .put("/api/model-pools/:id", ({ params, body, set }) => {
      try {
        const updated = modelPoolService.update(params.id, { ...body, max_input_tokens: body.max_input_tokens ?? null, max_output_tokens: body.max_output_tokens ?? null });
        if (!updated) {
          set.status = 404;
          return { error: "Compound model not found" };
        }
        return updated;
      } catch (error) {
        if (error instanceof InvalidModelPoolError) {
          set.status = 400;
          return { error: "Invalid compound model", message: error.message };
        }
        throw error;
      }
    }, { params: t.Object({ id: t.String({ minLength: 1 }) }), body: inputSchema })
    .delete("/api/model-pools/:id", ({ params, set }) => {
      if (!modelPoolService.delete(params.id)) {
        set.status = 404;
        return { error: "Compound model not found" };
      }
      return { success: true };
    }, { params: t.Object({ id: t.String({ minLength: 1 }) }) });
