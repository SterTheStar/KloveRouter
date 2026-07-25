import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { config } from "./config";
import { getDb } from "./db/connection";
import {
  authPlugin,
  providersPlugin,
  modelsPlugin,
  keysPlugin,
  settingsPlugin,
  proxyPlugin,
} from "./api";

// Initialize database
getDb();

const app = new Elysia()
  .use(cors())
  .use(
    jwt({
      secret: config.jwtSecret,
      name: "jwt",
    })
  )
  // Public routes
  .use(authPlugin)
  .use(proxyPlugin);

// Protected routes (require JWT)
const protectedApp = new Elysia()
  .guard({
    async beforeHandle({ jwt, headers, set }) {
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
  .use(settingsPlugin);

app.use(protectedApp as any);

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

console.log(`🦊 Klove AI Router running on http://localhost:${config.port}`);
console.log(
  `📋 Panel: http://localhost:${config.port}`
);
console.log(`🔑 Default password: ${config.defaultPassword}`);
