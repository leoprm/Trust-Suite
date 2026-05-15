/**
 * Hermes Agent Bridge — Telegram bot → Hermes Agent API directo.
 *
 * Cuando HERMES_BRIDGE_ENABLED=true, el bot de Telegram enruta todos los
 * mensajes de grupo y DM a través de esta función en vez de handleMessage /
 * handleNaturalMessage / handleDM.
 *
 * La función llama a la API de Hermes Agent (http://127.0.0.1:8642) con un
 * system prompt que incluye el contexto real del árbol (nombre, necesidades
 * activas, miembros) obtenido de la base de datos.
 *
 * Patrón basado en conciergeController.ts líneas 827-870.
 */

import { PrismaClient } from "@prisma/client";

const HERMES_API = "http://127.0.0.1:8643/v1/chat/completions";

export interface HermesBridgeResponse {
  text: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Construye el system prompt con contexto real del árbol.
 * Incluye: nombre, descripción, necesidades activas y miembros.
 */
async function buildSystemPrompt(
  prisma: PrismaClient,
  treeId: string,
  userId: string,
): Promise<string> {
  const lines: string[] = [];

  // ── Tree info ─────────────────────────────────────────────────────────
  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      name: true,
      icono: true,
      description: true,
      objectives: true,
      admissionPolicy: true,
      createdAt: true,
    },
  });

  if (!tree) {
    return "You are a helpful assistant for Trust Maker. Respond in Spanish.";
  }

  lines.push(
    `You are the Tree Agent for "${tree.name}" (${tree.icono}) — a Trust Maker community.`,
  );
  lines.push("");
  lines.push("Tree metadata (REAL, from DB):");
  lines.push(`  Name: ${tree.name}`);
  lines.push(`  Description: ${tree.description || "No description set"}`);
  lines.push(`  Admission: ${tree.admissionPolicy}`);
  if (tree.objectives) {
    lines.push(`  Objectives: ${tree.objectives}`);
  }

  // ── Active needs ──────────────────────────────────────────────────────
  const needs = await (prisma as any).need.findMany({
    where: { treeId, status: "OPEN" },
    select: { title: true, description: true, importance: true },
    orderBy: { importance: "desc" },
    take: 10,
  });

  const needCount = needs.length;
  lines.push("");
  lines.push(`Open needs (${needCount}):`);

  if (needs.length === 0) {
    lines.push("  (no open needs)");
  } else {
    for (const n of needs) {
      const desc =
        n.description?.length > 120
          ? n.description.slice(0, 117) + "..."
          : (n.description || "Sin descripción");
      lines.push(`  - [${n.importance}] ${n.title}: ${desc}`);
    }
  }

  // ── Members ───────────────────────────────────────────────────────────
  const members = await (prisma as any).treeMember.findMany({
    where: { treeId, status: "ACTIVE" },
    include: {
      user: { select: { username: true, skills: true } },
    },
    take: 20,
  });

  const memberCount = members.length;
  lines.push("");
  lines.push(`Members (${memberCount} active):`);

  if (members.length === 0) {
    lines.push("  (no active members)");
  } else {
    for (const m of members) {
      const username = m.user?.username || "(anónimo)";
      let skillsStr = "";
      if (m.user?.skills) {
        try {
          const skills = JSON.parse(m.user.skills as string);
          if (typeof skills === "object" && skills !== null) {
            const entries = Object.entries(skills as Record<string, number>);
            if (entries.length > 0) {
              skillsStr =
                " [" +
                entries
                  .slice(0, 5)
                  .map(([k, v]) => `${k}(${v})`)
                  .join(", ") +
                "]";
            }
          }
        } catch {
          // ignore
        }
      }
      lines.push(`  - ${username}${skillsStr}`);
    }
  }

  // ── User context ──────────────────────────────────────────────────────
  const tgUser = await (prisma as any).user.findFirst({
    where: { telegramUserId: BigInt(userId) },
    select: { username: true, id: true },
  });
  if (tgUser) {
    lines.push("");
    lines.push(`Current user: ${tgUser.username} (id: ${tgUser.id})`);
    lines.push("Address this user by their username when responding.");
  }

  // ── Sandbox tools ────────────────────────────────────────────────────
  lines.push("");
  lines.push("═══ HERRAMIENTAS DISPONIBLES (SANDBOX) ═══");
  lines.push("");
  lines.push(`Tu Tree ID es: ${treeId}`);
  lines.push("Para ejecutar operaciones de archivos o comandos, usa EXCLUSIVAMENTE");
  lines.push("los siguientes endpoints REST del sandbox del árbol:");
  lines.push("");
  lines.push("1. EJECUTAR COMANDOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/exec`);
  lines.push('   Body: { "command": "ls -la", "cwd": "/sandbox" }');
  lines.push('   Response: { "stdout": "...", "stderr": "...", "exitCode": 0 }');
  lines.push("");
  lines.push("2. LEER ARCHIVOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/read`);
  lines.push('   Body: { "path": "archivo.txt" }');
  lines.push('   Response: { "content": "...", "exists": true }');
  lines.push("");
  lines.push("3. ESCRIBIR ARCHIVOS:");
  lines.push(`   POST /api/trees/${treeId}/sandbox/write`);
  lines.push('   Body: { "path": "archivo.txt", "content": "contenido..." }');
  lines.push('   Response: { "success": true }');
  lines.push("");
  lines.push(
    "Formato de solicitud HTTP — usa fetch con Authorization Bearer HERMES_API_SERVER_KEY:",
  );
  lines.push("");
  lines.push("```javascript");
  lines.push(
    `fetch("http://localhost:3100/api/trees/${treeId}/sandbox/exec", {`,
  );
  lines.push('  method: "POST",');
  lines.push("  headers: {");
  lines.push('    "Content-Type": "application/json",');
  lines.push('    "Authorization": "Bearer HERMES_API_SERVER_KEY"');
  lines.push("  },");
  lines.push(
    '  body: JSON.stringify({ command: "...", cwd: "/sandbox" })',
  );
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("⚠️  ADVERTENCIA CRÍTICA:");
  lines.push(
    "- NO uses herramientas nativas de terminal ni file system.",
  );
  lines.push(
    "- Toda operación de archivos o comandos DEBE pasar por la API sandbox de este árbol listada arriba.",
  );
  lines.push(
    "- Este árbol NUNCA debe acceder archivos fuera de su sandbox.",
  );
  lines.push(
    "- Las rutas de archivos son relativas a la raíz del sandbox del árbol.",
  );
  lines.push(
    "- Si la API sandbox no está disponible (error de conexión), informa al usuario y NO uses workarounds con herramientas nativas.",
  );

  // ── Response guidelines ───────────────────────────────────────────────
  lines.push("");
  lines.push(
    "Respond in neutral Spanish (no voseo, no regionalisms like \"ché\", \"vos\", \"andá\", \"tenés\").",
  );
  lines.push("Use \"tú\" or \"usted\" consistently. Be concise, helpful, and action-oriented.");
  lines.push("When the user asks about tasks, prioritize open needs from this tree.");
  lines.push("");
  lines.push(
    "IMPORTANT: You have REAL user and tree data above. Use it. Do NOT invent or hallucinate.",
  );
  lines.push(
    "If the user asks about membership, trees, or stats, the data above IS authoritative.",
  );

  return lines.join("\n");
}

/**
 * Enruta un mensaje del bot de Telegram al Hermes Agent API directamente.
 *
 * Flujo:
 * 1. Construye system prompt con contexto real del árbol (nombre, necesidades, miembros)
 * 2. Llama POST http://127.0.0.1:8642/v1/chat/completions
 * 3. Parsea data.choices[0].message.content
 * 4. Retorna el texto de respuesta
 *
 * @param message   Texto del usuario (ya limpio, sin mención al bot)
 * @param treeId    ID del árbol asociado al chat
 * @param userId    Telegram user ID como string
 * @param chatHistory  Historial de mensajes previos (opcional)
 * @returns         { text: string }
 */
export async function routeToHermes(
  message: string,
  treeId: string,
  userId: string,
  chatHistory?: ChatMessage[],
): Promise<HermesBridgeResponse | null> {
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

  // ── Build system prompt with tree context from DB ─────────────────────
  // We need a Prisma instance — use dynamic import to avoid circular deps
  const { prisma } = await import("../index");
  const systemPrompt = await buildSystemPrompt(prisma, treeId, userId);

  // ── Build messages array ──────────────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject chat history if provided (for multi-turn context)
  if (chatHistory && chatHistory.length > 0) {
    messages.push(...chatHistory);
  }

  messages.push({ role: "user", content: message.trim() });

  // ── Call Hermes Agent API ─────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900_000); // 15 minutos

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hermes-Session-Key": `tree-agent-${treeId}`,
  };
  if (API_SERVER_KEY) {
    headers["Authorization"] = `Bearer ${API_SERVER_KEY}`;
  }

  let response: globalThis.Response;
  try {
    response = await fetch(HERMES_API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // ── Handle upstream errors ─────────────────────────────────────────────
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[hermesBridge] Hermes API returned ${response.status}: ${errorText.slice(0, 300)}`,
    );
    return null;
  }

  // ── Parse and return ──────────────────────────────────────────────────
  const data = (await response.json()) as any;

  const reply =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.content ??
    data?.reply ??
    "";

  if (!reply) {
    console.error("[hermesBridge] Empty response from Hermes API");
    return null;
  }

  return { text: reply };
}
