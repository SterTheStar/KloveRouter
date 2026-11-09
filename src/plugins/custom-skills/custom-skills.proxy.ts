import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";
import type { CustomSkill, MarketplaceSkill, MarketplaceResponse } from "./custom-skills.types";
import { BUNDLED_MARKETPLACE_SKILLS } from "./marketplace.catalog";

const SKILLS_DIR = join(config.dataDir, "custom-skills");
const MARKETPLACE_DIR = join(config.dataDir, "marketplace-skills");
const CATALOG_CACHE_FILE = join(config.dataDir, "marketplace-catalog.json");

function skillsDir(): string {
  return SKILLS_DIR;
}

function skillFilePath(id: string): string {
  return join(skillsDir(), `${id}.md`);
}

function indexFilePath(): string {
  return join(skillsDir(), "index.json");
}

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

async function readIndex(): Promise<CustomSkill[]> {
  try {
    const data = await readFile(indexFilePath(), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(skills: CustomSkill[]): Promise<void> {
  const dir = skillsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(indexFilePath(), JSON.stringify(skills, null, 2));
}

let cachedCatalog: MarketplaceSkill[] | null = null;
let lastCatalogFetch = 0;
const CATALOG_TTL_MS = 1000 * 60 * 60; // 1 hour

function normalizeCategory(cat: unknown): string {
  if (Array.isArray(cat)) return cat.map(String).join(", ");
  if (typeof cat === "string" && cat.trim()) return cat.trim();
  return "General";
}

function normalizeTags(item: any, catStr: string): string[] {
  if (Array.isArray(item.tags)) return item.tags.map(String);
  if (Array.isArray(item.category)) {
    return item.category
      .map((c: unknown) => String(c).toLowerCase().replace(/[^a-z0-9]+/g, "-"))
      .filter(Boolean);
  }
  if (catStr && catStr !== "General") {
    return [catStr.toLowerCase().replace(/[^a-z0-9]+/g, "-")];
  }
  return [];
}

function mergeWithBundled(remoteSkills: MarketplaceSkill[]): MarketplaceSkill[] {
  const map = new Map<string, MarketplaceSkill>();
  for (const b of BUNDLED_MARKETPLACE_SKILLS) {
    map.set(b.slug, b);
  }
  for (const r of remoteSkills) {
    if (!map.has(r.slug)) {
      map.set(r.slug, r);
    }
  }
  return Array.from(map.values());
}

async function loadDiskCachedCatalog(): Promise<MarketplaceSkill[] | null> {
  try {
    if (existsSync(CATALOG_CACHE_FILE)) {
      const raw = await readFile(CATALOG_CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeWithBundled(parsed);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchRemoteOrBundledCatalog(): Promise<MarketplaceSkill[]> {
  const nowMs = Date.now();
  if (cachedCatalog && nowMs - lastCatalogFetch < CATALOG_TTL_MS) {
    return cachedCatalog;
  }

  // 1. Try disk cache if fresh enough
  if (!cachedCatalog) {
    const fromDisk = await loadDiskCachedCatalog();
    if (fromDisk && fromDisk.length > 0) {
      cachedCatalog = fromDisk;
      lastCatalogFetch = nowMs;
    }
  }

  // 2. Fetch fresh catalog from GitHub in real time
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/agentskillexchange/skills/main/skills.json",
      {
        headers: { "User-Agent": "KloveRouter" },
        signal: controller.signal,
      },
    );

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data.skills || [];

      if (rawList.length > 0) {
        const mapped: MarketplaceSkill[] = rawList.map((item: any) => {
          const category = normalizeCategory(item.category);
          const slug = String(item.slug || item.id || "");
          const name = String(item.name || item.title || slug);
          return {
            slug,
            name,
            title: String(item.title || name),
            description: String(item.description || ""),
            category,
            framework: String(item.framework || "Multi-Framework"),
            verification: String(item.verification || "listed"),
            source_url:
              item.source_url ||
              item.source ||
              `https://github.com/agentskillexchange/skills/tree/main/skills/${slug}`,
            author: String(item.author || "AgentSkillExchange"),
            tags: normalizeTags(item, category),
            version: String(item.version || "1.0.0"),
          };
        });

        const merged = mergeWithBundled(mapped);
        cachedCatalog = merged;
        lastCatalogFetch = nowMs;

        // Persist to disk cache
        try {
          if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
          await writeFile(CATALOG_CACHE_FILE, JSON.stringify(mapped));
        } catch {
          // ignore
        }

        logger.info(`Loaded ${merged.length} skills from Agent Skill Exchange marketplace`);
        return cachedCatalog;
      }
    }
  } catch (err: any) {
    logger.warn(`Could not refresh marketplace catalog: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  // 3. Fallback to cached or bundled
  if (cachedCatalog && cachedCatalog.length > 0) {
    return cachedCatalog;
  }

  return BUNDLED_MARKETPLACE_SKILLS;
}

export const customSkillsProxy = {
  async list(): Promise<CustomSkill[]> {
    return readIndex();
  },

  async get(id: string): Promise<CustomSkill | null> {
    const skills = await readIndex();
    const skill = skills.find((s) => s.id === id);
    if (!skill) return null;

    try {
      const content = await readFile(skillFilePath(id), "utf-8");
      return { ...skill, content };
    } catch {
      return { ...skill, content: "" };
    }
  },

  async create(
    name: string,
    content: string,
    extra?: {
      description?: string;
      category?: string;
      slug?: string;
      source?: "custom" | "marketplace";
      author?: string;
    },
  ): Promise<CustomSkill> {
    const id = generateId();
    const timestamp = now();
    const skill: CustomSkill = {
      id,
      name,
      content,
      description: extra?.description,
      category: extra?.category || "Custom",
      slug: extra?.slug,
      source: extra?.source || "custom",
      author: extra?.author || "User",
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const dir = skillsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    await writeFile(skillFilePath(id), content);

    const skills = await readIndex();
    skills.push({ ...skill, content: "" });
    await writeIndex(skills);

    logger.info(`Custom skill created: ${name} (${id})`);
    return skill;
  },

  async update(
    id: string,
    data: {
      name?: string;
      content?: string;
      description?: string;
      category?: string;
      is_active?: boolean;
    },
  ): Promise<CustomSkill | null> {
    const skills = await readIndex();
    const idx = skills.findIndex((s) => s.id === id);
    if (idx === -1) return null;

    const skill = skills[idx];

    if (data.name !== undefined) skill.name = data.name;
    if (data.description !== undefined) skill.description = data.description;
    if (data.category !== undefined) skill.category = data.category;
    if (data.is_active !== undefined) skill.is_active = data.is_active;
    skill.updated_at = now();

    if (data.content !== undefined) {
      await writeFile(skillFilePath(id), data.content);
      skill.content = "";
    }

    skills[idx] = skill;
    await writeIndex(skills);

    const result = await this.get(id);
    return result;
  },

  async remove(id: string): Promise<boolean> {
    const skills = await readIndex();
    const idx = skills.findIndex((s) => s.id === id);
    if (idx === -1) return false;

    skills.splice(idx, 1);
    await writeIndex(skills);

    const path = skillFilePath(id);
    if (existsSync(path)) await rm(path);

    logger.info(`Custom skill removed: ${id}`);
    return true;
  },

  async getActiveSkills(): Promise<CustomSkill[]> {
    const skills = await readIndex();
    const active = skills.filter((s) => s.is_active);

    const result: CustomSkill[] = [];
    for (const skill of active) {
      try {
        const content = await readFile(skillFilePath(skill.id), "utf-8");
        result.push({ ...skill, content });
      } catch {
        result.push({ ...skill, content: "" });
      }
    }

    return result;
  },

  /**
   * Fetches the real Markdown instructions for a marketplace skill on demand (lazy loading).
   */
  async getMarketplaceSkillContent(slug: string): Promise<string> {
    const cachePath = join(MARKETPLACE_DIR, `${slug}.md`);

    // 1. Check local cache
    if (existsSync(cachePath)) {
      try {
        const cached = await readFile(cachePath, "utf-8");
        if (cached && cached.trim()) return cached;
      } catch {
        // ignore
      }
    }

    // 2. Fetch live SKILL.md from GitHub
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/agentskillexchange/skills/main/skills/${encodeURIComponent(slug)}/SKILL.md`,
        {
          headers: { "User-Agent": "KloveRouter" },
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) {
          if (!existsSync(MARKETPLACE_DIR)) mkdirSync(MARKETPLACE_DIR, { recursive: true });
          await writeFile(cachePath, text);
          return text;
        }
      }
    } catch (e: any) {
      logger.warn(`Could not fetch live SKILL.md for ${slug}: ${e.message}`);
    } finally {
      clearTimeout(timeout);
    }

    // 3. Check bundled skills
    const bundled = BUNDLED_MARKETPLACE_SKILLS.find((s) => s.slug === slug);
    if (bundled?.content) {
      return bundled.content;
    }

    // 4. Fallback generated markdown
    const catalog = await fetchRemoteOrBundledCatalog();
    const meta = catalog.find((s) => s.slug === slug);
    return `# ${meta?.name || slug}\n\n${meta?.description || "No documentation provided."}\n\n## Instructions\n\nWhen assisting with tasks related to ${meta?.name || slug}, follow standard engineering practices.`;
  },

  /**
   * Returns a single marketplace skill with its full content resolved.
   */
  async getMarketplaceSkill(slug: string): Promise<MarketplaceSkill | null> {
    const catalog = await fetchRemoteOrBundledCatalog();
    const meta = catalog.find((s) => s.slug === slug);
    if (!meta) return null;

    const content = await this.getMarketplaceSkillContent(slug);
    const installed = await readIndex();
    const match = installed.find((inst) => inst.slug === slug);

    return {
      ...meta,
      content,
      is_installed: Boolean(match),
      installed_id: match?.id,
      is_active: match ? match.is_active : false,
    };
  },

  /**
   * Paginated and filtered marketplace catalog with lazy loading.
   */
  async listMarketplace(options?: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<MarketplaceResponse> {
    const catalog = await fetchRemoteOrBundledCatalog();
    const installed = await readIndex();

    // Extract unique categories
    const categorySet = new Set<string>();
    for (const item of catalog) {
      if (item.category) {
        const parts = item.category.split(",").map((c) => c.trim()).filter(Boolean);
        for (const p of parts) categorySet.add(p);
      }
    }
    const categories = Array.from(categorySet).sort();

    // Filter
    let filtered = catalog;

    if (options?.category && options.category !== "All") {
      const cat = options.category.toLowerCase();
      filtered = filtered.filter((s) => s.category.toLowerCase().includes(cat));
    }

    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      const terms = q.split(/\s+/).filter(Boolean);
      if (terms.length > 0) {
        filtered = filtered.filter((s) => {
          const searchable = [
            s.name,
            s.title,
            s.slug,
            s.description,
            s.category,
            s.framework,
            s.author,
            ...(Array.isArray(s.tags) ? s.tags : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return terms.every((t) => searchable.includes(t));
        });
      }
    }

    const total = filtered.length;
    const page = Math.max(1, options?.page || 1);
    const limit = options?.limit ? Math.min(100, Math.max(1, options.limit)) : 36;
    const startIndex = (page - 1) * limit;
    const pageItems = filtered.slice(startIndex, startIndex + limit);

    const skills = pageItems.map((item) => {
      const match = installed.find(
        (inst) => inst.slug === item.slug || inst.name.toLowerCase() === item.name.toLowerCase(),
      );

      return {
        ...item,
        is_installed: Boolean(match),
        installed_id: match?.id,
        is_active: match ? match.is_active : false,
      };
    });

    return {
      total,
      categories,
      skills,
    };
  },

  async installMarketplaceSkill(slug: string): Promise<CustomSkill> {
    const catalog = await fetchRemoteOrBundledCatalog();
    const item = catalog.find((s) => s.slug === slug);
    if (!item) {
      throw new Error(`Marketplace skill '${slug}' not found in catalog`);
    }

    const installed = await readIndex();
    const existing = installed.find((inst) => inst.slug === slug);
    if (existing) {
      const full = await this.get(existing.id);
      return full || existing;
    }

    // Lazy load the real content
    const content = await this.getMarketplaceSkillContent(slug);

    const created = await this.create(item.name, content, {
      description: item.description,
      category: item.category,
      slug: item.slug,
      source: "marketplace",
      author: item.author,
    });

    logger.info(`Installed marketplace skill: ${item.name} (${slug})`);
    return created;
  },

  async uninstallMarketplaceSkill(slug: string): Promise<boolean> {
    const installed = await readIndex();
    const match = installed.find((inst) => inst.slug === slug);
    if (!match) return false;

    return this.remove(match.id);
  },

  async injectSkills(messages: any[]): Promise<any[]> {
    const active = await this.getActiveSkills();
    if (active.length === 0) {
      logger.debug("No active custom skills to inject");
      return messages;
    }

    const names = active.map((s) => s.name).join(", ");
    logger.info(`Custom skills injecting: ${names}`);

    const combined = active
      .map((s) => `## ${s.name}\n\n${s.content}`)
      .join("\n\n---\n\n");

    const systemIndex = messages.findIndex(
      (m: any) => m.role === "system" || m.role === "developer",
    );

    if (systemIndex >= 0) {
      const updated = [...messages];
      updated[systemIndex] = {
        ...updated[systemIndex],
        content: `${updated[systemIndex].content}\n\n${combined}`,
      };
      return updated;
    }

    return [{ role: "system", content: combined }, ...messages];
  },
};
