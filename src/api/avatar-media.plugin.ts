import { Elysia, t } from "elysia";
import { providerService } from "../services/provider.service";
import {
  avatarHash,
  avatarResponseHeaders,
  parseDataAvatar,
} from "../services/avatar.service";

export const avatarMediaPlugin = (app: Elysia) =>
  app.get(
    "/api/media/avatars/:id/:hash",
    ({ params: { id, hash }, headers, set }) => {
      const provider = providerService.findById(id);
      const parsed = provider?.avatar ? parseDataAvatar(provider.avatar) : null;
      if (!parsed || !provider?.avatar || avatarHash(provider.avatar) !== hash) {
        set.status = 404;
        return new Response("Not Found", { status: 404 });
      }
      const responseHeaders = avatarResponseHeaders(parsed.mimeType, hash);
      if (headers["if-none-match"] === responseHeaders.get("etag")) {
        set.status = 304;
        return new Response(null, { status: 304, headers: responseHeaders });
      }
      return new Response(Buffer.from(parsed.bytes), { headers: responseHeaders });
    },
    { params: t.Object({ id: t.String(), hash: t.String() }) },
  );
