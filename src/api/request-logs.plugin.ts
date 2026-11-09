import { Elysia, t } from "elysia";
import { requestLogService, type RequestLogEvent } from "../services/request-log.service";

const encoder = new TextEncoder();
const HEARTBEAT_MS = 20_000;

const eventPayload = (event: RequestLogEvent) => {
  const data =
    event.type === "created" ? { log: event.log } :
    event.type === "updated" ? { id: event.log.id, log: event.log } :
    { removed: true };
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`);
};

export const requestLogsPlugin = (app: Elysia) =>
  app
    .get(
      "/api/request-logs",
      ({ query }) =>
        requestLogService.list({
          limit: query.limit ? Number(query.limit) : 50,
          offset: query.offset ? Number(query.offset) : 0,
          status: query.status,
          provider: query.provider,
          search: query.search,
          guardrails: query.guardrails,
          before: query.before,
          withTotal: query.withTotal !== "false",
        }),
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
          status: t.Optional(t.String()),
          provider: t.Optional(t.String()),
          search: t.Optional(t.String()),
          guardrails: t.Optional(t.String()),
          before: t.Optional(t.String()),
          withTotal: t.Optional(t.String()),
        }),
      },
    )
    // Server-sent events so the table can update live instead of polling.
    .get("/api/request-logs/stream", () => {
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const send = (chunk: Uint8Array) => {
            if (closed) return;
            try {
              controller.enqueue(chunk);
            } catch {
              closed = true;
              unsubscribe();
              if (heartbeat) clearInterval(heartbeat);
            }
          };
          send(encoder.encode("retry: 3000\n\n"));
          unsubscribe = requestLogService.subscribe((event) => send(eventPayload(event)));
          heartbeat = setInterval(() => send(encoder.encode(": ping\n\n")), HEARTBEAT_MS);
          heartbeat.unref?.();
        },
        cancel() {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    })
    .get("/api/request-logs/:id", ({ params, set }) => {
      const detail = requestLogService.get(params.id);
      if (!detail) {
        set.status = 404;
        return { error: "Request log not found" };
      }
      return detail;
    }, { params: t.Object({ id: t.String() }) })
    .delete("/api/request-logs", () => ({
      success: true,
      removed: requestLogService.clear(),
    }));
