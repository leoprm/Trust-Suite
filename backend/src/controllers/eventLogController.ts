import { Request, Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const ALLOWED_SEVERITIES = new Set(['INFO', 'WARNING', 'CRITICAL']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function getPagination(req: Request) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const rawLimit = Number(req.query.limit || DEFAULT_LIMIT);
  const limit = Math.min(Math.max(rawLimit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function canViewTreeLogs(req: Request, treeId: string): Promise<boolean> {
  if (req.user?.role === 'ADMINISTRATOR') return true;
  if (!req.user?.id) return false;

  const tree = await (prisma as any).tree.findUnique({
    where: { id: treeId },
    select: {
      creatorId: true,
      members: {
        where: { userId: req.user.id },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!tree) return false;
  return tree.creatorId === req.user.id || tree.members.some((member: any) => member.role === 'ADMIN');
}

function buildFilters(req: Request, extraWhere: Record<string, unknown>) {
  const action = asString(req.query.action);
  const entityType = asString(req.query.entityType);
  const actorId = asString(req.query.actorId);
  const severity = asString(req.query.severity);
  const dateFrom = asString(req.query.dateFrom);
  const dateTo = asString(req.query.dateTo);

  const where: Record<string, unknown> = { ...extraWhere };
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (severity && ALLOWED_SEVERITIES.has(severity)) where.severity = severity;

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  return where;
}

async function fetchLogs(req: Request, where: Record<string, unknown>) {
  const { page, limit, skip } = getPagination(req);
  const [items, total] = await Promise.all([
    (prisma as any).eventLog.findMany({
      where,
      include: { actor: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    (prisma as any).eventLog.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export const getTreeEventLogs = async (req: Request, res: Response) => {
  try {
    const treeId = asString(req.params.treeId);
    if (!treeId) return res.status(400).json({ error: 'treeId is required' });

    const allowed = await canViewTreeLogs(req, treeId);
    if (!allowed) {
      const context = getRequestContext(req);
      void logEvent({
        ...context,
        treeId,
        action: 'PERMISSION_DENIED',
        entityType: 'EventLog',
        metadataJson: getRequestMetadata(req, { reason: 'tree_event_log_access_denied' }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(403).json({ error: 'Not allowed to view tree event logs' });
    }

    res.json(await fetchLogs(req, buildFilters(req, { treeId })));
  } catch (error) {
    console.error('[getTreeEventLogs]', error);
    res.status(500).json({ error: 'Failed to fetch event logs' });
  }
};

export const getEntityEventLogs = async (req: Request, res: Response) => {
  try {
    const entityType = asString(req.params.entityType);
    const entityId = asString(req.params.entityId);
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });

    const baseWhere = { entityType, entityId };
    const first = await (prisma as any).eventLog.findFirst({
      where: baseWhere,
      select: { treeId: true },
      orderBy: { createdAt: 'desc' },
    });

    const explicitTreeId = asString(req.query.treeId);
    const treeId = explicitTreeId || first?.treeId;
    const allowed = treeId ? await canViewTreeLogs(req, treeId) : req.user?.role === 'ADMINISTRATOR';

    if (!allowed) {
      const context = getRequestContext(req);
      void logEvent({
        ...context,
        treeId: treeId ?? null,
        action: 'PERMISSION_DENIED',
        entityType: 'EventLog',
        entityId,
        metadataJson: getRequestMetadata(req, { reason: 'entity_event_log_access_denied', requestedEntityType: entityType }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(403).json({ error: 'Not allowed to view entity event logs' });
    }

    res.json(await fetchLogs(req, buildFilters(req, { ...baseWhere, ...(treeId ? { treeId } : {}) })));
  } catch (error) {
    console.error('[getEntityEventLogs]', error);
    res.status(500).json({ error: 'Failed to fetch entity event logs' });
  }
};

export const getMyEventLogs = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'auth required' });
    res.json(await fetchLogs(req, buildFilters(req, { actorId: req.user.id })));
  } catch (error) {
    console.error('[getMyEventLogs]', error);
    res.status(500).json({ error: 'Failed to fetch own event logs' });
  }
};
