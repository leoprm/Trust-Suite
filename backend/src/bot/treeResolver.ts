import { prisma } from "../index";

/**
 * Busca un Tree por su telegramChatId.
 * Retorna null si no existe — el caller decide si ignorar o crear.
 */
export async function findTreeByChatId(chatId: number) {
  const id = String(chatId);
  return prisma.tree.findUnique({ where: { telegramChatId: id } });
}

/**
 * Busca o crea un Tree para un chat de Telegram.
 * Si ya existe, lo retorna. Si no, lo crea con el nombre del grupo.
 */
export async function resolveTreeByChatId(
  chatId: number,
  chatTitle: string
) {
  const id = String(chatId);

  const existing = await prisma.tree.findUnique({
    where: { telegramChatId: id },
  });
  if (existing) return existing;

  return prisma.tree.create({
    data: {
      name: chatTitle,
      telegramChatId: id,
      admissionPolicy: "OPEN",
      icono: "💬",
    },
  });
}
