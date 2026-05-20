import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import { logEvent, getRequestContext } from '../services/eventLogService';
import { checkApiKey } from './treeSandboxController';

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/trees/:id/vault/report
// Body: { treeId, reportDate, content, childrenReports?, force? }
//
// Deposits a child tree's report into the parent tree's vault.
// The child Ari calls this with the master API key — it never touches the
// parent's filesystem directly.
// ═══════════════════════════════════════════════════════════════════════════════
export const submitVaultReport = async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;

  try {
    const parentTreeId = req.params.id as string;
    const { treeId: childTreeId, reportDate, content, childrenReports, force } = req.body;

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

    // ── Verify child-parent relationship ────────────────────────────────────
    if (childTreeId === parentTreeId) {
      return res.status(400).json({ error: 'treeId cannot be the same as the parent treeId' });
    }

    const childTree = await prisma.tree.findUnique({
      where: { id: childTreeId },
      select: { id: true, parentTreeId: true },
    });

    if (!childTree) {
      return res.status(404).json({ error: 'Publishing tree not found' });
    }

    if (childTree.parentTreeId !== parentTreeId) {
      return res.status(403).json({
        error: 'Publishing tree is not a direct child of the destination tree',
        expectedParent: parentTreeId,
        actualParent: childTree.parentTreeId,
      });
    }

    // ── Verify parent tree exists ──────────────────────────────────────────
    const parentTree = await prisma.tree.findUnique({
      where: { id: parentTreeId },
      select: { id: true },
    });

    if (!parentTree) {
      return res.status(404).json({ error: 'Destination tree not found' });
    }

    // ── Build sandbox path ─────────────────────────────────────────────────
    const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || '/home/trustmaker/trees';
    const reportsDir = path.join(SANDBOX_BASE, parentTreeId, 'reports');
    const reportPath = path.join(reportsDir, `${reportDate}.md`);

    // ── Don't overwrite without confirmation ───────────────────────────────
    if (fs.existsSync(reportPath) && !force) {
      return res.status(409).json({
        error: 'Report already exists for this date. Use force=true to overwrite.',
        path: reportPath,
      });
    }

    // ── Prepare content with metadata ──────────────────────────────────────
    const metadataHeader = [
      '<!--',
      `  publisher: ${childTreeId}`,
      `  reportDate: ${reportDate}`,
      `  depositedAt: ${new Date().toISOString()}`,
      childrenReports && Array.isArray(childrenReports) && childrenReports.length > 0
        ? `  childrenReports: [${childrenReports.join(', ')}]`
        : '',
      '-->',
      '',
    ].filter(l => l !== '').join('\n');

    let bodyContent = content;
    if (childrenReports && Array.isArray(childrenReports) && childrenReports.length > 0) {
      bodyContent += `\n\n---\n## Children Reports\n\n`;
      for (const childId of childrenReports) {
        bodyContent += `- ${childId}\n`;
      }
    }

    const finalContent = metadataHeader + bodyContent;

    // ── Write file ─────────────────────────────────────────────────────────
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(reportPath, finalContent, 'utf-8');

    // ── Log event ──────────────────────────────────────────────────────────
    void logEvent({
      ...getRequestContext(req),
      treeId: parentTreeId,
      action: 'VAULT_REPORT_DEPOSIT',
      entityType: 'TreeVault',
      entityId: parentTreeId,
      source: 'SYSTEM',
      metadataJson: {
        publisherTreeId: childTreeId,
        reportDate,
        childrenReportsCount: childrenReports?.length || 0,
        overwritten: !!force,
      },
    });

    console.log(`[vault] Report deposited: ${reportDate}.md (child=${childTreeId} → parent=${parentTreeId})`);

    res.status(201).json({
      success: true,
      path: reportPath,
      reportDate,
    });
  } catch (error: any) {
    console.error('[postVaultReport] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Report deposit failed', detail: error?.message });
  }
};
