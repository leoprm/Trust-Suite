import { Request, Response } from 'express';
import { canExportTree, exportTree, exportUserProfile, TrustExport } from '../services/exportService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

function countExportEntities(trustExport: TrustExport) {
  const data = trustExport.data as any;
  if (trustExport.exportType === 'PROFILE') {
    return {
      memberships: data?.memberships?.length ?? 0,
      completedTasks: data?.completedTasks?.length ?? 0,
      auditsPerformed: data?.audits?.performed?.length ?? 0,
      evidenceMetadata: data?.uploadedEvidenceMetadata?.length ?? 0,
    };
  }

  return {
    members: data?.members?.length ?? 0,
    needs: data?.needs?.length ?? 0,
    ideas: data?.ideas?.length ?? 0,
    branches: data?.branches?.length ?? 0,
    tasks: data?.tasks?.length ?? 0,
    audits: data?.audits?.length ?? 0,
    evidenceMetadata: data?.evidenceMetadata?.length ?? 0,
    fiatTransactions: data?.fiatTransactions?.length ?? 0,
    eventLogs: data?.recentEventLogs?.length ?? 0,
  };
}

function sendJsonExport(res: Response, trustExport: TrustExport, filename: string) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).json(trustExport);
}

function isoDateSlug() {
  return new Date().toISOString().slice(0, 10);
}

export const exportMyProfile = async (req: Request, res: Response) => {
  const context = getRequestContext(req);

  try {
    if (!req.user?.id) {
      void logEvent({
        ...context,
        action: 'PROFILE_EXPORT_DENIED',
        entityType: 'User',
        metadataJson: getRequestMetadata(req, { reason: 'missing_auth_user' }),
        severity: 'WARNING',
      });
      return res.status(401).json({ error: 'auth required' });
    }

    void logEvent({
      ...context,
      action: 'PROFILE_EXPORT_REQUESTED',
      entityType: 'User',
      entityId: req.user.id,
      metadataJson: getRequestMetadata(req, { exportType: 'PROFILE' }),
    });

    const profileExport = await exportUserProfile(req.user.id, req.user.role);

    void logEvent({
      ...context,
      action: 'PROFILE_EXPORT_GENERATED',
      entityType: 'User',
      entityId: req.user.id,
      metadataJson: getRequestMetadata(req, {
        exportType: 'PROFILE',
        schemaVersion: profileExport.schemaVersion,
        generatedAt: profileExport.generatedAt,
        counts: countExportEntities(profileExport),
        omitted: profileExport.omitted,
      }),
    });

    return sendJsonExport(res, profileExport, `trust-profile-export-${isoDateSlug()}.json`);
  } catch (error) {
    console.error('[exportMyProfile]', error);
    res.status(500).json({ error: 'Failed to export profile' });
  }
};

export const exportTreeData = async (req: Request, res: Response) => {
  const context = getRequestContext(req);
  const treeId = String(req.params.treeId || '');

  try {
    if (!req.user?.id) return res.status(401).json({ error: 'auth required' });
    if (!treeId) return res.status(400).json({ error: 'treeId is required' });

    void logEvent({
      ...context,
      treeId,
      action: 'TREE_EXPORT_REQUESTED',
      entityType: 'Tree',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, { exportType: 'TREE' }),
      source: 'ADMIN',
    });

    const allowed = await canExportTree(treeId, req.user.id, req.user.role);
    if (!allowed) {
      void logEvent({
        ...context,
        treeId,
        action: 'TREE_EXPORT_DENIED',
        entityType: 'Tree',
        entityId: treeId,
        metadataJson: getRequestMetadata(req, { reason: 'tree_admin_required', exportType: 'TREE' }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(403).json({ error: 'Only Tree admins or owners can export this Tree' });
    }

    const treeExport = await exportTree(treeId, req.user.id, req.user.role);

    void logEvent({
      ...context,
      treeId,
      action: 'TREE_EXPORT_GENERATED',
      entityType: 'Tree',
      entityId: treeId,
      metadataJson: getRequestMetadata(req, {
        exportType: 'TREE',
        schemaVersion: treeExport.schemaVersion,
        generatedAt: treeExport.generatedAt,
        counts: countExportEntities(treeExport),
        omitted: treeExport.omitted,
      }),
      source: 'ADMIN',
    });

    return sendJsonExport(res, treeExport, `trust-tree-${treeId}-export-${isoDateSlug()}.json`);
  } catch (error) {
    console.error('[exportTreeData]', error);
    res.status(500).json({ error: 'Failed to export Tree' });
  }
};
