import fs from "fs";
import path from "path";
import { generateSkillMarkdown, parseSkillMarkdown } from "../lib/skillFormat";
import { getUsage } from "../lib/skillUsage";

const TREES_BASE = "/home/trustmaker/trees";
const PROMOTE_DIR = path.join(
  process.env.HOME || "/home/leo",
  ".hermes/skills/trustmaker",
);
const MAX_PROMOTED = 40;

interface SkillInstance {
  treeId: string;
  name: string;
  originalName: string;
  rating: number;
  mdPath: string;
}

interface AggregatedSkill {
  name: string;
  instances: SkillInstance[];
  avgRating: number;
  usos: number;
  fitness: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeSkillName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readRating(ratingPath: string): number {
  try {
    const raw = fs.readFileSync(ratingPath, "utf-8");
    const data = JSON.parse(raw);
    const r = Number(data.rating);
    return Number.isFinite(r) ? r : NaN;
  } catch {
    return NaN;
  }
}

function scanTreeSkills(treeId: string): SkillInstance[] {
  const skillsDir = path.join(TREES_BASE, treeId, "skills");
  if (!fs.existsSync(skillsDir)) return [];

  const entries = safeReaddir(skillsDir);
  const instances: SkillInstance[] = [];

  for (const entry of entries) {
    const full = path.join(skillsDir, entry);
    if (!full.endsWith(".md") || !fs.statSync(full).isFile()) continue;

    const rawName = entry.replace(/\.md$/, "");
    const normalized = normalizeSkillName(rawName);
    const ratingPath = path.join(skillsDir, `${rawName}.rating.json`);
    const rating = readRating(ratingPath);

    instances.push({
      treeId,
      name: normalized,
      originalName: rawName,
      rating: Number.isNaN(rating) ? 0 : rating,
      mdPath: full,
    });
  }

  return instances;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// ── Aggregation ────────────────────────────────────────────────────────────

function aggregate(allInstances: SkillInstance[]): AggregatedSkill[] {
  const byName = new Map<string, SkillInstance[]>();

  for (const inst of allInstances) {
    const list = byName.get(inst.name) || [];
    list.push(inst);
    byName.set(inst.name, list);
  }

  const result: AggregatedSkill[] = [];

  for (const [name, instances] of byName) {
    const ratings = instances.map((i) => i.rating).filter((r) => r > 0);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

    const usage = getUsage(name);
    const usos = usage?.usos ?? 0;
    const fitness = avgRating * 0.4 + usos * 0.6;

    result.push({ name, instances, avgRating, usos, fitness });
  }

  return result;
}

// ── Promotion / Eviction ───────────────────────────────────────────────────

function pickBestInstance(instances: SkillInstance[]): SkillInstance {
  return instances
    .slice()
    .sort((a, b) => b.rating - a.rating || a.treeId.localeCompare(b.treeId))[0];
}

function promoteSkill(skill: AggregatedSkill): void {
  const best = pickBestInstance(skill.instances);

  let description = `Skill promovida desde ${skill.instances.length} árbol(es)`;
  let body = "";
  let author = "skillEvolution";
  const treeId = "global";

  try {
    const rawMd = fs.readFileSync(best.mdPath, "utf-8");
    const parsed = parseSkillMarkdown(rawMd);
    description = parsed.metadata.description || description;
    body = parsed.body;
    author = parsed.metadata.createdBy || author;
  } catch {
    try {
      body = fs.readFileSync(best.mdPath, "utf-8");
    } catch {
      body = `# ${skill.name}\n\nSkill agregada desde ${skill.instances.length} árbol(es).`;
    }
  }

  const markdown = generateSkillMarkdown(
    skill.name,
    description,
    body,
    author,
    treeId,
  );

  fs.mkdirSync(PROMOTE_DIR, { recursive: true });
  const dest = path.join(PROMOTE_DIR, `${skill.name}.md`);
  fs.writeFileSync(dest, markdown, "utf-8");
}

function listPromoted(): Map<string, string> {
  const map = new Map<string, string>();
  const entries = safeReaddir(PROMOTE_DIR);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const name = entry.replace(/\.md$/, "");
    map.set(name, path.join(PROMOTE_DIR, entry));
  }
  return map;
}

function evictLowest(
  promoted: Map<string, string>,
  aggregated: Map<string, AggregatedSkill>,
  keepCount: number,
): string[] {
  if (promoted.size <= keepCount) return [];

  const ranked: { name: string; fitness: number }[] = [];
  for (const name of promoted.keys()) {
    const agg = aggregated.get(name);
    ranked.push({ name, fitness: agg?.fitness ?? 0 });
  }

  ranked.sort((a, b) => a.fitness - b.fitness);

  const toEvict = ranked.slice(0, promoted.size - keepCount);
  const evicted: string[] = [];

  for (const { name } of toEvict) {
    const mdPath = promoted.get(name);
    if (mdPath) {
      try {
        fs.unlinkSync(mdPath);
        evicted.push(name);
      } catch {
        evicted.push(name);
      }
    }
    const usosPath = path.join(PROMOTE_DIR, `${name}.usos.json`);
    try {
      fs.unlinkSync(usosPath);
    } catch {
      // ignore
    }
  }

  return evicted;
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function nightlyScan(
  _prisma: unknown,
  _bot: unknown,
): Promise<void> {
  // 1. Scan all tree skills
  const treeDirs = safeReaddir(TREES_BASE).filter((d) => {
    const full = path.join(TREES_BASE, d);
    try {
      return fs.statSync(full).isDirectory();
    } catch {
      return false;
    }
  });

  const allInstances: SkillInstance[] = [];
  for (const treeId of treeDirs) {
    allInstances.push(...scanTreeSkills(treeId));
  }

  // 2-7. Aggregate, filter, sort
  let aggregated = aggregate(allInstances);
  aggregated = aggregated.filter((s) => s.avgRating >= 6);
  aggregated.sort((a, b) => b.fitness - a.fitness);

  const aggMap = new Map<string, AggregatedSkill>();
  for (const s of aggregated) {
    aggMap.set(s.name, s);
  }

  // 8. Promote top 40
  const top40 = aggregated.slice(0, MAX_PROMOTED);
  const promotedNames = new Set<string>();
  for (const skill of top40) {
    promoteSkill(skill);
    promotedNames.add(skill.name);
  }

  // 9. Evict if >40 total promoted
  const currentlyPromoted = listPromoted();
  const evicted = evictLowest(currentlyPromoted, aggMap, MAX_PROMOTED);

  // 10. Log
  const unchanged =
    currentlyPromoted.size - promotedNames.size - evicted.length;

  console.log(
    `[SkillEvo] ${promotedNames.size} promovidas, ` +
      `${evicted.length} eliminadas, ` +
      `${Math.max(0, unchanged)} sin cambios`,
  );
}
