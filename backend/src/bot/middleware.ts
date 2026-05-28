/**
 * Middleware reusables para el bot de grammY.
 */

import { PrismaClient } from "@prisma/client";
import { BotContext } from "./types";
import { findTreeByChat } from "./treeResolver";

/**
 * Resuelve el árbol asociado al chat UNA vez y lo inyecta en ctx.tree.
 * Se coloca DESPUÉS del session middleware, ANTES de los handlers.
 *
 * Uso en handlers: const tree = ctx.tree;
 */
export function resolveTree(prisma: PrismaClient) {
  return async (ctx: BotContext, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id?.toString();
    if (chatId) {
      ctx.tree = await findTreeByChat(prisma, chatId);
    }
    return next();
  };
}
