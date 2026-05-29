/**
 * Tree Classification Service — Ari (Hermes Agent) classifies new trees.
 *
 * After a tree is created, Ari analyzes the description and:
 *   1. Classifies it as: gremio, academia, or empresa
 *   2. Determines which skills the tree nurtures
 *   3. Saves to sandbox: <SANDBOX_BASE_DIR>/<treeId>/tree-classification.json
 */

import { routeToHermes } from "../bot/hermesBridge/route";
import fs from "fs";
import path from "path";

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

// ── Classification result shape ────────────────────────────────────────────

export interface TreeClassification {
  type: "gremio" | "academia" | "empresa";
  skills: string[];
  classifiedAt: string;
}

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildClassificationPrompt(treeName: string, description: string): string {
  return [
    "Eres Ari, la IA de Trust Maker. Tu tarea es clasificar un árbol recién creado.",
    "",
    `Nombre del árbol: ${treeName}`,
    `Descripción: ${description || "(sin descripción)"}`,
    "",
    "Clasifícalo en UNO de estos tres tipos:",
    "- gremio: comunidad, trade union, colectivo profesional, networking, apoyo mutuo",
    "- academia: educación, formación, aprendizaje, investigación, cursos, mentorship",
    "- empresa: negocio, startup, producto, servicios, monetización, venture building",
    "",
    "Además, identifica las habilidades que este árbol nutre (skills), por ejemplo: python, diseño, liderazgo, ventas, etc.",
    "",
    "RESPONDE EXACTAMENTE CON ESTE FORMATO JSON (nada más, sin markdown, sin saludos):",
    '{"type":"academia","skills":["python","machine-learning","liderazgo"]}',
    "",
    "Responde ahora:",
  ].join("\n");
}

// ── Response parser ────────────────────────────────────────────────────────

function parseClassificationResponse(text: string): TreeClassification | null {
  // Try direct JSON parse
  try {
    const trimmed = text.trim();
    const parsed = JSON.parse(trimmed);
    if (
      parsed.type &&
      ["gremio", "academia", "empresa"].includes(parsed.type) &&
      Array.isArray(parsed.skills)
    ) {
      return {
        type: parsed.type,
        skills: parsed.skills.map((s: any) => String(s).toLowerCase().trim()),
        classifiedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Not raw JSON — try to extract from markdown code block
  }

  // Try extracting JSON from markdown code block ```json ... ```
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim());
      if (
        parsed.type &&
        ["gremio", "academia", "empresa"].includes(parsed.type) &&
        Array.isArray(parsed.skills)
      ) {
        return {
          type: parsed.type,
          skills: parsed.skills.map((s: any) => String(s).toLowerCase().trim()),
          classifiedAt: new Date().toISOString(),
        };
      }
    } catch {
      // JSON inside code block invalid
    }
  }

  // Try extracting TYPE and SKILLS from plain text format
  const typeMatch = text.match(/TYPE:\s*(gremio|academia|empresa)/i);
  const skillsMatch = text.match(/SKILLS:\s*(.+)/i);
  if (typeMatch && skillsMatch) {
    const skills = skillsMatch[1]
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return {
      type: typeMatch[1].toLowerCase() as TreeClassification["type"],
      skills,
      classifiedAt: new Date().toISOString(),
    };
  }

  // Try extracting from a broader JSON match (any JSON object with type + skills)
  const jsonMatch = text.match(/\{[\s\S]*?"type"[\s\S]*?"skills"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (
        parsed.type &&
        ["gremio", "academia", "empresa"].includes(parsed.type) &&
        Array.isArray(parsed.skills)
      ) {
        return {
          type: parsed.type,
          skills: parsed.skills.map((s: any) => String(s).toLowerCase().trim()),
          classifiedAt: new Date().toISOString(),
        };
      }
    } catch {
      // invalid
    }
  }

  return null;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Classify a newly created tree by asking Ari (Hermes Agent).
 * Fire-and-forget — always catches errors internally and never throws.
 * Saves result to sandbox: <SANDBOX_BASE>/<treeId>/tree-classification.json
 */
export async function classifyTree(
  treeId: string,
  treeName: string,
  description: string,
): Promise<TreeClassification | null> {
  const prompt = buildClassificationPrompt(treeName, description);

  try {
    const response = await routeToHermes(
      prompt,
      treeId,
      "0",       // synthetic userId — no queue gate
    );

    if (!response || !response.text) {
      console.error(
        `[classifyTree] Hermes returned null/empty for tree ${treeId.slice(0, 8)}…`,
      );
      return null;
    }

    const classification = parseClassificationResponse(response.text);
    if (!classification) {
      console.error(
        `[classifyTree] Failed to parse Ari response for tree ${treeId.slice(0, 8)}…: "${response.text.slice(0, 200)}"`,
      );
      return null;
    }

    // Save to sandbox
    const sandboxDir = path.join(SANDBOX_BASE, treeId);
    fs.mkdirSync(sandboxDir, { recursive: true });
    const filePath = path.join(sandboxDir, "tree-classification.json");
    fs.writeFileSync(filePath, JSON.stringify(classification, null, 2), "utf-8");

    console.log(
      `[classifyTree] Tree ${treeId.slice(0, 8)}… classified as ${classification.type} with ${classification.skills.length} skills → ${filePath}`,
    );

    return classification;
  } catch (err: any) {
    console.error(
      `[classifyTree] Error for tree ${treeId.slice(0, 8)}…: ${err?.message || err}`,
    );
    return null;
  }
}
