/**
 * Tree Classification Service — Ari (Hermes Agent) classifies new trees.
 *
 * After a tree is created, Ari analyzes the description and:
 *   1. Classifies it as: gremio, academia, or empresa
 *   2. Determines which skills the tree nurtures
 *   3. Saves to DB (classification JSON field) + sandbox: <SANDBOX_BASE_DIR>/<treeId>/tree-classification.json
 *
 * If the tree already has a user-picked classification (source: "onboarding"),
 * it is respected and not overwritten by AI classification.
 */

import { routeToHermes } from "../bot/hermesBridge/route";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";

// ── Classification result shape ────────────────────────────────────────────

export interface TreeClassification {
  type: "gremio" | "academia" | "empresa";
  skills: string[];
  classifiedAt: string;
  source?: "ai" | "onboarding";
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
        source: "ai",
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
          source: "ai",
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
      source: "ai",
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
          source: "ai",
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
 *
 * If the tree already has a user-picked classification (source: "onboarding"
 * in the classification JSON field), it is respected and AI classification
 * supplements skills but does NOT overwrite the type.
 *
 * Saves result to DB (classification JSON field) + sandbox: <SANDBOX_BASE>/<treeId>/tree-classification.json
 */
export async function classifyTree(
  treeId: string,
  treeName: string,
  description: string,
  prisma?: PrismaClient,
): Promise<TreeClassification | null> {
  // Check if tree already has an onboarding-picked classification
  let existingClassification: TreeClassification | null = null;
  if (prisma) {
    try {
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { classification: true },
      });
      if (tree?.classification) {
        const raw = tree.classification as any;
        if (raw?.source === "onboarding" && ["gremio", "academia", "empresa"].includes(raw.type)) {
          existingClassification = {
            type: raw.type,
            skills: raw.skills || [],
            classifiedAt: raw.classifiedAt || new Date().toISOString(),
            source: "onboarding",
          };
        }
      }
    } catch {
      // Non-blocking: proceed with AI classification
    }
  }

  // If user already picked during onboarding, supplement with AI skills but keep the type
  if (existingClassification) {
    console.log(
      `[classifyTree] Tree ${treeId.slice(0, 8)}… already classified as ${existingClassification.type} via onboarding — asking Ari only for skills`,
    );

    try {
      const prompt = buildClassificationPrompt(treeName, description);
      const response = await routeToHermes(prompt, treeId, "0");

      if (response?.text) {
        const aiResult = parseClassificationResponse(response.text);
        if (aiResult && aiResult.skills.length > 0) {
          // Merge: keep user-picked type, add AI-detected skills
          const merged: TreeClassification = {
            type: existingClassification.type,
            skills: [...new Set([...existingClassification.skills, ...aiResult.skills])],
            classifiedAt: existingClassification.classifiedAt,
            source: "onboarding",
          };

          // Update DB
          if (prisma) {
            try {
              await prisma.tree.update({
                where: { id: treeId },
                data: {
                  classification: merged as any,
                  classificationUpdatedAt: new Date(),
                },
              });
            } catch { /* non-blocking */ }
          }

          // Save to sandbox
          const sandboxDir = path.join(SANDBOX_BASE, treeId);
          fs.mkdirSync(sandboxDir, { recursive: true });
          const filePath = path.join(sandboxDir, "tree-classification.json");
          fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");

          console.log(
            `[classifyTree] Tree ${treeId.slice(0, 8)}… merged AI skills (${aiResult.skills.length}) into user type ${existingClassification.type}`,
          );
          return merged;
        }
      }
    } catch (err: any) {
      console.error(
        `[classifyTree] AI skill supplement failed for tree ${treeId.slice(0, 8)}… — using onboarding type only: ${err?.message || err}`,
      );
    }

    // AI supplement failed — return existing classification as-is
    return existingClassification;
  }

  // No pre-existing classification — run full AI classification
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

    // Save to DB classification field
    if (prisma) {
      try {
        await prisma.tree.update({
          where: { id: treeId },
          data: {
            classification: classification as any,
            classificationUpdatedAt: new Date(),
          },
        });
      } catch { /* non-blocking */ }
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
