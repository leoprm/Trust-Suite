// Schedule: 0 0 1 * * (1st of each month, 00:00 UTC)
// Generates audit reports for all AI_COUNCIL trees and notifies creators.

import cron from 'node-cron';
import { prisma } from '../index';

export function startAICouncilAuditCron() {
  cron.schedule('0 0 1 * *', async () => {
    console.log('[AICouncilAudit] Starting monthly audit...');
    try {
      const trees = await prisma.tree.findMany({
        where: { treeType: 'AI_COUNCIL' },
      });

      for (const tree of trees) {
        try {
          const needs = await prisma.need.findMany({
            where: {
              treeLinks: { some: { treeId: tree.id } },
              status: { not: 'RESOLVED' },
            },
            orderBy: { importanceScore: 'desc' },
            include: {
              importanceVotes: true,
              creator: { select: { username: true } },
            },
          });

          const report = {
            generatedAt: new Date().toISOString(),
            treeId: tree.id,
            treeName: tree.name,
            needs: needs.map((n: any) => ({
              id: n.id,
              title: n.title,
              description: n.description,
              importanceScore: n.importanceScore,
              voteCount: n.importanceVotes.length,
              externalReferences: n.externalReferences,
              auditStatus: n.auditStatus,
              status: n.status,
            })),
          };

          // Store cached report
          await prisma.tree.update({
            where: { id: tree.id },
            data: {
              auditReportJson: report as any,
              lastAuditGeneratedAt: new Date(),
            },
          });

          // Notify creator
          const topNeedTitle = report.needs[0]?.title || 'none';
          const topScore = report.needs[0]?.importanceScore || 0;
          await prisma.notification.create({
            data: {
              userId: tree.creatorId!,
              type: 'GENERAL',
              category: 'FLUJO',
              title: `Monthly AI Council Audit: ${tree.name}`,
              body: `${report.needs.length} needs ranked. Top: ${topNeedTitle} (score: ${topScore})`,
              entityType: 'arbol',
              entityId: tree.id,
            },
          });

          console.log(`[AICouncilAudit] Report generated for tree "${tree.name}" (${tree.id}): ${needs.length} needs`);
        } catch (err: any) {
          console.error(`[AICouncilAudit] Error generating report for tree ${tree.id}:`, err?.message || err);
        }
      }

      console.log(`[AICouncilAudit] Monthly audit complete — ${trees.length} trees processed`);
    } catch (err: any) {
      console.error('[AICouncilAudit] Fatal cron error:', err?.message || err);
    }
  });

  console.log('[AICouncilAudit] Cron scheduled: 0 0 1 * *');
}
