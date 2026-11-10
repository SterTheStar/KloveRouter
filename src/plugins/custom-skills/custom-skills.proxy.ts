import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";
import type { CustomSkill, MarketplaceSkill, MarketplaceResponse, DesignSkill } from "./custom-skills.types";
import { BUNDLED_MARKETPLACE_SKILLS } from "./marketplace.catalog";
import { AWESOME_DESIGN_SKILLS } from "./design-skills.catalog";

const SKILLS_DIR = join(config.dataDir, "custom-skills");
const MARKETPLACE_DIR = join(config.dataDir, "marketplace-skills");
const CATALOG_CACHE_FILE = join(config.dataDir, "marketplace-catalog.json");
const DESIGN_CATALOG_CACHE_FILE = join(config.dataDir, "design-catalog.json");

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

function isDesignSkill(skill: { category?: string; source?: string }): boolean {
  return skill.category === "UI Design" || skill.source === "design";
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
        headers: { "User-Agent": "SaturnRouter" },
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

let cachedDesignCatalog: DesignSkill[] | null = null;
let lastDesignCatalogFetch = 0;

function parseReadmeImages(readmeText: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!readmeText) return map;
  const regex =
    /<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']|<img[^>]+alt=["']([^"']+)["'][^>]*src=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(readmeText)) !== null) {
    const src = match[1] || match[4];
    if (src && src.includes("registry-examples")) {
      const filename = src.split("/").pop() || "";
      const slug = filename.replace(/-marketing\.(png|jpg|jpeg|webp)/, "").toLowerCase();
      if (slug) {
        map[slug] = `https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/${filename}`;
      }
    }
  }
  return map;
}

const DESIGN_IMAGE_ALIASES: Record<string, string> = {
  cyberpunk: "neon",
  terminal: "matrix",
  skeuomorphic: "skeumorphism",
  "cyberpunk-neon-hud": "neon",
  "cli-hacker-terminal": "matrix",
  "modern-skeuomorphism": "skeumorphism",
  "paper-editorial": "paper",
  "modern-bento-grid": "bento",
  "corporate-enterprise": "corporate",
  "minimalist-stark": "minimal",
  "material-design-3": "material",
  "retro-8-bit-dithered": "dithered",
  "playful-doodle": "doodle",
};

function resolveDesignImageUrl(
  slug: string,
  name: string = "",
  readmeImages: Record<string, string> = {},
): string {
  const s = slug.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-");
  const baseSlug = s.replace(/^skills\//, "");
  const normSlug = baseSlug.replace(/[^a-z0-9]/g, "");
  const normName = name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  // 1. Direct match on base slug
  if (readmeImages[baseSlug]) return readmeImages[baseSlug];

  // 2. Direct alias match
  const aliasKey = DESIGN_IMAGE_ALIASES[baseSlug] || DESIGN_IMAGE_ALIASES[s];
  if (aliasKey && readmeImages[aliasKey]) return readmeImages[aliasKey];

  // 3. Normalized slug / name match
  for (const [key, url] of Object.entries(readmeImages)) {
    const normKey = key.replace(/[^a-z0-9]/g, "");
    if (normKey === normSlug || normKey === normName) return url;
  }

  // 4. Word-level substring match (e.g. for multi-word names like "Modern Skeuomorphism")
  for (const [key, url] of Object.entries(readmeImages)) {
    const normKey = key.replace(/[^a-z0-9]/g, "");
    if (normKey.length >= 4 && (normName.includes(normKey) || normSlug.includes(normKey))) {
      return url;
    }
  }

  // 5. Conventional fallback based on the primary identifier
  const cleanFilename = baseSlug.split(/[\s_-]/)[0] || baseSlug;
  return (
    readmeImages[cleanFilename] ||
    `https://raw.githubusercontent.com/bergside/awesome-design-skills/main/registry-examples/${cleanFilename}-marketing.png`
  );
}

function mergeWithBundledDesigns(
  remoteDesigns: DesignSkill[],
  readmeImages: Record<string, string> = {},
): DesignSkill[] {
  const map = new Map<string, DesignSkill>();
  for (const b of AWESOME_DESIGN_SKILLS) {
    map.set(b.slug, {
      ...b,
      image_url:
        b.image_url ||
        resolveDesignImageUrl(b.slug, b.name, readmeImages),
    });
  }
  for (const r of remoteDesigns) {
    if (!map.has(r.slug)) {
      map.set(r.slug, {
        ...r,
        image_url:
          r.image_url ||
          resolveDesignImageUrl(r.slug, r.name, readmeImages),
      });
    }
  }
  return Array.from(map.values());
}

async function loadDiskCachedDesignCatalog(): Promise<DesignSkill[] | null> {
  try {
    if (existsSync(DESIGN_CATALOG_CACHE_FILE)) {
      const raw = await readFile(DESIGN_CATALOG_CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeWithBundledDesigns(parsed);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function parseRemoteDesign(
  slug: string,
  indexItem: { name?: string; skillPath?: string; designPath?: string },
  text: string,
  imageUrl?: string,
): DesignSkill {
  let name = indexItem.name || slug.charAt(0).toUpperCase() + slug.slice(1);
  let subtitle = "Curated design system from awesome-design-skills";
  let description = "";
  let aesthetic = "Modern";
  const colors: Record<string, string> = {
    primary: "#3B82F6",
    surface: "#FFFFFF",
    neutral: "#FFFFFF",
    text: "#111827",
    secondary: "#8B5CF6",
    border: "#E2E8F0",
  };
  let fontFamily = "Inter, -apple-system, sans-serif";
  let borderRadius = "8px";
  let spacing = "16px";

  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const lines = fmMatch[1].split(/\r?\n/);
    let section = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (line.match(/^[a-zA-Z0-9_-]+:/)) {
        const colonIdx = line.indexOf(":");
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        section = key;
        if (key === "name" && val) name = val.replace(/^["']|["']$/g, "");
        if (key === "description" && val) description = val.replace(/^["']|["']$/g, "");
      } else if (line.startsWith("  ") || line.startsWith("\t")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > -1) {
          const k = line.slice(0, colonIdx).trim();
          const v = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (section === "colors") colors[k] = v;
          if (section === "typography" && k === "fontFamily") fontFamily = v;
          if (section === "rounded" && (k === "md" || k === "sm")) borderRadius = v;
          if (section === "spacing" && k === "md") spacing = v;
        }
      }
    }
  }

  const body = text.replace(/^---[\s\S]*?---\r?\n*/, "");
  const overviewMatch = body.match(/## Overview\s*\r?\n\r?\n([\s\S]*?)(?=\r?\n##|$)/);
  if (overviewMatch) {
    const ov = overviewMatch[1].trim();
    if (ov) {
      description = ov;
      subtitle = ov.split(".")[0] + ".";
    }
  }

  const styleMatch = body.match(/-\s*\*\*Visual style:\*\*\s*([^\r\n]+)/i);
  if (styleMatch) {
    const rawAes = styleMatch[1].trim().split(",")[0].trim();
    if (rawAes) {
      aesthetic = rawAes.charAt(0).toUpperCase() + rawAes.slice(1);
    }
  }

  return {
    slug,
    name,
    subtitle,
    description: description || subtitle,
    category: "UI Design",
    aesthetic,
    author: "bergside/awesome-design-skills",
    version: "1.0.0",
    source_url: `https://github.com/bergside/awesome-design-skills/tree/main/skills/${slug}`,
    image_url: imageUrl || resolveDesignImageUrl(slug, name, {}),
    palette: {
      primary: colors.primary || "#3B82F6",
      background: colors.neutral || colors.surface || "#FFFFFF",
      surface: colors.surface || colors.neutral || "#FFFFFF",
      text: colors.text || "#111827",
      accent: colors.secondary || colors.primary || "#8B5CF6",
      border: colors.border || (colors.secondary && colors.secondary !== colors.surface ? colors.secondary : "#E2E8F0"),
    },
    tokens: {
      fontFamily,
      borderRadius,
      spacing,
      shadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      borderWidth: "1px solid",
    },
    rules: [
      `Enforce the ${name} visual language and ${aesthetic} aesthetic`,
      `Strictly apply ${name} color tokens: Primary (${colors.primary || "#3B82F6"}), Surface (${colors.surface || "#FFFFFF"}), Accent (${colors.secondary || "#8B5CF6"})`,
      `Typography style: ${fontFamily} with systematic font hierarchy`,
      "Ensure WCAG 2.2 AA accessibility and contrast standards at all times",
      "Structure layouts with consistent responsive spacing grid and explicit interaction states",
    ],
    content: `# Design System: ${name} (${slug})

## Overview
${description || subtitle}

## Visual Direction & Aesthetic
You are an expert Frontend Architect enforcing the **${name}** design system (${aesthetic} aesthetic) from awesome-design-skills. All UI components, interfaces, and layouts you output must adhere to this system with high consistency and craft.

## Design Foundations & Tokens
- **Palette**:
  - Primary: ${colors.primary || "#3B82F6"}
  - Accent / Secondary: ${colors.secondary || "#8B5CF6"}
  - Surface: ${colors.surface || "#FFFFFF"}
  - Text / Ink: ${colors.text || "#111827"}
  - Border: ${colors.border || (colors.secondary && colors.secondary !== colors.surface ? colors.secondary : "#E2E8F0")}
- **Typography**:
  - Font Stack: ${fontFamily}
- **Borders & Radius**:
  - Border Radius: ${borderRadius}
  - Border Width: 1px solid
- **Spacing Grid**:
  - Base Spacing: ${spacing}

## Core Rules & Guidelines
- Enforce the ${name} visual hierarchy and accessible contrast (WCAG 2.2 AA).
- Maintain consistent spacing, alignment, and responsiveness across mobile, tablet, and desktop.
- Keep interactive states (hover, focus-visible, active, disabled) explicit and tactile.
- Always use the defined design tokens rather than arbitrary raw hex codes or arbitrary spacing values.`,
  };
}

async function fetchRemoteOrBundledDesignCatalog(force = false): Promise<DesignSkill[]> {
  const nowMs = Date.now();
  if (!force && cachedDesignCatalog && nowMs - lastDesignCatalogFetch < CATALOG_TTL_MS) {
    return cachedDesignCatalog;
  }

  if (!force && !cachedDesignCatalog) {
    const fromDisk = await loadDiskCachedDesignCatalog();
    if (fromDisk && fromDisk.length > 0) {
      cachedDesignCatalog = fromDisk;
      lastDesignCatalogFetch = nowMs;
    }
  }

  if (!force && cachedDesignCatalog && cachedDesignCatalog.length > AWESOME_DESIGN_SKILLS.length) {
    return cachedDesignCatalog;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const [res, readmeRes] = await Promise.all([
      fetch(
        "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/skills/index.json",
        {
          headers: { "User-Agent": "SaturnRouter" },
          signal: controller.signal,
        },
      ),
      fetch(
        "https://raw.githubusercontent.com/bergside/awesome-design-skills/main/README.md",
        {
          headers: { "User-Agent": "SaturnRouter" },
          signal: controller.signal,
        },
      ).catch(() => null),
    ]);

    let readmeImages: Record<string, string> = {};
    if (readmeRes && readmeRes.ok) {
      try {
        const readmeText = await readmeRes.text();
        readmeImages = parseReadmeImages(readmeText);
      } catch {
        // ignore
      }
    }

    if (res.ok) {
      const indexMap = await res.json();
      const entries = Object.entries(indexMap || {});

      if (entries.length > 0) {
        const bundledSlugs = new Set(AWESOME_DESIGN_SKILLS.map((b) => b.slug));
        const remoteEntries = entries.filter(([slug]) => !bundledSlugs.has(slug));

        const fetchedDesigns: DesignSkill[] = [];
        const concurrency = 12;
        let cursor = 0;

        async function worker() {
          while (cursor < remoteEntries.length) {
            const current = remoteEntries[cursor++];
            if (!current) break;
            const [slug, item] = current as [string, any];
            const img = resolveDesignImageUrl(slug, item?.name || slug, readmeImages);
            try {
              const dRes = await fetch(
                `https://raw.githubusercontent.com/bergside/awesome-design-skills/main/skills/${encodeURIComponent(slug)}/DESIGN.md`,
                {
                  headers: { "User-Agent": "SaturnRouter" },
                  signal: controller.signal,
                },
              );
              const text = dRes.ok ? await dRes.text() : "";
              const parsed = parseRemoteDesign(slug, item || {}, text, img);
              fetchedDesigns.push(parsed);
            } catch {
              fetchedDesigns.push(parseRemoteDesign(slug, item || {}, "", img));
            }
          }
        }

        await Promise.all(
          Array.from({ length: Math.min(concurrency, remoteEntries.length) }, () => worker()),
        );

        const merged = mergeWithBundledDesigns(fetchedDesigns, readmeImages);
        cachedDesignCatalog = merged;
        lastDesignCatalogFetch = nowMs;

        try {
          if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
          await writeFile(DESIGN_CATALOG_CACHE_FILE, JSON.stringify(fetchedDesigns, null, 2));
        } catch {
          // ignore
        }

        logger.info(`Loaded ${merged.length} design systems from awesome-design-skills repository`);
        return cachedDesignCatalog;
      }
    }
  } catch (err: any) {
    logger.warn(`Could not refresh design skills catalog: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (cachedDesignCatalog && cachedDesignCatalog.length > 0) {
    return cachedDesignCatalog;
  }

  return mergeWithBundledDesigns([]);
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
      source?: "custom" | "marketplace" | "design";
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
    if (skill.is_active && isDesignSkill(skill)) {
      for (const other of skills) {
        if (isDesignSkill(other)) {
          other.is_active = false;
        }
      }
    }
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
    if (data.is_active !== undefined) {
      skill.is_active = data.is_active;
      if (data.is_active && isDesignSkill(skill)) {
        for (const other of skills) {
          if (other.id !== id && isDesignSkill(other)) {
            other.is_active = false;
          }
        }
      }
    }
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
          headers: { "User-Agent": "SaturnRouter" },
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
      catalog_total: catalog.length,
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

  async listDesignSkills(forceRefresh = false): Promise<DesignSkill[]> {
    const catalog = await fetchRemoteOrBundledDesignCatalog(forceRefresh);
    const installed = await readIndex();
    return catalog.map((item) => {
      const match = installed.find(
        (inst) => inst.slug === item.slug || (inst.category === "UI Design" && inst.name.toLowerCase() === item.name.toLowerCase()),
      );
      return {
        ...item,
        is_installed: Boolean(match),
        installed_id: match?.id,
        is_active: match ? match.is_active : false,
      };
    });
  },

  async refreshDesignSkills(): Promise<DesignSkill[]> {
    return this.listDesignSkills(true);
  },

  async getDesignSkill(slug: string): Promise<DesignSkill | null> {
    const designs = await this.listDesignSkills();
    const item = designs.find((d) => d.slug === slug);
    if (!item) return null;

    // Try fetching the authoritative live SKILL.md from the repository
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://raw.githubusercontent.com/bergside/awesome-design-skills/main/skills/${encodeURIComponent(slug)}/SKILL.md`,
        { headers: { "User-Agent": "SaturnRouter" }, signal: controller.signal },
      );
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 50) {
          item.content = text;
        }
      }
    } catch {
      // ignore, keeps existing fallback content
    }

    return item;
  },

  async activateDesignSkill(slug: string): Promise<CustomSkill> {
    const item = await this.getDesignSkill(slug);
    if (!item) {
      throw new Error(`Design skill '${slug}' not found`);
    }

    let content = item.content;
    if (!content || content.length < 50) {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/bergside/awesome-design-skills/main/skills/${encodeURIComponent(slug)}/SKILL.md`,
          { headers: { "User-Agent": "SaturnRouter" } },
        );
        if (res.ok) {
          content = await res.text();
          item.content = content;
        }
      } catch (e: any) {
        logger.warn(`Could not fetch live SKILL.md for design ${slug}: ${e.message}`);
      }
      if (!content) {
        content = `# Design System: ${item.name} (${slug})\n\n${item.description}\n\n## Visual Direction\n- Palette: Primary: ${item.palette.primary}, Accent: ${item.palette.accent}, Surface: ${item.palette.surface}, Text: ${item.palette.text}\n- Typography: ${item.tokens.fontFamily}\n- Spacing: ${item.tokens.spacing}\n- Border Radius: ${item.tokens.borderRadius}\n\n## Rules\n${item.rules.map((r) => `- ${r}`).join("\n")}`;
      }
    }

    const installed = await readIndex();
    const match = installed.find((inst) => inst.slug === slug);

    if (match) {
      // Activate this skill (update will automatically deactivate all other design skills)
      const updated = await this.update(match.id, { is_active: true, content });
      if (!updated) throw new Error(`Failed to activate design skill '${slug}'`);
      logger.info(`Activated design skill: ${item.name} (${slug})`);
      return updated;
    }

    // Install and activate (create will automatically deactivate all other design skills)
    const created = await this.create(item.name, content, {
      description: item.description,
      category: "UI Design",
      slug: item.slug,
      source: "design",
      author: item.author,
    });

    logger.info(`Installed and activated design skill: ${item.name} (${slug})`);
    return created;
  },

  async deactivateDesignSkill(slug: string): Promise<boolean> {
    const installed = await readIndex();
    const match = installed.find((inst) => inst.slug === slug);
    if (!match) return false;

    await this.update(match.id, { is_active: false });
    logger.info(`Deactivated design skill: ${slug}`);
    return true;
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
