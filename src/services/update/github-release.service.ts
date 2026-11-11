import { CURRENT_VERSION, cleanVersionTag, isNewerVersion } from "../../version";
import { logger } from "../../logger";

export const DEFAULT_REPO = "SterTheStar/SaturnRouter";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface GitHubReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  contentType: string;
}

export interface GitHubReleaseInfo {
  id: number;
  tag: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
  htmlUrl: string;
  tarballUrl: string;
  zipballUrl: string;
  assets: GitHubReleaseAsset[];
}

export interface CheckUpdateResult {
  currentVersion: string;
  hasUpdate: boolean;
  latestRelease: GitHubReleaseInfo | null;
  releases: GitHubReleaseInfo[];
  checkedAt: string;
  repo: string;
}

interface CacheEntry {
  data: GitHubReleaseInfo[];
  timestamp: number;
  repo: string;
}

let releaseCache: CacheEntry | null = null;

export function getEffectiveRepo(overrideRepo?: string): string {
  const direct = overrideRepo?.trim();
  if (direct && direct.length > 0) return direct;
  const envRepo = process.env.SATURN_UPDATE_REPO?.trim();
  if (envRepo && envRepo.length > 0) return envRepo;
  return DEFAULT_REPO;
}

export function clearReleaseCache(): void {
  releaseCache = null;
}

/**
 * Fetches releases from GitHub API for a given repository.
 */
export async function fetchReleasesFromGitHub(
  repo = DEFAULT_REPO,
  force = false,
): Promise<GitHubReleaseInfo[]> {
  const now = Date.now();
  if (!force && releaseCache && releaseCache.repo === repo && now - releaseCache.timestamp < CACHE_TTL_MS) {
    return releaseCache.data;
  }

  const token = process.env.SATURN_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": `SaturnRouter/${CURRENT_VERSION}`,
  };

  if (token) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const url = `https://api.github.com/repos/${encodeURI(repo)}/releases?per_page=20`;

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) {
      logger.info(`No GitHub releases found or repository not accessible: ${repo}`);
      return [];
    }

    if (response.status === 403) {
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const remainingHeader = response.headers.get("x-ratelimit-remaining");
      if (remainingHeader === "0") {
        const resetDate = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString() : "soon";
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}.`);
      }
      throw new Error(`GitHub API access forbidden (HTTP 403).`);
    }

    if (!response.ok) {
      throw new Error(`GitHub API request failed with status ${response.status} (${response.statusText})`);
    }

    const json = (await response.json()) as any[];
    if (!Array.isArray(json)) return [];

    const parsed: GitHubReleaseInfo[] = json
      .filter((rel) => !rel.draft)
      .map((rel) => ({
        id: rel.id,
        tag: rel.tag_name || "",
        version: cleanVersionTag(rel.tag_name || ""),
        name: rel.name || rel.tag_name || "Release",
        body: rel.body || "",
        publishedAt: rel.published_at || new Date().toISOString(),
        prerelease: Boolean(rel.prerelease),
        draft: Boolean(rel.draft),
        htmlUrl: rel.html_url || "",
        tarballUrl: rel.tarball_url || "",
        zipballUrl: rel.zipball_url || "",
        assets: Array.isArray(rel.assets)
          ? rel.assets.map((asset: any) => ({
              name: asset.name,
              size: asset.size,
              downloadUrl: asset.browser_download_url,
              contentType: asset.content_type,
            }))
          : [],
      }));

    releaseCache = {
      data: parsed,
      timestamp: now,
      repo,
    };

    return parsed;
  } catch (error: any) {
    logger.warn(`Failed to fetch releases from GitHub for ${repo}: ${error?.message || error}`);
    throw error;
  }
}

/**
 * Checks for updates against GitHub releases.
 */
export async function checkForUpdates(options: {
  repo?: string;
  includePrereleases?: boolean;
  force?: boolean;
} = {}): Promise<CheckUpdateResult> {
  const repo = getEffectiveRepo(options.repo);
  const includePrereleases = Boolean(options.includePrereleases);
  const checkedAt = new Date().toISOString();

  let releases: GitHubReleaseInfo[] = [];
  try {
    releases = await fetchReleasesFromGitHub(repo, options.force);
  } catch (error: any) {
    return {
      currentVersion: CURRENT_VERSION,
      hasUpdate: false,
      latestRelease: null,
      releases: [],
      checkedAt,
      repo,
    };
  }

  // Filter releases according to preferences
  const candidateReleases = releases.filter((rel) => {
    if (!includePrereleases && rel.prerelease) return false;
    return true;
  });

  // Find the release with the highest version that is newer than current
  let latestRelease: GitHubReleaseInfo | null = null;

  for (const rel of candidateReleases) {
    if (isNewerVersion(CURRENT_VERSION, rel.version)) {
      if (!latestRelease || isNewerVersion(latestRelease.version, rel.version)) {
        latestRelease = rel;
      }
    }
  }

  return {
    currentVersion: CURRENT_VERSION,
    hasUpdate: Boolean(latestRelease),
    latestRelease,
    releases: candidateReleases,
    checkedAt,
    repo,
  };
}
