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
  modelPoolsPlugin,
  keysPlugin,
  settingsPlugin,
  proxyPlugin,
  mediaProxyPlugin,
  embeddingsProxyPlugin,
  systemOneProxyPlugin,
  statsPlugin,
  codexPlugin,
  codexPublicPlugin,
  antigravityPublicPlugin,
  antigravityUsagePlugin,
  freebuffUsagePlugin,
  requestLogsPlugin,
  perchUsagePlugin,
  rtkPlugin,
  chatPlugin,
  chatControlPlugin,
  chatsPlugin,
  setupPlugin,
  avatarMediaPlugin,
  updatesPlugin,
} from "./api";
import { getSecuritySecrets } from "./services/security.service";
import { insecureUrlsAllowed } from "./services/ssrf";
import { initRtkOnStartup, rtkPublicPlugin } from "./plugins/rtk";
import { cavemanPublicPlugin, cavemanPlugin } from "./plugins/caveman";
import { guardrailsPlugin } from "./plugins/guardrails";
import { customSkillsPlugin } from "./plugins/custom-skills";
import { refreshLiteLLMPricing } from "./services/litellm-pricing";
import { initUpdateCheckOnStartup } from "./services/update";
import { printStartupBanner } from "./services/startup-banner";
import { CURRENT_VERSION } from "./version";

// Initialize database and resolve effective security secrets.
const db = getDb();
const { jwtSecret } = getSecuritySecrets(db);

// The public LiteLLM catalog needs no credentials. Refresh in the background so
// startup and proxy traffic do not depend on GitHub availability.
void refreshLiteLLMPricing();
const pricingRefreshTimer = setInterval(() => void refreshLiteLLMPricing(), 6 * 60 * 60 * 1000);
pricingRefreshTimer.unref?.();

// Auto-start RTK if enabled in settings
initRtkOnStartup();

// Auto-check updates in background if enabled
initUpdateCheckOnStartup();

const app = new Elysia()
  .onRequest(requestHooks.onRequest)
  .onBeforeHandle(({ request, set }) => {
    const pathname = new URL(request.url).pathname;
    if (
      /(^|\/)\.(?:env(?:\..*)?|git)(?:\/|$)/i.test(pathname) ||
      /(^|\/)data(?:\/|$)/i.test(pathname) ||
      /\.(?:db|sqlite|sqlite3|db-wal|db-shm)$/i.test(pathname)
    ) {
      set.status = 404;
      return new Response("Not Found", { status: 404 });
    }
  })
  .onAfterHandle(requestHooks.onAfterHandle)
  .onError(requestHooks.onError)
  .use(cors())
  .get("/api", () => ({
    name: "SaturnRouter API",
    status: "ok",
  }))
  .use(
    jwt({
      secret: jwtSecret,
      name: "jwt",
    }),
  )
  // Public routes
  .use(setupPlugin)
  .use(authPlugin)
  .use(codexPublicPlugin)
  .use(antigravityPublicPlugin)
  .use(avatarMediaPlugin)
  .use(proxyPlugin);
app.use(mediaProxyPlugin);
app.use(embeddingsProxyPlugin);
app.use(systemOneProxyPlugin);

// RTK public routes
app.use(rtkPublicPlugin);

// Caveman public routes
app.use(cavemanPublicPlugin);

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
  .use(modelPoolsPlugin)
  .use(keysPlugin)
  .use(settingsPlugin)
  .use(statsPlugin)
  .use(requestLogsPlugin)
  .use(antigravityUsagePlugin)
  .use(freebuffUsagePlugin)
  .use(perchUsagePlugin)
  .use(codexPlugin)
  .use(rtkPlugin)
  .use(cavemanPlugin)
  .use(customSkillsPlugin)
  .use(guardrailsPlugin)
  .use(chatsPlugin)
  .use(chatControlPlugin)
  .use(chatPlugin)
  .use(updatesPlugin);

app.use(protectedApp as any);

// OAuth callback listener is reachable on all network interfaces.
new Elysia()
  .use(codexPublicPlugin)
  .use(antigravityPublicPlugin)
  .listen({ port: 1455, hostname: "0.0.0.0" });

// Serve frontend in production
if (!config.isDev) {
  // First try static files
  app.use(
    staticPlugin({
      assets: "./web/dist",
      prefix: "/",
    }),
  );

  // Catch-all: serve index.html for SPA routing
  const indexPath = Bun.file("./web/dist/index.html");
  if (await indexPath.exists()) {
    app.get(
      "/*",
      () =>
        new Response(indexPath, {
          headers: { "Content-Type": "text/html" },
        }),
    );
  }
}

app.listen({ port: config.port, hostname: "0.0.0.0", idleTimeout: 255 });

printStartupBanner({
  port: config.port,
  version: CURRENT_VERSION,
  oauthPort: 1455,
});

logger.success(`Server running on http://0.0.0.0:${config.port}`);

if (insecureUrlsAllowed()) {
  logger.warn(
    "ALLOW_INSECURE_URLS is enabled — SSRF protection is disabled. HTTP and localhost/private URLs are accepted. Only use this on trusted networks.",
  );
}
