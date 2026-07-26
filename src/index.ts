import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { config } from "./config";
import { getDb } from "./db/connection";
import { logger, requestHooks } from "./logger";
import {
  authPlugin,
  providersPlugin,
  modelsPlugin,
  keysPlugin,
  settingsPlugin,
  proxyPlugin,
  statsPlugin,
  codexPlugin,
  codexPublicPlugin,
  antigravityPublicPlugin,
  antigravityUsagePlugin,
} from "./api";

// Initialize database
getDb();

const app = new Elysia()
  .onRequest(requestHooks.onRequest)
  .onAfterHandle(requestHooks.onAfterHandle)
  .onError(requestHooks.onError)
  .use(cors())
  .get("/api", () => ({
    name: "KloveRouter API",
    status: "ok",
  }))
  .use(
    jwt({
      secret: config.jwtSecret,
      name: "jwt",
    })
  )
  // Public routes
  .use(authPlugin)
  .use(codexPublicPlugin)
  .use(antigravityPublicPlugin)
  .use(antigravityUsagePlugin)
  .use(proxyPlugin);

// Protected routes (require JWT)
const protectedApp = new Elysia()
  .guard({
    async beforeHandle({ jwt, headers, set }: any) {
      const auth = headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) {
        set.status = 401;
        return { error: "Unauthorized", message: "Missing or invalid token" };
      }
      const payload = await jwt.verify(auth.slice(7));
      if (!payload) {
        set.status = 401;
        return {
          error: "Unauthorized",
          message: "Invalid or expired token",
        };
      }
    },
  })
  .use(providersPlugin)
  .use(modelsPlugin)
  .use(keysPlugin)
  .use(settingsPlugin)
  .use(statsPlugin)
  .use(codexPlugin);

app.use(protectedApp as any);

// Codex OAuth requires the fixed localhost callback registered by Codex.
new Elysia().use(codexPublicPlugin).use(antigravityPublicPlugin).listen(1455);

// Serve frontend in production
if (!config.isDev) {
  // First try static files
  app.use(
    staticPlugin({
      assets: "./web/dist",
      prefix: "/",
    })
  );

  // Catch-all: serve index.html for SPA routing
  const indexPath = Bun.file("./web/dist/index.html");
  if (await indexPath.exists()) {
    app.get("/*", () => new Response(indexPath, {
      headers: { "Content-Type": "text/html" },
    }));
  }
}

app.listen(config.port);

const b = "\x1b[1m", r = "\x1b[0m";
const blue = "\x1b[38;2;91;206;250m", pink = "\x1b[38;2;245;169;184m", white = "\x1b[97m", dim = "\x1b[2m";
const green = "\x1b[38;2;80;200;120m", cyan = "\x1b[38;2;0;200;200m", yellow = "\x1b[38;2;255;200;50m";
const bgBlue = "\x1b[48;2;91;206;250m", bgGreen = "\x1b[48;2;80;200;120m";

function badge(text: string, color: string) {
  return `${color}${white}${b} ${text} ${r}`;
}

const ascii = `
${b}${blue}     __ __ __${r}
${b}${pink}    / //_// /___ _   _____${r}
${b}${white}   / ,<  / / __ \\ | / / _ \\${r}
${b}${pink}  / /| |/ / /_/ / |/ /  __/${r}
${b}${blue} /_/ |_/_/\\____/|___/\\___/${r}
`;
const version = "1.0.0";

logger.badge("KLOVE", `v${version} · https://github.com/SterTheStar/KloveRouter`);
logger.success("Server running", { panel: `http://localhost:${config.port}`, api: `http://localhost:${config.port}/api` });
logger.info("Codex callback listener", { address: "http://localhost:1455/auth/callback" });
