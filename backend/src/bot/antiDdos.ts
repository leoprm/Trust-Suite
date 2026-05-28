/**
 * Anti-DDoS: member limit enforcement, 3-strike leave policy, 90-day block.
 * 
 * Uses blockedUntil as a dual-purpose field:
 *   - During standby grace period: blockedUntil = now + 1h (temporary)
 *   - After 3rd strike: blockedUntil = now + 90 days (actual block)
 */

import { Bot, Context } from "grammy";
import { PrismaClient } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────────────────

export interface TreeDdosState {
  id: string;
  maxMembers: number;
  leaveAttempts: number;
  blockedUntil: Date | null;
  standby: boolean;
  telegramChatId: string | null;
  memberCount: number;
  name: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function getTreeState(
  prisma: PrismaClient,
  treeId: string,
): Promise<TreeDdosState | null> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    select: {
      id: true,
      maxMembers: true,
      leaveAttempts: true,
      blockedUntil: true,
      standby: true,
      telegramChatId: true,
      name: true,
    },
  });
  if (!tree) return null;

  const memberCount = await prisma.treeMember.count({
    where: { treeId, status: "ACTIVE" },
  });

  return { ...tree, memberCount };
}

/** Find admin Telegram user IDs for a tree. Falls back to creator. */
async function getAdminTelegramIds(
  prisma: PrismaClient,
  treeId: string,
): Promise<number[]> {
  // Get ADMIN TreeMembers with linked Telegram user
  const admins = await prisma.treeMember.findMany({
    where: { treeId, role: "ADMIN", status: "ACTIVE" },
    include: { user: { select: { telegramUserId: true } } },
  });

  const ids: number[] = [];
  for (const a of admins) {
    if (a.user?.telegramUserId) {
      ids.push(Number(a.user.telegramUserId));
    }
  }

  // Fallback: also check creator (may not have TreeMember row yet)
  if (ids.length === 0) {
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { creatorId: true },
    });
    if (tree?.creatorId) {
      const creator = await prisma.user.findUnique({
        where: { id: tree.creatorId },
        select: { telegramUserId: true },
      });
      if (creator?.telegramUserId) {
        ids.push(Number(creator.telegramUserId));
      }
    }
  }

  return ids;
}

async function notifyAdmins(
  bot: Bot<Context>,
  prisma: PrismaClient,
  treeId: string,
  message: string,
): Promise<void> {
  const adminIds = await getAdminTelegramIds(prisma, treeId);
  for (const tgId of adminIds) {
    try {
      await bot.api.sendMessage(tgId, message, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.warn(`[antiDdos] Failed to notify admin ${tgId}:`, err.message);
    }
  }
}

// ── Core Logic ──────────────────────────────────────────────────────────

/**
 * Check if a tree has exceeded its member limit and enforce the 3-strike policy.
 * Called on every group message (fire-and-forget).
 *
 * Phase 1 (standby): If exceeded and standby=false → set standby=true, blockedUntil = now+1h.
 *   Notify admin: "Tree has exceeded member limit. 1h grace period started."
 *
 * Phase 2 (leave): If exceed + standby=true + blockedUntil < now (1h expired) →
 *   leaveChat, leaveAttempts++, standby=false, blockedUntil=null.
 *   Notify admin: "Left group — member limit exceeded for >1h. Strike X/3."
 *
 * Phase 3 (block): If leaveAttempts >= 3 → blockedUntil = now + 90 days.
 *   Notify admin: "Blocked for 3 months after 3 strikes."
 */
export async function checkMemberLimit(
  prisma: PrismaClient,
  bot: Bot<Context>,
  treeId: string,
): Promise<void> {
  try {
    const state = await getTreeState(prisma, treeId);
    if (!state) return;

    const { memberCount, maxMembers, standby, leaveAttempts } = state;
    const chatId = state.telegramChatId;
    const now = new Date();

    // Not exceeded — nothing to do (reset standby if it was set but count dropped)
    if (memberCount <= maxMembers) {
      if (standby) {
        await prisma.tree.update({
          where: { id: treeId },
          data: { standby: false, blockedUntil: null },
        });
      }
      return;
    }

    // ── Exceeded ────────────────────────────────────────────────────────

    // Phase 3: already blocked for 3 months
    if (state.blockedUntil && state.blockedUntil > now && leaveAttempts >= 3) {
      return; // block is active, nothing to do
    }

    // Phase 2: standby grace period expired → execute leave
    if (standby && state.blockedUntil && state.blockedUntil <= now) {
      const newAttempts = leaveAttempts + 1;
      const isBlocked = newAttempts >= 3;

      if (chatId) {
        try {
          await bot.api.leaveChat(chatId);
          console.log(
            `[antiDdos] Left group ${chatId} (${state.name}) — strike ${newAttempts}/3`,
          );
        } catch (err: any) {
          console.warn(`[antiDdos] leaveChat failed for ${chatId}:`, err.message);
        }
      }

      const data: any = {
        standby: false,
        leaveAttempts: newAttempts,
        blockedUntil: null,
      };

      if (isBlocked) {
        data.blockedUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        data.telegramChatId = null; // unlink — tree is banned
      }

      await prisma.tree.update({ where: { id: treeId }, data });

      if (isBlocked) {
        await notifyAdmins(
          bot,
          prisma,
          treeId,
          `🚫 *Bloqueo Anti-DDoS activado*\n\nEl árbol *${state.name}* ha alcanzado 3 strikes por exceder el límite de ${maxMembers} miembros.\n\n⛔ Bloqueado por 3 meses.\nEl bot no aceptará invitaciones ni procesará mensajes de este árbol hasta ${data.blockedUntil.toISOString().split("T")[0]}.`,
        );
      } else {
        await notifyAdmins(
          bot,
          prisma,
          treeId,
          `⚠️ *Strike ${newAttempts}/3 — Límite de miembros excedido*\n\nEl árbol *${state.name}* superó el límite de ${maxMembers} miembros por más de 1 hora. El bot ha salido del grupo.\n\nPuedes re-agregar al bot, pero si vuelve a exceder el límite acumulará otro strike. Con 3 strikes, el árbol será bloqueado por 3 meses.`,
        );
      }
      return;
    }

    // Phase 1: first time exceeded → enter standby
    if (!standby) {
      const graceEnd = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
      await prisma.tree.update({
        where: { id: treeId },
        data: { standby: true, blockedUntil: graceEnd },
      });

      await notifyAdmins(
        bot,
        prisma,
        treeId,
        `⚠️ *Límite de miembros alcanzado*\n\nEl árbol *${state.name}* tiene ${memberCount}/${maxMembers} miembros y ha superado el límite.\n\n🕐 *1 hora de gracia*: si en 1 hora el número no baja de ${maxMembers}, el bot saldrá del grupo automáticamente. Esto contará como un strike (máximo 3, luego bloqueo de 3 meses).\n\nPara evitarlo, reduce la membresía o ajusta el límite con un admin.`,
      );

      console.log(
        `[antiDdos] Tree ${state.name} (${treeId}) entered standby: ${memberCount}/${maxMembers} members`,
      );
    }
  } catch (err: any) {
    console.error("[antiDdos] checkMemberLimit error:", err.message);
  }
}

/**
 * Check if the bot should reject an invitation to a group.
 * Called from my_chat_member handler when the bot is added to a group.
 *
 * Returns true if the invite should be rejected (bot should leave immediately).
 */
export async function shouldRejectInvite(
  prisma: PrismaClient,
  telegramChatId: string,
): Promise<{ reject: boolean; reason?: string }> {
  try {
    const tree = await prisma.tree.findUnique({
      where: { telegramChatId },
      select: {
        id: true,
        maxMembers: true,
        leaveAttempts: true,
        blockedUntil: true,
        standby: true,
        name: true,
      },
    });

    if (!tree) return { reject: false }; // new tree, no restrictions

    const now = new Date();

    // Blocked for 3 months → reject
    if (tree.blockedUntil && tree.blockedUntil > now && tree.leaveAttempts >= 3) {
      return {
        reject: true,
        reason: `blocked-3m (until ${tree.blockedUntil.toISOString().split("T")[0]})`,
      };
    }

    // In standby and still over limit → reject (prevents re-add during grace period)
    if (tree.standby) {
      const memberCount = await prisma.treeMember.count({
        where: { treeId: tree.id, status: "ACTIVE" },
      });
      if (memberCount > tree.maxMembers) {
        return {
          reject: true,
          reason: `standby-over-limit (${memberCount}/${tree.maxMembers})`,
        };
      }
    }

    return { reject: false };
  } catch (err: any) {
    console.error("[antiDdos] shouldRejectInvite error:", err.message);
    return { reject: false }; // fail open
  }
}

/**
 * Check if the tree is currently blocked and should ignore all messages.
 * Returns true if the bot should silently drop the message.
 */
export async function isTreeBlocked(
  prisma: PrismaClient,
  treeId: string,
): Promise<boolean> {
  try {
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { blockedUntil: true, leaveAttempts: true },
    });
    if (!tree?.blockedUntil) return false;

    const now = new Date();
    // Only active block (3-strike, not grace-period)
    if (tree.leaveAttempts >= 3 && tree.blockedUntil > now) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
