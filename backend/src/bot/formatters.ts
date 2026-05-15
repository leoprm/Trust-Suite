/**
 * Formateo de respuestas del bot para Telegram.
 * Usa i18n para todos los textos — nada hardcodeado.
 */

import { t } from "./i18n";

/** Máximo de caracteres por mensaje de Telegram (4096, con margen). */
const TELEGRAM_MAX = 4000;

/** Recorta un texto al máximo permitido por Telegram. */
function truncar(texto: string, max = TELEGRAM_MAX): string {
  if (texto.length <= max) return texto;
  return texto.slice(0, max - 3) + "...";
}

// ── Help ───────────────────────────────────────────────────────────────────

export function helpMessage(lng = "es"): string {
  return [
    t("common:help_bot_title", lng),
    "",
    t("common:help_info", lng),
    t("common:help_list", lng),
    t("common:help_create", lng),
    t("common:help_ideas", lng),
    t("common:help_vote", lng),
    t("common:help_cuota", lng),
    t("common:help_pagar", lng),
    "",
    t("common:help_footer", lng),
  ].join("\n");
}

// ── Error ──────────────────────────────────────────────────────────────────

export function noTreeError(lng = "es"): string {
  return t("common:no_tree_error", lng);
}

export function commandNotFound(lng = "es"): string {
  return t("common:command_not_found", lng) + "\n\n" + helpMessage(lng);
}

// ── Tree Info ──────────────────────────────────────────────────────────────

export function formatTreeInfo(
  tree: {
    name: string;
    icono: string;
    description: string | null;
    admissionPolicy: string;
    memberCount: number;
    needCount: number;
    openNeedCount: number;
    ideaCount: number;
  },
  lng = "es",
): string {
  const politicas: Record<string, string> = {
    OPEN: t("common:admission_open", lng),
    INVITE_ONLY: t("common:admission_invite_only", lng),
  };

  return [
    `${tree.icono} *${tree.name}*`,
    tree.description ? `_${tree.description}_` : "",
    "",
    t("tree:info_members", lng, { count: tree.memberCount }),
    t("tree:info_needs", lng, { total: tree.needCount, open: tree.openNeedCount }),
    t("tree:info_ideas", lng, { count: tree.ideaCount }),
    t("tree:info_admission", lng, { policy: politicas[tree.admissionPolicy] || tree.admissionPolicy }),
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
  }>,
  lng = "es",
): string {
  if (needs.length === 0) {
    return t("needs:list_empty", lng);
  }

  const openNeeds = needs.filter(n => n.status === "OPEN");
  const pendingNeeds = needs.filter(n => n.status === "PENDING_APPROVAL");
  const otherNeeds = needs.filter(n => n.status !== "OPEN" && n.status !== "PENDING_APPROVAL");

  const lines: string[] = [
    t("needs:list_header", lng, {
      total: needs.length,
      open: openNeeds.length,
      pending: pendingNeeds.length,
    }),
  ];

  // Pending approval needs first (awaiting vote)
  for (const n of pendingNeeds) {
    const creator = n.creator?.username ? ` por @${n.creator.username}` : "";
    lines.push(
      t("needs:list_pending_item", lng, {
        title: n.title,
        ideas: n._count.ideas,
        creator,
        id: n.id,
      }),
    );
  }

  for (const n of openNeeds) {
    const creator = n.creator?.username ? ` por @${n.creator.username}` : "";
    lines.push(
      t("needs:list_open_item", lng, {
        title: n.title,
        importance: n.importance,
        ideas: n._count.ideas,
        creator,
        id: n.id,
      }),
    );
  }

  if (otherNeeds.length > 0) {
    lines.push(t("needs:list_closed_header", lng, { count: otherNeeds.length }));
    for (const n of otherNeeds) {
      const key = n.status === "SATISFIED" ? "needs.list_closed_satisfied" : "needs.list_closed_other";
      lines.push(t(key, lng, { title: n.title }));
    }
  }

  return truncar(lines.join("\n"));
}

export function formatNeedCreated(
  need: { id: string; title: string; importance: number },
  lng = "es",
): string {
  return [
    t("needs:created_header", lng),
    t("needs:created_title", lng, { title: need.title }),
    t("needs:created_importance", lng, { importance: need.importance }),
    t("needs:created_id", lng, { id: need.id }),
  ].join("\n");
}

export function formatNeedPendingApproval(
  need: { id: string; title: string },
  lng = "es",
): string {
  return [
    t("needs:pending_approval_header", lng),
    t("needs:pending_approval_title", lng, { title: need.title }),
    "",
    t("needs:pending_approval_note", lng),
    t("needs:pending_approval_id", lng, { id: need.id }),
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
  }>,
  lng = "es",
): string {
  if (ideas.length === 0) {
    return t("voting:ideas_empty", lng, { title: needTitle });
  }

  const lines: string[] = [
    t("voting:ideas_header", lng, { title: needTitle, count: ideas.length }),
  ];

  for (const idea of ideas) {
    const creator = idea.creator?.username ? ` — @${idea.creator.username}` : "";
    const score = idea.matchScore !== undefined ? ` 🎯${Math.round(idea.matchScore * 100)}%` : "";
    lines.push(
      `❤️ ${idea.totalLikes} | ${idea.content.slice(0, 120)}${idea.content.length > 120 ? "..." : ""}${creator}${score}`,
    );
  }

  return truncar(lines.join("\n"));
}

// ── Vote ───────────────────────────────────────────────────────────────────

export function formatVoteAck(needTitle: string, lng = "es"): string {
  return t("common:vote_registered", lng, { title: needTitle });
}

export function needNotFound(needId: string, lng = "es"): string {
  return t("common:need_not_found", lng, { needId });
}

// ── Create Need Help ───────────────────────────────────────────────────────

export function createNeedHelp(lng = "es"): string {
  return [
    t("common:create_need_help_format", lng),
    "",
    t("common:create_need_help_example_label", lng),
    t("common:create_need_help_example", lng),
  ].join("\n");
}

// ── Cuota ──────────────────────────────────────────────────────────────────

export function noMemberError(lng = "es"): string {
  return t("common:no_member_error", lng);
}

export function formatCuota(
  cuota: number,
  costoBase: number,
  taskShare: number,
  lng = "es",
): string {
  return [
    t("voting:cuota_title", lng),
    "",
    t("voting:cuota_total", lng, { total: cuota.toLocaleString("es-CL") }),
    t("voting:cuota_base", lng, { base: costoBase.toLocaleString("es-CL") }),
    t("voting:cuota_tasks", lng, { tasks: taskShare.toLocaleString("es-CL") }),
    "",
    t("voting:cuota_pay_hint", lng),
  ].join("\n");
}

// ── Pagar ──────────────────────────────────────────────────────────────────

export function formatPagar(
  balance: { availableBalance: number; pendingBalance: number } | null,
  splits: Array<{ needTitle: string; percentage: number; reason: string }>,
  lng = "es",
): string {
  const lines: string[] = [t("voting:pagar_title", lng), ""];

  if (balance) {
    lines.push(
      t("voting:pagar_available", lng, { amount: balance.availableBalance.toLocaleString("es-CL") }),
      t("voting:pagar_pending", lng, { amount: balance.pendingBalance.toLocaleString("es-CL") }),
    );
  } else {
    lines.push(t("voting:pagar_no_balance", lng));
  }

  if (splits.length > 0) {
    lines.push("", t("voting:pagar_splits_header", lng));
    for (const s of splits) {
      const pct = Math.round(s.percentage);
      lines.push(`• ${s.needTitle} — ${pct}% (${s.reason})`);
    }
  } else {
    lines.push("", t("voting:pagar_no_splits", lng));
  }

  lines.push(
    "",
    t("voting:pagar_payment_link", lng, {
      link: process.env.PAYMENT_LINK || "https://trustmaker.app/pagos",
    }),
  );

  return truncar(lines.join("\n"));
}
