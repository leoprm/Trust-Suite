// ── Telegram Payment Service ────────────────────────────────────────────────
// Handles the /pagar command — shows payment obligations for the user.
//
// Behavior:
//   - Sponsor of CENTRALIZED tree → total amount + next billing date
//   - Member of INDIVIDUAL tree → divided fee (cost / active members)
//   - Both sponsor and member → both sections
//   - Neither → "No tienes pagos pendientes ni obligaciones activas"
//
// Also retains backward-compat stubs for dispute service functions
// (models removed in schema cleanup t_06a9f3f9).

import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";
import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;
let _bot: Bot<BotContext> | null = null;

// ── Init ─────────────────────────────────────────────────────────────────

export function initPaymentService(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): void {
  _prisma = prisma;
  _bot = bot;
  console.log(
    bot
      ? "[PaymentService] Initialized with Telegram bot."
      : "[PaymentService] Initialized WITHOUT Telegram bot.",
  );
}

// ── Types ────────────────────────────────────────────────────────────────

export interface SponsorObligation {
  treeId: string;
  treeName: string;
  treeIcono: string;
  paymentMode: string;
  totalAmount: number; // total tree cost (CLP)
  memberCount: number;
}

export interface MemberObligation {
  treeId: string;
  treeName: string;
  treeIcono: string;
  paymentMode: string;
  monthlyFee: number; // user's share (CLP)
  memberCount: number;
  paymentStatus: string;
}

export interface PagarResult {
  sponsorObligations: SponsorObligation[];
  memberObligations: MemberObligation[];
}

// ── Resolve User ────────────────────────────────────────────────────────

async function resolveUserByTelegramId(
  prisma: PrismaClient,
  telegramId: number,
): Promise<string | null> {
  try {
    const bigIntId = BigInt(telegramId);
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: bigIntId },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ── Main Logic ──────────────────────────────────────────────────────────

/**
 * Computes payment obligations for a Telegram user across all trees.
 * 
 * @param telegramId Raw Telegram user ID (from ctx.from.id)
 * @returns PagarResult with sponsor and member obligations
 */
export async function computePaymentObligations(
  telegramId: number,
): Promise<PagarResult | null> {
  const prisma = _prisma;
  if (!prisma) {
    console.error("[PaymentService] Not initialized — call initPaymentService first.");
    return null;
  }

  const userId = await resolveUserByTelegramId(prisma, telegramId);
  if (!userId) return null;

  // 1. Trees where user is sponsor (CENTRALIZED mode)
  const sponsoredTrees = await (prisma as any).tree.findMany({
    where: {
      sponsorId: userId,
      paymentMode: "CENTRALIZED",
    },
    select: {
      id: true,
      name: true,
      icono: true,
      paymentMode: true,
      totalBudget: true,
    },
  });

  const sponsorObligations: SponsorObligation[] = [];
  for (const tree of sponsoredTrees) {
    const memberCount = await (prisma as any).treeMember.count({
      where: { treeId: tree.id, status: "ACTIVE" },
    });

    // Get subscription from the tree's creator
    let totalAmount = tree.totalBudget ?? 0;
    if (tree.id) {
      const sub = await (prisma as any).subscription.findFirst({
        where: { userId: userId, status: "ACTIVE" },
        select: { monthlyCost: true },
      });
      if (sub) totalAmount = sub.monthlyCost;
    }

    sponsorObligations.push({
      treeId: tree.id,
      treeName: tree.name,
      treeIcono: tree.icono ?? "🌳",
      paymentMode: tree.paymentMode,
      totalAmount,
      memberCount,
    });
  }

  // 2. Trees where user is a member (INDIVIDUAL mode)
  const memberships = await (prisma as any).treeMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      tree: { paymentMode: "INDIVIDUAL" },
    },
    select: {
      id: true,
      monthlyFee: true,
      paymentStatus: true,
      tree: {
        select: {
          id: true,
          name: true,
          icono: true,
          paymentMode: true,
        },
      },
    },
  });

  const memberObligations: MemberObligation[] = [];
  for (const m of memberships) {
    const memberCount = await (prisma as any).treeMember.count({
      where: { treeId: m.tree.id, status: "ACTIVE" },
    });

    // Calculate divided fee: tree cost / active members
    let dividedFee = m.monthlyFee ?? 0;
    if (!dividedFee) {
      const sub = await (prisma as any).subscription.findFirst({
        where: {
          userId: userId,
          status: "ACTIVE",
        },
        select: { monthlyCost: true },
      });
      if (sub && memberCount > 0) {
        dividedFee = Math.round(sub.monthlyCost / memberCount);
      }
    }

    memberObligations.push({
      treeId: m.tree.id,
      treeName: m.tree.name,
      treeIcono: m.tree.icono ?? "🌳",
      paymentMode: m.tree.paymentMode ?? "INDIVIDUAL",
      monthlyFee: dividedFee,
      memberCount,
      paymentStatus: m.paymentStatus ?? "ACTIVE",
    });
  }

  return { sponsorObligations, memberObligations };
}

// ── Format ──────────────────────────────────────────────────────────────

const PAYMENT_LINK = process.env.PAYMENT_LINK || "https://trustmaker.app/pagos";

const STATUS_EMOJI: Record<string, string> = {
  GRACE: "🆕",
  ACTIVE: "✅",
  DELINQUENT: "⚠️",
  BLOCKED: "🚫",
};

export function formatPagarResult(
  result: PagarResult,
  lng: string = "es",
): string {
  const { sponsorObligations, memberObligations } = result;
  const totalItems = sponsorObligations.length + memberObligations.length;

  if (totalItems === 0) {
    return lng === "en"
      ? "💳 No pending payments or active obligations.\n\nYou're not a sponsor of any centralized tree nor a member of any individual-payment tree."
      : "💳 No tienes pagos pendientes ni obligaciones activas.\n\nNo eres sponsor de ningún árbol centralizado ni miembro de ningún árbol con pago individual.";
  }

  const lines: string[] = ["💳 *Pagos y obligaciones*\n"];

  // Sponsor section
  if (sponsorObligations.length > 0) {
    const header = lng === "en"
      ? "🏦 *Centralized payment (you are the sponsor):*"
      : "🏦 *Pago centralizado (tú eres el sponsor):*";
    lines.push(header, "");

    for (const s of sponsorObligations) {
      lines.push(
        `${s.treeIcono} *${s.treeName}* — $${s.totalAmount.toLocaleString("es-CL")} CLP/mes total`,
        lng === "en"
          ? `   ${s.memberCount} active members covered`
          : `   ${s.memberCount} miembros activos cubiertos`,
        "",
      );
    }
  }

  // Member section
  if (memberObligations.length > 0) {
    const header = lng === "en"
      ? "👤 *Individual payment (your share):*"
      : "👤 *Pago individual (tu parte):*";
    if (sponsorObligations.length > 0) lines.push(""); // separator
    lines.push(header, "");

    for (const m of memberObligations) {
      const emoji = STATUS_EMOJI[m.paymentStatus] ?? "❓";
      lines.push(
        `${m.treeIcono} *${m.treeName}*: $${m.monthlyFee.toLocaleString("es-CL")} CLP/mes ${emoji}`,
        lng === "en"
          ? `   Split among ${m.memberCount} active members`
          : `   Dividido entre ${m.memberCount} miembros activos`,
        "",
      );
    }
  }

  // Grand total
  const sponsorTotal = sponsorObligations.reduce((sum, s) => sum + s.totalAmount, 0);
  const memberTotal = memberObligations.reduce((sum, m) => sum + m.monthlyFee, 0);
  const grandTotal = sponsorTotal + memberTotal;

  if (grandTotal > 0) {
    const totalLabel = lng === "en" ? "Total:" : "Total:";
    lines.push(`💰 ${totalLabel} $${grandTotal.toLocaleString("es-CL")} CLP/mes`);
  }

  lines.push(
    "",
    lng === "en"
      ? `To pay, visit: ${PAYMENT_LINK}`
      : `Para pagar, visita: ${PAYMENT_LINK}`,
  );

  return lines.join("\n");
}

// ── Dispute stubs (models removed in schema cleanup t_06a9f3f9) ────────

export function initDisputeService(
  _prisma: PrismaClient,
  _bot: Bot<BotContext> | null,
): void {
  console.log("[DisputeService] Disabled — models removed from schema.");
}

export async function broadcastDisputeVote(
  _taskId: string,
  _treeId: string,
  _taskTitle: string,
): Promise<number | null> {
  return null;
}

export async function notifyDisputeResolution(
  _disputeMessageId: string,
): Promise<void> {
  // Disabled
}

