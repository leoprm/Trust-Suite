/**
 * Formateo de respuestas del bot para Telegram.
 * Todo en español, conciso, con emojis para legibilidad.
 */

/** Máximo de caracteres por mensaje de Telegram (4096, con margen). */
const TELEGRAM_MAX = 4000;

/** Recorta un texto al máximo permitido por Telegram. */
function truncar(texto: string, max = TELEGRAM_MAX): string {
  if (texto.length <= max) return texto;
  return texto.slice(0, max - 3) + "...";
}

// ── Help ───────────────────────────────────────────────────────────────────

export function helpMessage(): string {
  return [
    "🌳 *TrustMaker* — comandos disponibles:",
    "",
    "• `@TrustMakerBot /info` — stats del árbol",
    "• `@TrustMakerBot /lista necesidades` — necesidades abiertas",
    "• `@TrustMakerBot /crea necesidad \"título\" — descripción` — crear necesidad",
    "• `@TrustMakerBot /ideas para \"título\"` — ver ideas de una necesidad",
    "• `@TrustMakerBot /vota <id>` — votar por una necesidad",
    "",
    "_Responde en el grupo mencionando @TrustMaker._",
  ].join("\n");
}

// ── Error ──────────────────────────────────────────────────────────────────

export function noTreeError(): string {
  return "⚠️ Este grupo no está vinculado a ningún árbol de TrustMaker.\n\n" +
    "El creador del árbol debe configurar `telegramChatId` en la consola de administración.";
}

export function commandNotFound(): string {
  return "❓ Comando no reconocido.\n\n" + helpMessage();
}

// ── Tree Info ──────────────────────────────────────────────────────────────

export function formatTreeInfo(tree: {
  name: string;
  icono: string;
  description: string | null;
  admissionPolicy: string;
  memberCount: number;
  needCount: number;
  openNeedCount: number;
  ideaCount: number;
}): string {
  const politicas: Record<string, string> = {
    OPEN: "Abierto 🌍",
    INVITE_ONLY: "Solo invitación 🔒",
  };

  return [
    `${tree.icono} *${tree.name}*`,
    tree.description ? `_${tree.description}_` : "",
    "",
    `👥 Miembros: ${tree.memberCount}`,
    `📋 Necesidades: ${tree.needCount} (${tree.openNeedCount} abiertas)`,
    `💡 Ideas: ${tree.ideaCount}`,
    `🔐 Admisión: ${politicas[tree.admissionPolicy] || tree.admissionPolicy}`,
  ].filter(Boolean).join("\n");
}

// ── Needs ──────────────────────────────────────────────────────────────────

export function formatNeedsList(
  needs: Array<{
    id: string;
    title: string;
    status: string;
    importance: number;
    _count: { ideas: number };
    creator?: { username: string } | null;
  }>
): string {
  if (needs.length === 0) {
    return "📋 No hay necesidades en este árbol todavía.\n\n" +
      "Crea una con: `@TrustMakerBot /crea necesidad \"título\" — descripción`";
  }

  const openNeeds = needs.filter(n => n.status === "OPEN");
  const otherNeeds = needs.filter(n => n.status !== "OPEN");

  const lines: string[] = [`📋 *Necesidades* (${needs.length} total, ${openNeeds.length} abiertas):\n`];

  for (const n of openNeeds) {
    const creator = n.creator?.username ? ` por @${n.creator.username}` : "";
    lines.push(
      `🟢 *${n.title}* — importancia ${n.importance}/10 | 💡 ${n._count.ideas} ideas${creator}\n  \`${n.id}\``
    );
  }

  if (otherNeeds.length > 0) {
    lines.push(`\n📌 _Cerradas/satisfechas (${otherNeeds.length}):_`);
    for (const n of otherNeeds) {
      const statusEmoji = n.status === "SATISFIED" ? "✅" : "🔒";
      lines.push(`${statusEmoji} ${n.title}`);
    }
  }

  return truncar(lines.join("\n"));
}

export function formatNeedCreated(need: { id: string; title: string; importance: number }): string {
  return [
    "✅ Necesidad creada:",
    `*${need.title}*`,
    `Importancia: ${need.importance}/10`,
    `ID: \`${need.id}\``,
  ].join("\n");
}

// ── Ideas ──────────────────────────────────────────────────────────────────

export function formatIdeasList(
  needTitle: string,
  ideas: Array<{
    id: string;
    content: string;
    totalLikes: number;
    matchScore?: number;
    creator?: { username: string } | null;
  }>
): string {
  if (ideas.length === 0) {
    return `💡 No hay ideas para *${needTitle}* todavía.\n\n` +
      "Los miembros del árbol pueden proponer ideas desde la app web.";
  }

  const lines: string[] = [
    `💡 *Ideas para \"${needTitle}\"* (${ideas.length}):\n`,
  ];

  for (const idea of ideas) {
    const creator = idea.creator?.username ? ` — @${idea.creator.username}` : "";
    const score = idea.matchScore !== undefined ? ` 🎯${Math.round(idea.matchScore * 100)}%` : "";
    lines.push(
      `❤️ ${idea.totalLikes} | ${idea.content.slice(0, 120)}${idea.content.length > 120 ? "..." : ""}${creator}${score}`
    );
  }

  return truncar(lines.join("\n"));
}

// ── Vote ───────────────────────────────────────────────────────────────────

export function formatVoteAck(needTitle: string): string {
  return `❤️ Voto registrado para *${needTitle}*.`;
}

export function needNotFound(needId: string): string {
  return `❌ No se encontró la necesidad con ID \`${needId}\`.`;
}

// ── Create Need Help ───────────────────────────────────────────────────────

export function createNeedHelp(): string {
  return [
    "❓ Formato: `@TrustMakerBot /crea necesidad \"título\" — descripción`",
    "",
    "Ejemplo:",
    "`@TrustMakerBot /crea necesidad \"Mejorar onboarding\" — Crear un tutorial interactivo para nuevos miembros`",
  ].join("\n");
}
