import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetVersion = process.argv[2]?.trim().replace(/^v/i, "");

if (!targetVersion) {
  console.error("Usage: bun run version:bump <new-version>");
  console.error("Example: bun run version:bump 0.2.0-beta");
  process.exit(1);
}

// Basic SemVer pattern check
if (!/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.test(targetVersion)) {
  console.error(`Invalid semver format: "${targetVersion}". Expected e.g. 0.2.0 or 0.2.0-beta`);
  process.exit(1);
}

const rootPkgPath = resolve(import.meta.dir, "../package.json");
const webPkgPath = resolve(import.meta.dir, "../web/package.json");

try {
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
  const prevVersion = rootPkg.version;
  rootPkg.version = targetVersion;
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf-8");

  const webPkg = JSON.parse(readFileSync(webPkgPath, "utf-8"));
  webPkg.version = targetVersion;
  writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + "\n", "utf-8");

  console.log(`\x1b[32m✔ Version bumped successfully: v${prevVersion} → v${targetVersion}\x1b[0m`);
  console.log(`Synchronized across root package.json and web/package.json.`);
} catch (err: any) {
  console.error("Failed to bump version:", err.message);
  process.exit(1);
}
