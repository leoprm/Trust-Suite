import { prisma } from '../index';

// ── Core ethics functions for Protocolo Asimov ─────────────────────────

/**
 * Check if a TreeMember is an AI (not a human).
 * Returns the TreeMember record or null if not found.
 */
export async function getTreeMember(userId: string, treeId: string) {
  return prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { id: true, isAI: true, role: true },
  });
}

/**
 * Returns true if the user is a human member of the tree.
 */
export async function isHumanMember(userId: string, treeId: string): Promise<boolean> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return false;
  return !member.isAI;
}

/**
 * Enforce: "Un AI no evalúa a otro AI".
 * Checks that the rating user is a human member of any tree linked to the deliverable.
 */
export async function requireHumanToRate(userId: string, deliverableId: string): Promise<{ allowed: boolean; error?: string }> {
  // Find the deliverable and its branch's tree
  const deliverable = await prisma.phaseDeliverable.findUnique({
    where: { id: deliverableId },
    include: {
      branch: {
        include: { idea: { include: { need: { include: { treeLinks: true } } } } },
      },
    },
  });

  if (!deliverable) return { allowed: false, error: 'Deliverable not found' };

  // Get all tree IDs linked
  const treeIds: string[] = [];
  if (deliverable.branch.treeId) {
    treeIds.push(deliverable.branch.treeId);
  }
  if (deliverable.branch.idea?.need?.treeLinks) {
    for (const link of deliverable.branch.idea.need.treeLinks) {
      if (!treeIds.includes(link.treeId)) treeIds.push(link.treeId);
    }
  }

  if (treeIds.length === 0) {
    return { allowed: false, error: 'No tree context found for this deliverable' };
  }

  // Check if user is an AI in ANY of these trees
  for (const treeId of treeIds) {
    const member = await getTreeMember(userId, treeId);
    if (member?.isAI) {
      return { allowed: false, error: 'Protocolo Asimov: Un AI no puede evaluar deliverables. Solo humanos pueden emitir SatisfactionRatings.' };
    }
  }

  // Also check: user must be a member of at least one of these trees
  const memberInAnyTree = treeIds.some(async (tid) => {
    const m = await getTreeMember(userId, tid);
    return m !== null;
  });
  // (membership check is already done elsewhere, this is just the AI gate)

  return { allowed: true };
}

/**
 * Enforce: "Un AI no es firmante multi-sig".
 * Check before adding a signer.
 */
export async function requireHumanToSign(treeId: string, userId: string): Promise<{ allowed: boolean; error?: string }> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return { allowed: false, error: 'User is not a member of this tree' };
  if (member.isAI) {
    return { allowed: false, error: 'Protocolo Asimov: Un AI no puede ser firmante multi-sig. Solo humanos pueden ser TreeSigners.' };
  }
  return { allowed: true };
}

/**
 * Enforce: "Un AI no vota en gobernanza" (IdeaLike / BranchNeedVote).
 */
export async function requireHumanToVote(userId: string, treeId: string): Promise<{ allowed: boolean; error?: string }> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return { allowed: false, error: 'User is not a member of this tree' };
  if (member.isAI) {
    return { allowed: false, error: 'Protocolo Asimov: Un AI no puede votar en gobernanza. Solo humanos pueden emitir votos.' };
  }
  return { allowed: true };
}

/**
 * Enforce: "Un AI no crea Needs".
 */
export async function requireHumanToCreateNeed(userId: string, treeId: string): Promise<{ allowed: boolean; error?: string }> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return { allowed: false, error: 'User is not a member of this tree' };
  if (member.isAI) {
    return { allowed: false, error: 'Protocolo Asimov: Un AI no puede crear Needs. El punto de partida de la economía debe ser humano.' };
  }
  return { allowed: true };
}

/**
 * Enforce: "Un AI no es ADMIN ni CREATOR de un Tree".
 * Check before creating a tree or assigning admin role.
 */
export async function requireHumanForTreeAdmin(userId: string, treeId: string): Promise<{ allowed: boolean; error?: string }> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return { allowed: false, error: 'User is not a member of this tree' };
  if (member.isAI) {
    return { allowed: false, error: 'Protocolo Asimov: Un AI no puede ser administrador ni creador de un Tree.' };
  }
  return { allowed: true };
}

/**
 * Universal check: given a userId and treeId, blocks any action
 * that requires human-only participation if the user is an AI.
 */
export async function requireHumanForAction(
  userId: string,
  treeId: string,
  action: string,
): Promise<{ allowed: boolean; error?: string }> {
  const member = await getTreeMember(userId, treeId);
  if (!member) return { allowed: false, error: 'Not a member of this tree' };
  if (member.isAI) {
    const messages: Record<string, string> = {
      RATE: 'Protocolo Asimov: Un AI no puede evaluar. Solo humanos pueden emitir SatisfactionRatings.',
      SIGN: 'Protocolo Asimov: Un AI no puede ser firmante multi-sig.',
      VOTE: 'Protocolo Asimov: Un AI no puede votar en gobernanza.',
      CREATE_NEED: 'Protocolo Asimov: Un AI no puede crear Needs.',
      TREE_ADMIN: 'Protocolo Asimov: Un AI no puede ser administrador ni creador de un Tree.',
    };
    return { allowed: false, error: messages[action] || `Protocolo Asimov: Acción "${action}" restringida para humanos.` };
  }
  return { allowed: true };
}
