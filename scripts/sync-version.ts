import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootPkgPath = resolve(import.meta.dir, "../package.json");
const webPkgPath = resolve(import.meta.dir, "../web/package.json");

try {
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
  const version = rootPkg.version;

  if (!version) {
    console.error("[sync-version] No version found in root package.json");
    process.exit(1);
  }

  const webPkg = JSON.parse(readFileSync(webPkgPath, "utf-8"));

  if (webPkg.version !== version) {
    webPkg.version = version;
    writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + "\n", "utf-8");
    console.log(`[sync-version] Synchronized web/package.json to v${version}`);
  }
} catch (err: any) {
  console.error("[sync-version] Error syncing version:", err.message);
  process.exit(1);
}
