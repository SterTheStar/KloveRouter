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

console.log(ascii);
console.log(`     ${b}${white}Klove${r} ${dim}v${version}${r} ${dim}by Esther${r}`);
console.log(`     ${dim}https://github.com/SterTheStar/KloveRouter${r}`);
console.log();
console.log(`     ${badge("UP", bgGreen)} ${green}${b}Server running${r}`);
console.log(`     ${badge("WEB", bgBlue)} ${cyan}${b}Panel${r}     http://localhost:${config.port}`);
console.log(`     ${badge("API", bgBlue)} ${yellow}${b}API${r}      http://localhost:${config.port}/api`);
console.log();
