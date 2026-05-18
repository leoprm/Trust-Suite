/**
 * skillFormat.ts — Biblioteca de formato de Skill (.md + rating JSON).
 *
 * Funciones:
 *   generateSkillMarkdown  → genera .md con frontmatter YAML
 *   generateRatingJson     → genera JSON de rating con metadatos
 *   parseSkillMarkdown     → extrae metadatos del frontmatter
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  createdBy: string;
  createdAt: string;
  treeId: string;
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  body: string;
}

export interface RatingJson {
  rating: number;
  ratedBy: string;
  ratedAt: string;
}

/**
 * Genera un string .md con frontmatter YAML + contenido markdown.
 */
export function generateSkillMarkdown(
  name: string,
  description: string,
  content: string,
  author: string,
  treeId: string,
): string {
  const createdAt = new Date().toISOString();
  const frontmatter = [
    "---",
    `name: "${escapeYaml(name)}"`,
    `description: "${escapeYaml(description)}"`,
    "version: \"1.0.0\"",
    `createdBy: "${escapeYaml(author)}"`,
    `createdAt: "${createdAt}"`,
    `treeId: "${escapeYaml(treeId)}"`,
    "---",
    "",
    content,
  ].join("\n");

  return frontmatter;
}

/**
 * Genera un string JSON con el rating y metadatos del evaluador.
 */
export function generateRatingJson(rating: number, ratedBy: string): string {
  const payload: RatingJson = {
    rating,
    ratedBy,
    ratedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}

/**
 * Extrae los metadatos del frontmatter YAML de un .md de skill.
 * Retorna { metadata, body } donde body es el contenido sin frontmatter.
 */
export function parseSkillMarkdown(mdContent: string): ParsedSkill {
  const lines = mdContent.split("\n");

  // Buscar delimitadores ---
  if (lines[0]?.trim() !== "---") {
    throw new Error("Skill markdown must start with YAML frontmatter (---)");
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    throw new Error("Missing closing --- for YAML frontmatter");
  }

  const yamlLines = lines.slice(1, endIdx);
  const metadata = parseYamlKV(yamlLines) as unknown as SkillMetadata;

  // Defaults
  metadata.version = metadata.version || "1.0.0";

  const body = lines.slice(endIdx + 1).join("\n").trim();

  return { metadata, body };
}

// ── helpers ──────────────────────────────────────────────────────────

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseYamlKV(lines: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Quitar comillas si las tiene
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}
