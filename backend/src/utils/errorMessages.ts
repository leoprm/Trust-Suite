import { PrismaClient } from '@prisma/client';

export const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  es: {
    parent_tree_membership_required:
      'Debes ser miembro del árbol padre para crear un sub-árbol',
    invalid_or_expired_link:
      'Enlace inválido o no encontrado',
    invitation_processing_failed:
      'No se pudo procesar tu invitación.',
  },
  en: {
    parent_tree_membership_required:
      'You must be a member of the parent tree to create a sub-tree',
    invalid_or_expired_link:
      'Invalid or expired link',
    invitation_processing_failed:
      'Could not process your invitation.',
  },
  pt: {
    parent_tree_membership_required:
      'Você deve ser membro da árvore pai para criar uma sub-árvore',
    invalid_or_expired_link:
      'Link inválido ou não encontrado',
    invitation_processing_failed:
      'Não foi possível processar seu convite.',
  },
};

const VALID_LANGS = new Set(['es', 'en', 'pt']);
const DEFAULT_LANG = 'es';

export async function getErrorMessage(
  prisma: PrismaClient,
  key: string,
  treeId?: string | null,
): Promise<string> {
  let lang = DEFAULT_LANG;

  if (treeId) {
    try {
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { language: true },
      });
      if (tree?.language && VALID_LANGS.has(tree.language)) {
        lang = tree.language;
      }
    } catch {
      // DB unavailable — fall through to default language
    }
  }

  return ERROR_MESSAGES[lang]?.[key] ?? ERROR_MESSAGES[DEFAULT_LANG][key] ?? key;
}
