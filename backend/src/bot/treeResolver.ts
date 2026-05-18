/**
 * Resolución de árbol asociado a un chat de Telegram.
 * Módulo compartido entre commands.ts y messages.ts.
 */

import { PrismaClient } from "@prisma/client";

/** Información resumida del árbol para el bot. */
export interface TreeInfo {
  id: string;
  name: string;
  icono: string;
  description: string | null;
  admissionPolicy: string;
  creatorId: string | null;
  code: string | null;
  memberCount: number;
  needCount: number;
  openNeedCount: number;
  ideaCount: number;
}

/**
 * Busca el árbol asociado al chat de Telegram.
 * Retorna null si no hay árbol vinculado.
 */
export async function findTreeByChat(
  prisma: PrismaClient,
  telegramChatId: string
): Promise<TreeInfo | null> {
  const tree = await (prisma as any).tree.findUnique({
    where: { telegramChatId },
    include: {
      _count: {
        select: {
          members: true,
          needs: true,
          ratings: true,
        },
      },
    },
  });

  if (!tree) return null;

  const openNeedCount = await (prisma as any).need.count({
    where: { treeId: tree.id, status: "OPEN" },
  });

  // Count ideas linked to needs in this tree
  const ideaCount = await (prisma as any).needIdea.count({
    where: { need: { treeId: tree.id } },
  });

  return {
    id: tree.id,
    name: tree.name,
    icono: tree.icono,
    description: tree.description,
    admissionPolicy: tree.admissionPolicy,
    creatorId: tree.creatorId,
    code: tree.code,
    memberCount: tree._count.members,
    needCount: tree._count.needs,
    openNeedCount,
    ideaCount,
  };
}

/**
 * Busca un árbol por su código corto (ej: ABC123).
 * Retorna nombre si existe, null si no.
 */
export async function findTreeByCode(
  prisma: PrismaClient,
  code: string
): Promise<{ id: string; name: string } | null> {
  const tree = await (prisma as any).tree.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, name: true },
  });
  return tree ?? null;
}
