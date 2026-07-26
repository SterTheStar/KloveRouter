import { Elysia, t } from "elysia";
import { requestLogService } from "../services/request-log.service";

export const requestLogsPlugin = (app: Elysia) => app
  .get("/api/request-logs", ({ query }) => requestLogService.list({ limit: query.limit ? Number(query.limit) : 50, offset: query.offset ? Number(query.offset) : 0, status: query.status, provider: query.provider, search: query.search }), {
    query: t.Object({ limit: t.Optional(t.String()), offset: t.Optional(t.String()), status: t.Optional(t.String()), provider: t.Optional(t.String()), search: t.Optional(t.String()) }),
  })
  .delete("/api/request-logs", () => ({ success: true, removed: requestLogService.clear() }));
