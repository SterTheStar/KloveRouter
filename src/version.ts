import packageJson from "../package.json";

export const CURRENT_VERSION: string = packageJson.version || "1.0.0";

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

/**
 * Strips leading 'v' or 'V' or whitespace.
 */
export function cleanVersionTag(tag: string): string {
  if (!tag) return "0.0.0";
  return tag.trim().replace(/^v/i, "").trim();
}

/**
 * Parses a semantic version string (e.g., "1.2.3", "v2.0.1-beta.2").
 */
export function parseSemver(version: string): ParsedSemver | null {
  const cleaned = cleanVersionTag(version);
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(cleaned);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
    prerelease: match[4] || null,
  };
}

/**
 * Compares two semver strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1 && !p2) return 0;
  if (!p1) return -1;
  if (!p2) return 1;

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // A version with no prerelease is higher than one with a prerelease (e.g. 1.0.0 > 1.0.0-rc1)
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;

  if (p1.prerelease && p2.prerelease) {
    if (p1.prerelease === p2.prerelease) return 0;
    return p1.prerelease.localeCompare(p2.prerelease, undefined, { numeric: true });
  }

  return 0;
}

/**
 * Returns true if candidateVersion is newer than currentVersion.
 */
export function isNewerVersion(currentVersion: string, candidateVersion: string): boolean {
  return compareSemver(candidateVersion, currentVersion) > 0;
}
