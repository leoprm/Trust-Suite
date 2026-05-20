import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { checkApiKey } from './treeSandboxController';

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/trees/:id/vault/report
// Body: { treeId, reportDate, content, reportType?, userId?, force? }
//
// XR-6: Any descendant can deposit reports into an ancestor's vault.
// Walks parentTreeId up to verify ancestry — not just direct parent.
//
// reportType: 'tree' (default) → tree_<id>.md
//             'person'        → persona_<userId>.md  (requires userId field)
//
// File structure:
//   <SANDBOX_BASE>/<rootTreeId>/reports/<YYYY-MM>/tree_<id>.md
//   <SANDBOX_BASE>/<rootTreeId>/reports/<YYYY-MM>/persona_<userId>.md
// ═══════════════════════════════════════════════════════════════════════════════

/** Walk parentTreeId upward from treeId to check if ancestorId is in the chain. */
async function isAncestorOf(ancestorId: string, descendantId: string): Promise<boolean> {
  if (ancestorId === descendantId) return true; // self is trivially an ancestor

  const MAX_DEPTH = 50; // safety limit — trees shouldn't be this deep
  let currentId = descendantId;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const tree = await prisma.tree.findUnique({
      where: { id: currentId },
      select: { parentTreeId: true },
    });

    if (!tree) return false; // chain broken
    if (!tree.parentTreeId) return false; // reached root, not found
    if (tree.parentTreeId === ancestorId) return true;

    currentId = tree.parentTreeId;
  }

  console.warn(`[vault] Max depth (${MAX_DEPTH}) exceeded walking from ${descendantId}`);
  return false;
}

export const submitVaultReport = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const ancestorTreeId = req.params.id as string;
    const {
      treeId: childTreeId,
      reportDate,
      content,
      reportType,
      userId,
      force,
    } = req.body;

    // ── Validate body ──────────────────────────────────────────────────────
    if (!childTreeId || typeof childTreeId !== 'string') {
      return res.status(400).json({ error: 'treeId is required (string)' });
    }
    if (!reportDate || typeof reportDate !== 'string') {
      return res.status(400).json({ error: 'reportDate is required (string)' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required (string)' });
    }

    const type = reportType === 'person' ? 'person' : 'tree';

    if (type === 'person' && (!userId || typeof userId !== 'string')) {
      return res.status(400).json({
        error: 'userId is required (string) when reportType is "person"',
      });
    }

    // ── Verify descendant-ancestor relationship ────────────────────────────
    if (childTreeId === ancestorTreeId) {
      return res.status(400).json({
        error: 'treeId cannot be the same as the vault treeId. Use sandbox write for self-deposits.',
      });
    }

    const childTree = await prisma.tree.findUnique({
      where: { id: childTreeId },
      select: { id: true, parentTreeId: true },
    });

    if (!childTree) {
      return res.status(404).json({ error: 'Publishing tree not found' });
    }

    // XR-6: Walk up parentId to verify ancestor relationship
    const isDescendant = await isAncestorOf(ancestorTreeId, childTreeId);
    if (!isDescendant) {
      return res.status(403).json({
        error: 'Publishing tree is not a descendant of the destination tree',
        vaultTreeId: ancestorTreeId,
        publisherTreeId: childTreeId,
      });
    }

    // ── Verify ancestor tree exists ────────────────────────────────────────
    const ancestorTree = await prisma.tree.findUnique({
      where: { id: ancestorTreeId },
      select: { id: true },
    });

    if (!ancestorTree) {
      return res.status(404).json({ error: 'Destination tree not found' });
    }

    // ── Build sandbox path ─────────────────────────────────────────────────
    const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/trustmaker/trees';
    const reportsDir = path.join(SANDBOX_BASE, ancestorTreeId, 'reports', reportDate);

    // XR-6: tree_<id>.md for trees, persona_<userId>.md for persons
    let fileName: string;
    if (type === 'person') {
      fileName = `persona_${userId}.md`;
    } else {
      fileName = `tree_${childTreeId}.md`;
    }

    const reportPath = path.join(reportsDir, fileName);

    // ── Don't overwrite without confirmation ───────────────────────────────
    if (fs.existsSync(reportPath) && !force) {
      return res.status(409).json({
        error: `Report already exists for this ${type}. Use force=true to overwrite.`,
        path: reportPath,
      });
    }

    // ── Prepare content with metadata ──────────────────────────────────────
    const metadataHeader = [
      '<!--',
      `  publisher: ${childTreeId}`,
      `  reportDate: ${reportDate}`,
      `  reportType: ${type}`,
      type === 'person' ? `  userId: ${userId}` : '',
      `  depositedAt: ${new Date().toISOString()}`,
      '-->',
      '',
    ].filter(l => l !== '').join('\n');

    const finalContent = metadataHeader + content;

    // ── Write file ─────────────────────────────────────────────────────────
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(reportPath, finalContent, 'utf-8');

    // ── Log event ──────────────────────────────────────────────────────────
    void logEvent({
      ...getRequestContext(req),
      treeId: ancestorTreeId,
      action: 'VAULT_REPORT_DEPOSIT',
      entityType: 'TreeVault',
      entityId: ancestorTreeId,
      source: 'SYSTEM',
      metadataJson: {
        publisherTreeId: childTreeId,
        reportDate,
        reportType: type,
        userId: userId || null,
        overwritten: !!force,
      },
    });

    console.log(
      `[vault] Report deposited: ${fileName} ` +
      `(${type} ${childTreeId} → ancestor ${ancestorTreeId})`,
    );

    res.status(201).json({
      success: true,
      path: reportPath,
      reportDate,
      reportType: type,
      fileName,
    });
  } catch (error: any) {
    console.error('[postVaultReport] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Report deposit failed', detail: error?.message });
  }
};
