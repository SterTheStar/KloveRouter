import { Elysia, t } from "elysia";
import { basename, extname, join, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { providerService } from "../services/provider.service";
import {
  avatarHash,
  avatarResponseHeaders,
  parseDataAvatar,
} from "../services/avatar.service";

const PRESET_DIRS = [
  resolve(import.meta.dir, "../../assets/providers"),
  resolve(process.cwd(), "assets/providers"),
  resolve(import.meta.dir, "../../web/src/assets/providers"),
];

const PRESET_EXTENSIONS = ["", ".png", ".ico", ".svg", ".jpg", ".jpeg"];

const presetEtags = new Map<string, { etag: string; mtimeMs: number }>();

export function findPresetAvatarPath(name: string): string | null {
  const safe = basename(name).trim();
  if (!safe || safe === "." || safe === "..") return null;
  const extensions = extname(safe) ? [""] : PRESET_EXTENSIONS;
  for (const dir of PRESET_DIRS) {
    for (const ext of extensions) {
      const candidate = join(dir, safe + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function getPresetEtag(filePath: string): string {
  const stat = statSync(filePath);
  const cached = presetEtags.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.etag;
  const hash = new Bun.CryptoHasher("sha256").update(`${stat.size}-${stat.mtimeMs}`).digest("hex");
  presetEtags.set(filePath, { etag: hash, mtimeMs: stat.mtimeMs });
  return hash;
}

function servePreset(fileParam: string, headers: Record<string, string | undefined>, set: any) {
  const filePath = findPresetAvatarPath(fileParam);
  if (!filePath) {
    set.status = 404;
    return new Response("Not Found", { status: 404 });
  }
  const fileHandle = Bun.file(filePath);
  const hash = getPresetEtag(filePath);
  const mimeType = fileHandle.type || "image/png";
  const responseHeaders = avatarResponseHeaders(mimeType, hash);
  if (headers["if-none-match"] === responseHeaders.get("etag")) {
    set.status = 304;
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return new Response(fileHandle, { headers: responseHeaders });
}

export const avatarMediaPlugin = (app: Elysia) =>
  app
    .get(
      "/api/media/avatars/presets/:file",
      ({ params: { file }, headers, set }) => servePreset(file, headers, set),
      { params: t.Object({ file: t.String() }) },
    )
    .get(
      "/api/media/avatars/preset/:file",
      ({ params: { file }, headers, set }) => servePreset(file, headers, set),
      { params: t.Object({ file: t.String() }) },
    )
    .get(
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
