import { existsSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
process.chdir(root);

const distIndex = join(root, "web", "dist", "index.html");
const distExists = existsSync(distIndex);
const forceBuild = process.argv.includes("--build") || process.env.FORCE_BUILD === "1";

if (!distExists || forceBuild) {
  console.log("No frontend build found. Building web client...");
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: `${root}/web`,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const buildExitCode = await build.exited;
  if (buildExitCode !== 0) {
    console.error(`Frontend build failed with exit code ${buildExitCode}`);
    process.exit(buildExitCode);
  }
}

process.env.NODE_ENV = "production";
await import("./src/index");
