import { Request, Response } from 'express';
import { prisma } from '../index';

import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

export async function getWallet(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    // ── All tree memberships for this user ──────────────────────────────
    const memberships = await prisma.treeMember.findMany({
      where: { userId },
      include: {
        tree: {
          select: {
            id: true,
            name: true,
            financingMode: true,
            subscriptionAmount: true,
            subscriptionCurrency: true,
          },
        },
      },
    });

    if (memberships.length === 0) {
      return res.json({
        fiatBalance: { total: 0, byTree: [] },
        berriesBalance: { total: 0, byTree: [] },
        subscriptions: [],
        recentTransactions: [],
      });
    }

    const treeIds = memberships.map((m) => m.treeId);

    // ── Fiat balance: INCOME adds, EXPENSE subtracts ────────────────────
    const fiatTx = await prisma.fiatTransaction.findMany({
      where: {
        createdById: userId,
        treeId: { in: treeIds },
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      select: { treeId: true, type: true, amount: true },
    });

    const fiatByTree: Record<string, number> = {};
    for (const ft of fiatTx) {
      if (!fiatByTree[ft.treeId]) fiatByTree[ft.treeId] = 0;
      fiatByTree[ft.treeId] += ft.type === 'INCOME' ? ft.amount : -ft.amount;
    }

    // ── Berries balance from TreeMember.bayasBalance ────────────────────
    const berriesByTree = memberships.map((m) => ({
      treeId: m.treeId,
      treeName: m.tree.name,
      balance: m.bayasBalance,
    }));

    // ── Subscriptions ───────────────────────────────────────────────────
    const subscriptions = memberships
      .filter(
        (m) =>
          m.isPayingMember ||
          m.tree.financingMode !== 'GRATUITO',
      )
      .map((m) => ({
        treeId: m.treeId,
        treeName: m.tree.name,
        financingMode: m.tree.financingMode,
        subscriptionAmount: m.tree.subscriptionAmount,
        subscriptionCurrency: m.tree.subscriptionCurrency,
        isPayingMember: m.isPayingMember,
        status: m.subscriptionStatus,
      }));

    // ── Recent transactions (last 5, fiat + berries merged) ─────────────
    const [recentFiat, recentBerries] = await Promise.all([
      prisma.fiatTransaction.findMany({
        where: { createdById: userId, treeId: { in: treeIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          treeId: true,
          amount: true,
          currency: true,
          type: true,
          category: true,
          description: true,
          createdAt: true,
          tree: { select: { name: true } },
        },
      }),
      prisma.berryTransaction.findMany({
        where: { userId, treeId: { in: treeIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          treeId: true,
          amount: true,
          type: true,
          description: true,
          createdAt: true,
          tree: { select: { name: true } },
        },
      }),
    ]);

    const recentTransactions = [
      ...recentFiat.map((t) => ({
        id: t.id,
        treeId: t.treeId,
        treeName: t.tree.name,
        kind: 'fiat' as const,
        amount: t.amount,
        currency: t.currency,
        type: t.type,
        category: t.category,
        description: t.description,
        createdAt: t.createdAt,
      })),
      ...recentBerries.map((t) => ({
        id: t.id,
        treeId: t.treeId,
        treeName: t.tree.name,
        kind: 'berries' as const,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    // ── Build response ──────────────────────────────────────────────────
    const fiatTotal = Object.values(fiatByTree).reduce((sum, v) => sum + v, 0);
    const berriesTotal = berriesByTree.reduce((sum, t) => sum + t.balance, 0);

    const round = (n: number) => Math.round(n * 100) / 100;

    return res.json({
      fiatBalance: {
        total: round(fiatTotal),
        byTree: Object.entries(fiatByTree)
          .map(([treeId, balance]) => ({
            treeId,
            treeName: memberships.find((m) => m.treeId === treeId)?.tree.name ?? '',
            balance: round(balance),
          }))
          .filter((e) => e.balance !== 0),
      },
      berriesBalance: {
        total: round(berriesTotal),
        byTree: berriesByTree
          .map((b) => ({ ...b, balance: round(b.balance) }))
          .filter((b) => b.balance !== 0),
      },
      subscriptions,
      recentTransactions,
    });
  } catch (error: any) {
    console.error('[Wallet] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch wallet data' });
  }
}

export async function getTransactions(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { limit, offset, types, treeId } = req.query as {
      limit?: string;
      offset?: string;
      types?: string;
      treeId?: string;
    };

    const take = Math.min(Math.max(parseInt(limit || '20') || 20, 1), 100);
    const skip = Math.max(parseInt(offset || '0') || 0, 0);

    const wantedFiat = !types || types.split(',').includes('fiat');
    const wantedBerry = !types || types.split(',').includes('berry');

    // Fetch total + one batch from both sources to merge/sort in memory
    const treeFilter = treeId ? { treeId } : {};

    const [totalFiat, totalBerry, fiatTxs, berryTxs] = await Promise.all([
      wantedFiat
        ? prisma.fiatTransaction.count({
            where: { createdById: userId, ...treeFilter },
          })
        : Promise.resolve(0),
      wantedBerry
        ? prisma.berryTransaction.count({
            where: { userId, ...treeFilter },
          })
        : Promise.resolve(0),
      wantedFiat
        ? prisma.fiatTransaction.findMany({
            where: { createdById: userId, ...treeFilter },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              treeId: true,
              amount: true,
              currency: true,
              type: true,
              category: true,
              description: true,
              createdAt: true,
              tree: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      wantedBerry
        ? prisma.berryTransaction.findMany({
            where: { userId, ...treeFilter },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              treeId: true,
              amount: true,
              type: true,
              description: true,
              createdAt: true,
              tree: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const total = totalFiat + totalBerry;

    // Merge both feeds into unified shape with FIAT_/BERRY_ prefix
    const unified = [
      ...fiatTxs.map((t: any) => ({
        id: t.id,
        treeId: t.treeId,
        treeName: t.tree.name,
        kind: 'fiat' as const,
        type: `FIAT_${t.type}`,
        category: t.category,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        createdAt: t.createdAt,
      })),
      ...berryTxs.map((t: any) => ({
        id: t.id,
        treeId: t.treeId,
        treeName: t.tree.name,
        kind: 'berries' as const,
        type: `BERRY_${t.type}`,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt,
      })),
    ]
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(skip, skip + take);

    const hasMore = skip + take < total;

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'WALLET_TRANSACTIONS_READ',
      entityType: 'Wallet',
      entityId: userId,
      severity: 'INFO',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        limit: take,
        offset: skip,
        types: types || 'all',
        treeId: treeId || 'all',
        resultsReturned: unified.length,
      }),
    });

    return res.json({
      transactions: unified,
      total,
      offset: skip,
      limit: take,
      hasMore,
    });
  } catch (error: any) {
    console.error('[Wallet Transactions] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
}
