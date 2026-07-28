import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";
import type { CustomSkill } from "./custom-skills.types";

const SKILLS_DIR = join(config.dataDir, "custom-skills");

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

  async create(name: string, content: string): Promise<CustomSkill> {
    const id = generateId();
    const timestamp = now();
    const skill: CustomSkill = {
      id,
      name,
      content,
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
    data: { name?: string; content?: string; is_active?: boolean },
  ): Promise<CustomSkill | null> {
    const skills = await readIndex();
    const idx = skills.findIndex((s) => s.id === id);
    if (idx === -1) return null;

    const skill = skills[idx];

    if (data.name !== undefined) skill.name = data.name;
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
