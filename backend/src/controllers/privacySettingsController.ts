import { Response } from 'express';
import { prisma } from '../index';
import {
  getOrCreatePrivacySettings,
  isVisibilityLevel,
  DEFAULT_PRIVACY_SETTINGS,
} from '../utils/privacy';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const RESPONSE_SELECT = {
  id: true,
  userId: true,
  traceProfileVisibility: true,
  taskHistoryVisibility: true,
  evidenceVisibility: true,
  showInTalentSearch: true,
  allowAggregatedMetrics: true,
  createdAt: true,
  updatedAt: true,
};

export const getMyPrivacySettings = async (req: any, res: Response) => {
  try {
    const settings = await getOrCreatePrivacySettings(req.user.id);
    res.json(settings);
  } catch (error: any) {
    console.error('[getMyPrivacySettings]', error);
    res.status(500).json({ error: 'Error al cargar configuracion de privacidad' });
  }
};

export const updateMyPrivacySettings = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const {
      traceProfileVisibility,
      taskHistoryVisibility,
      evidenceVisibility,
      showInTalentSearch,
      allowAggregatedMetrics,
    } = req.body || {};

    const data: Record<string, any> = {};

    if (traceProfileVisibility !== undefined) {
      if (!isVisibilityLevel(traceProfileVisibility)) {
        return res.status(400).json({ error: 'traceProfileVisibility invalido' });
      }
      data.traceProfileVisibility = traceProfileVisibility;
    }

    if (taskHistoryVisibility !== undefined) {
      if (!isVisibilityLevel(taskHistoryVisibility)) {
        return res.status(400).json({ error: 'taskHistoryVisibility invalido' });
      }
      data.taskHistoryVisibility = taskHistoryVisibility;
    }

    if (evidenceVisibility !== undefined) {
      if (!isVisibilityLevel(evidenceVisibility)) {
        return res.status(400).json({ error: 'evidenceVisibility invalido' });
      }
      data.evidenceVisibility = evidenceVisibility;
    }

    if (showInTalentSearch !== undefined) {
      if (typeof showInTalentSearch !== 'boolean') {
        return res.status(400).json({ error: 'showInTalentSearch debe ser booleano' });
      }
      data.showInTalentSearch = showInTalentSearch;
    }

    if (allowAggregatedMetrics !== undefined) {
      if (typeof allowAggregatedMetrics !== 'boolean') {
        return res.status(400).json({ error: 'allowAggregatedMetrics debe ser booleano' });
      }
      data.allowAggregatedMetrics = allowAggregatedMetrics;
    }

    if (Object.keys(data).length === 0) {
      const current = await getOrCreatePrivacySettings(userId);
      return res.json(current);
    }

    const before = await (prisma as any).privacySettings.findUnique({
      where: { userId },
      select: RESPONSE_SELECT,
    });

    const updated = await (prisma as any).privacySettings.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_PRIVACY_SETTINGS,
        ...data,
      },
      update: data,
      select: RESPONSE_SELECT,
    });

    const userSyncData: Record<string, any> = {};
    if (data.traceProfileVisibility !== undefined) {
      userSyncData.publicProfileEnabled = data.traceProfileVisibility === 'PUBLIC';
    }
    if (data.taskHistoryVisibility !== undefined) {
      userSyncData.publicShowTaskHistory = data.taskHistoryVisibility === 'PUBLIC';
    }
    if (data.showInTalentSearch !== undefined) {
      userSyncData.visibleForRecruitment = data.showInTalentSearch;
    }

    if (Object.keys(userSyncData).length > 0) {
      await (prisma as any).user.update({
        where: { id: userId },
        data: userSyncData,
      });
    }

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'PRIVACY_SETTINGS_UPDATED',
      entityType: 'PrivacySettings',
      entityId: updated.id,
      beforeJson: before,
      afterJson: updated,
      metadataJson: getRequestMetadata(req, { changedFields: Object.keys(data), result: 'success' }),
      source: 'USER',
    });

    if (data.traceProfileVisibility !== undefined) {
      void logEvent({
        ...getRequestContext(req),
        actorId: userId,
        action: 'TRACE_PROFILE_VISIBILITY_CHANGED',
        entityType: 'PrivacySettings',
        entityId: updated.id,
        beforeJson: { traceProfileVisibility: before?.traceProfileVisibility ?? DEFAULT_PRIVACY_SETTINGS.traceProfileVisibility },
        afterJson: { traceProfileVisibility: updated.traceProfileVisibility },
        metadataJson: getRequestMetadata(req, { result: 'success' }),
        source: 'USER',
      });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[updateMyPrivacySettings]', error);
    res.status(500).json({ error: 'Error al guardar configuracion de privacidad' });
  }
};
