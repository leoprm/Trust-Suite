import { Request, Response } from 'express';
import { prisma } from '../index';

import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── In-memory rate limiter: 10 transfers/min per user ──────────────────────
const transferWindows = new Map<string, number[]>();

function checkTransferRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 min
  const maxTransfers = 10;

  const timestamps = transferWindows.get(userId) || [];
  // Prune old entries
  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length >= maxTransfers) return false;
  recent.push(now);
  transferWindows.set(userId, recent);
  return true;
}

// ── Rate limiting (inline, no package) ──────────────────────────────────

async function checkRateLimit(
  walletId: string,
  type: 'DEPOSIT' | 'WITHDRAWAL',
  max: number,
  windowHours: number,
): Promise<boolean> {
  const count = await prisma.walletTransaction.count({
    where: {
      walletId,
      type,
      createdAt: {
        gte: new Date(Date.now() - windowHours * 60 * 60 * 1000),
      },
    },
  });
  return count < max;
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function getOrCreateWallet(userId: string, req?: Request) {
  let wallet = await prisma.userWallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.userWallet.create({
      data: { userId },
    });
    if (req) {
      void logEvent({
        ...getRequestContext(req),
        actorId: userId,
        action: 'WALLET_CREATED',
        entityType: 'UserWallet',
        entityId: wallet.id,
        severity: 'INFO',
        source: 'SYSTEM',
        metadataJson: getRequestMetadata(req, {
          reason: 'lazy-init on first access',
          balanceClp: 0,
          lockedClp: 0,
          balanceBerries: 0,
        }),
      });
    }
  }
  return wallet;
}

export async function getWallet(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    // ── Lazy-init UserWallet ──────────────────────────────────────────────
    const wallet = await getOrCreateWallet(userId, req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const availableClp = round(wallet.balanceClp - wallet.lockedClp);
    const lockedClp = round(wallet.lockedClp);
    const availableBerries = round(wallet.balanceBerries);
    const lockedBerries = 0; // reserved for future locked-berries model

    // ── Wallet transactions (last 5) ─────────────────────────────────────
    const walletTxs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, status: { not: 'REVERSED' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        currency: true,
        balanceBefore: true,
        balanceAfter: true,
        treeId: true,
        fromUserId: true,
        toUserId: true,
        description: true,
        createdAt: true,
        tree: { select: { name: true } },
      },
    });

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
        wallet: {
          availableClp,
          lockedClp,
          availableBerries,
          lockedBerries,
        },
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
      ...walletTxs.map((t) => ({
        id: t.id,
        kind: 'wallet' as const,
        walletType: t.type,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        treeId: t.treeId,
        treeName: t.tree?.name ?? undefined,
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        description: t.description,
        createdAt: t.createdAt,
      })),
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

    return res.json({
      wallet: {
        availableClp,
        lockedClp,
        availableBerries,
        lockedBerries,
      },
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
    const { limit, offset, types, treeId, walletType } = req.query as {
      limit?: string;
      offset?: string;
      types?: string;
      treeId?: string;
      walletType?: string; // e.g. "FEE" to filter wallet txs by WalletTransactionType
    };

    const take = Math.min(Math.max(parseInt(limit || '20') || 20, 1), 100);
    const skip = Math.max(parseInt(offset || '0') || 0, 0);

    const wantedFiat = !types || types.split(',').includes('fiat');
    const wantedBerry = !types || types.split(',').includes('berry');
    const wantedWallet = !types || types.split(',').includes('wallet');

    // Fetch total + one batch from three sources to merge/sort in memory
    const treeFilter = treeId ? { treeId } : {};

    const wallet = await getOrCreateWallet(userId);
    const walletBaseFilter = wantedWallet
      ? { walletId: wallet.id, ...treeFilter, status: { not: 'REVERSED' as const } }
      : null;
    const walletTypeFilter = walletType ? { type: walletType.toUpperCase() as any } : {};
    const walletFilter = walletBaseFilter
      ? { ...walletBaseFilter, ...walletTypeFilter }
      : null;

    const [totalFiat, totalBerry, totalWallet, fiatTxs, berryTxs, walletTxs] = await Promise.all([
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
      walletFilter
        ? prisma.walletTransaction.count({
            where: walletFilter,
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
      walletFilter
        ? prisma.walletTransaction.findMany({
            where: walletFilter,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              type: true,
              status: true,
              amount: true,
              currency: true,
              balanceBefore: true,
              balanceAfter: true,
              treeId: true,
              fromUserId: true,
              toUserId: true,
              description: true,
              createdAt: true,
              tree: { select: { name: true } },
              fromUser: { select: { username: true } },
              toUser: { select: { username: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const total = totalFiat + totalBerry + totalWallet;

    // Merge feeds into unified shape with FIAT_/BERRY_/WALLET_ prefix
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
      ...walletTxs.map((t: any) => ({
        id: t.id,
        treeId: t.treeId,
        treeName: t.tree?.name || null,
        kind: 'wallet' as const,
        type: `WALLET_${t.type}`,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        createdAt: t.createdAt,
        fromUserId: t.fromUserId || null,
        toUserId: t.toUserId || null,
        fromUsername: t.fromUser?.username || null,
        toUsername: t.toUser?.username || null,
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
        walletType: walletType || null,
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

// ═══════════════════════════════════════════════════════════════════════════
// Deposit & Withdraw — Trust Wallet (CLP)
// ═══════════════════════════════════════════════════════════════════════════

export async function deposit(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { amount, receiptFileId, bankInfo, description } = req.body;

    // ── Validation ────────────────────────────────────────────────────
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount debe ser mayor a 0' });
    }

    const wallet = await getOrCreateWallet(userId);

    // ── Rate limit: 5 deposits/hour ──────────────────────────────────
    const allowed = await checkRateLimit(wallet.id, 'DEPOSIT', 5, 1);
    if (!allowed) {
      return res.status(429).json({
        error: 'Límite de depósitos excedido. Máximo 5 por hora.',
        retryAfter: '1 hora',
      });
    }

    // ── Create PENDING transaction (NO acredita balance) ─────────────
    const tx = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEPOSIT',
        status: 'PENDING',
        amount,
        currency: 'CLP',
        balanceBefore: wallet.balanceClp,
        balanceAfter: wallet.balanceClp, // no acredita aún
        description: description || null,
        metadataJson: {
          receiptFileId: receiptFileId || null,
          bankInfo: bankInfo || null,
        },
      },
    });

    // ── EventLog CRITICAL ────────────────────────────────────────────
    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'WALLET_DEPOSIT_INITIATED',
      entityType: 'WalletTransaction',
      entityId: tx.id,
      severity: 'CRITICAL',
      source: 'USER',
      afterJson: {
        transactionId: tx.id,
        walletId: wallet.id,
        amount,
        status: 'PENDING',
        receiptFileId: receiptFileId || null,
      },
      metadataJson: getRequestMetadata(req, { result: 'pending_approval' }),
    });

    return res.status(201).json({
      transaction: tx,
      message: 'Depósito registrado. Será acreditado cuando un administrador lo apruebe.',
    });
  } catch (error: any) {
    console.error('[Wallet Deposit] Error:', error);
    return res.status(500).json({ error: 'Failed to process deposit' });
  }
}

export async function withdraw(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { amount, bankInfo, description } = req.body;

    // ── Validation ────────────────────────────────────────────────────
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount debe ser mayor a 0' });
    }
    if (!bankInfo || !bankInfo.bank || !bankInfo.accountType || !bankInfo.accountNumber || !bankInfo.rut) {
      return res.status(400).json({
        error: 'bankInfo requerido: { bank, accountType, accountNumber, rut }',
      });
    }

    const wallet = await getOrCreateWallet(userId);

    // ── Rate limit: 3 withdrawals/day ────────────────────────────────
    const allowed = await checkRateLimit(wallet.id, 'WITHDRAWAL', 3, 24);
    if (!allowed) {
      return res.status(429).json({
        error: 'Límite de retiros excedido. Máximo 3 por día.',
        retryAfter: '24 horas',
      });
    }

    // ── Verify balance ────────────────────────────────────────────────
    const available = wallet.balanceClp - wallet.lockedClp;
    if (available < amount) {
      return res.status(400).json({
        error: `Saldo insuficiente. Disponible: ${available.toFixed(2)} CLP, solicitado: ${amount.toFixed(2)} CLP.`,
        availableBalance: available,
        requestedAmount: amount,
      });
    }

    // ── Lock funds + create transaction (atomic) ──────────────────────
    const result = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.userWallet.update({
        where: { id: wallet.id },
        data: {
          balanceClp: { decrement: amount },
          lockedClp: { increment: amount },
        },
      });

      const wtx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          amount,
          currency: 'CLP',
          balanceBefore: wallet.balanceClp,
          balanceAfter: updatedWallet.balanceClp,
          description: description || null,
          metadataJson: {
            bankInfo: {
              bank: bankInfo.bank,
              accountType: bankInfo.accountType,
              accountNumber: bankInfo.accountNumber,
              rut: bankInfo.rut,
            },
          },
        },
      });

      return { wtx, updatedWallet };
    });

    // ── EventLog CRITICAL ────────────────────────────────────────────
    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'WALLET_WITHDRAWAL_INITIATED',
      entityType: 'WalletTransaction',
      entityId: result.wtx.id,
      severity: 'CRITICAL',
      source: 'USER',
      afterJson: {
        transactionId: result.wtx.id,
        walletId: wallet.id,
        amount,
        status: 'PENDING',
        balanceBefore: wallet.balanceClp,
        balanceAfter: result.updatedWallet.balanceClp,
        bank: bankInfo.bank,
        accountType: bankInfo.accountType,
      },
      metadataJson: getRequestMetadata(req, { result: 'pending_approval' }),
    });

    return res.status(201).json({
      transaction: result.wtx,
      message: 'Retiro registrado. Los fondos están bloqueados hasta que un administrador lo apruebe.',
    });
  } catch (error: any) {
    console.error('[Wallet Withdraw] Error:', error);
    return res.status(500).json({ error: 'Failed to process withdrawal' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin — Approve / Reject
// ═══════════════════════════════════════════════════════════════════════════

export async function approveDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const txn = await prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!txn) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    if (txn.type !== 'DEPOSIT') {
      return res.status(400).json({ error: 'Esta transacción no es un depósito' });
    }
    if (txn.status !== 'PENDING') {
      return res.status(400).json({ error: `La transacción ya está ${txn.status}` });
    }

    // ── Credit balance ────────────────────────────────────────────────
    const updatedWallet = await prisma.userWallet.update({
      where: { id: txn.walletId },
      data: { balanceClp: { increment: txn.amount } },
    });

    const updatedTxn = await prisma.walletTransaction.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        balanceAfter: updatedWallet.balanceClp,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: adminId,
      action: 'WALLET_DEPOSIT_APPROVED',
      entityType: 'WalletTransaction',
      entityId: id,
      severity: 'CRITICAL',
      source: 'ADMIN',
      beforeJson: { status: 'PENDING', balanceAfter: txn.balanceAfter },
      afterJson: {
        status: 'COMPLETED',
        balanceAfter: updatedWallet.balanceClp,
        approvedBy: adminId,
      },
      metadataJson: getRequestMetadata(req, { result: 'approved' }),
    });

    return res.json({
      transaction: updatedTxn,
      wallet: { id: updatedWallet.id, balanceClp: updatedWallet.balanceClp },
      message: 'Depósito aprobado. Fondos acreditados.',
    });
  } catch (error: any) {
    console.error('[Admin Approve Deposit] Error:', error);
    return res.status(500).json({ error: 'Failed to approve deposit' });
  }
}

export async function rejectDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const txn = await prisma.walletTransaction.findUnique({ where: { id } });

    if (!txn) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    if (txn.type !== 'DEPOSIT') {
      return res.status(400).json({ error: 'Esta transacción no es un depósito' });
    }
    if (txn.status !== 'PENDING') {
      return res.status(400).json({ error: `La transacción ya está ${txn.status}` });
    }

    const updatedTxn = await prisma.walletTransaction.update({
      where: { id },
      data: { status: 'REVERSED' },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: adminId,
      action: 'WALLET_DEPOSIT_REJECTED',
      entityType: 'WalletTransaction',
      entityId: id,
      severity: 'CRITICAL',
      source: 'ADMIN',
      beforeJson: { status: 'PENDING', amount: txn.amount },
      afterJson: { status: 'REVERSED', rejectedBy: adminId },
      metadataJson: getRequestMetadata(req, { result: 'rejected' }),
    });

    return res.json({
      transaction: updatedTxn,
      message: 'Depósito rechazado.',
    });
  } catch (error: any) {
    console.error('[Admin Reject Deposit] Error:', error);
    return res.status(500).json({ error: 'Failed to reject deposit' });
  }
}

export async function approveWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const txn = await prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!txn) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    if (txn.type !== 'WITHDRAWAL') {
      return res.status(400).json({ error: 'Esta transacción no es un retiro' });
    }
    if (txn.status !== 'PENDING') {
      return res.status(400).json({ error: `La transacción ya está ${txn.status}` });
    }

    // ── Complete withdrawal: unlock funds → 0 ─────────────────────────
    const updatedWallet = await prisma.userWallet.update({
      where: { id: txn.walletId },
      data: { lockedClp: { decrement: txn.amount } },
    });

    const updatedTxn = await prisma.walletTransaction.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        balanceAfter: updatedWallet.balanceClp,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: adminId,
      action: 'WALLET_WITHDRAWAL_APPROVED',
      entityType: 'WalletTransaction',
      entityId: id,
      severity: 'CRITICAL',
      source: 'ADMIN',
      beforeJson: { status: 'PENDING', lockedClp: txn.amount },
      afterJson: {
        status: 'COMPLETED',
        walletBalance: updatedWallet.balanceClp,
        lockedClp: updatedWallet.lockedClp,
        approvedBy: adminId,
      },
      metadataJson: getRequestMetadata(req, { result: 'approved', bank: (txn.metadataJson as any)?.bankInfo?.bank }),
    });

    return res.json({
      transaction: updatedTxn,
      wallet: { id: updatedWallet.id, balanceClp: updatedWallet.balanceClp, lockedClp: updatedWallet.lockedClp },
      message: 'Retiro aprobado. Fondos liberados.',
    });
  } catch (error: any) {
    console.error('[Admin Approve Withdrawal] Error:', error);
    return res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
}

export async function rejectWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const txn = await prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!txn) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    if (txn.type !== 'WITHDRAWAL') {
      return res.status(400).json({ error: 'Esta transacción no es un retiro' });
    }
    if (txn.status !== 'PENDING') {
      return res.status(400).json({ error: `La transacción ya está ${txn.status}` });
    }

    // ── Return locked funds to balance ────────────────────────────────
    const updatedWallet = await prisma.userWallet.update({
      where: { id: txn.walletId },
      data: {
        balanceClp: { increment: txn.amount },
        lockedClp: { decrement: txn.amount },
      },
    });

    const updatedTxn = await prisma.walletTransaction.update({
      where: { id },
      data: {
        status: 'REVERSED',
        balanceAfter: updatedWallet.balanceClp,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: adminId,
      action: 'WALLET_WITHDRAWAL_REJECTED',
      entityType: 'WalletTransaction',
      entityId: id,
      severity: 'CRITICAL',
      source: 'ADMIN',
      beforeJson: { status: 'PENDING', lockedClp: txn.amount },
      afterJson: {
        status: 'REVERSED',
        walletBalance: updatedWallet.balanceClp,
        lockedClp: updatedWallet.lockedClp,
        rejectedBy: adminId,
      },
      metadataJson: getRequestMetadata(req, { result: 'rejected' }),
    });

    return res.json({
      transaction: updatedTxn,
      wallet: { id: updatedWallet.id, balanceClp: updatedWallet.balanceClp, lockedClp: updatedWallet.lockedClp },
      message: 'Retiro rechazado. Fondos devueltos al balance disponible.',
    });
  } catch (error: any) {
    console.error('[Admin Reject Withdrawal] Error:', error);
    return res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P Transfer — CLP y Berries
// ═══════════════════════════════════════════════════════════════════════════

export async function transfer(req: Request, res: Response) {
  try {
    const fromUserId = req.user!.id;
    const { toUserId, amount, currency, treeId, description } = req.body;

    // ── 1. Validate body ────────────────────────────────────────────────
    if (!toUserId || typeof toUserId !== 'string') {
      return res.status(400).json({ error: 'toUserId is required' });
    }
    if (toUserId === fromUserId) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!currency || !['CLP', 'BERRIES'].includes(currency)) {
      return res.status(400).json({ error: 'currency must be CLP or BERRIES' });
    }
    if (currency === 'BERRIES' && (!treeId || typeof treeId !== 'string')) {
      return res.status(400).json({ error: 'treeId is required for berry transfers' });
    }

    // ── 2. Rate limiting: 10 transfers/min per user ────────────────────
    if (!checkTransferRateLimit(fromUserId)) {
      return res.status(429).json({
        error: 'Too many transfers. Maximum 10 per minute.',
        retryAfter: '60 seconds',
      });
    }

    // ── 3. Verify receiver exists ───────────────────────────────────────
    const receiverUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!receiverUser) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // ── 4. Execute atomic transfer ──────────────────────────────────────
    // All balance checks happen INSIDE the transaction to prevent TOCTOU
    const result = await prisma.$transaction(async (tx) => {
      // ── Sender wallet (must exist) ────────────────────────────────────
      const senderWallet = await tx.userWallet.findUnique({
        where: { userId: fromUserId },
      });
      if (!senderWallet) {
        throw Object.assign(new Error('You do not have a wallet yet'), { statusCode: 400 });
      }

      // ── Receiver wallet (create if missing) ───────────────────────────
      let receiverWallet = await tx.userWallet.findUnique({
        where: { userId: toUserId },
      });
      if (!receiverWallet) {
        receiverWallet = await tx.userWallet.create({
          data: { userId: toUserId },
        });
      }

      let txOut: any;
      let txIn: any;

      if (currency === 'CLP') {
        // ── CLP validation ──────────────────────────────────────────────
        if (senderWallet.balanceClp < amount) {
          throw Object.assign(
            new Error(`Insufficient CLP balance. Available: ${senderWallet.balanceClp.toFixed(2)}, requested: ${amount.toFixed(2)}`),
            { statusCode: 400, availableBalance: senderWallet.balanceClp },
          );
        }

        // ── Calculate fee ────────────────────────────────────────────
        let feeAmount = 0;
        let netAmount = amount;
        let feePercent = 0;
        let feeData: any = null;
        let trustCoreTreeIds: string[] = [];
        let distributions: any[] = [];

        const globalConfig = await tx.globalFeeConfig.findFirst();
        if (globalConfig) {
          feePercent = globalConfig.currentFeePercent;
          feeAmount = Math.round((amount * feePercent) / 100 * 100) / 100;
          netAmount = Math.round((amount - feeAmount) * 100) / 100;

          // Only distribute fee if there are active TrustCore trees
          const activeConfigs = await tx.trustCoreConfig.findMany({
            where: { isActive: true },
            include: { tree: true },
          });

          if (activeConfigs.length > 0) {
            const totalCost = activeConfigs.reduce(
              (sum: number, cfg: any) => sum + (cfg.monthlyMaintenanceCost || 0),
              0,
            );

            for (const cfg of activeConfigs) {
              const splitRatio = totalCost > 0
                ? (cfg.monthlyMaintenanceCost || 0) / totalCost
                : 1 / activeConfigs.length;

              const distAmount = Math.round(feeAmount * splitRatio * 100) / 100;
              distributions.push({
                trustCoreTreeId: cfg.treeId,
                amount: distAmount,
                splitRatio: Math.round(splitRatio * 10000) / 10000,
              });
              trustCoreTreeIds.push(cfg.treeId);

              // Credit TrustCore tree
              await tx.tree.update({
                where: { id: cfg.treeId },
                data: { trustCoreBalanceClp: { increment: distAmount } },
              });

              // Update TrustCoreConfig totals
              await tx.trustCoreConfig.update({
                where: { treeId: cfg.treeId },
                data: { totalFeesCollected: { increment: distAmount } },
              });
            }

            // Absorb rounding errors in first distribution
            const distSum = distributions.reduce((s, d) => s + d.amount, 0);
            const remainder = Math.round((feeAmount - distSum) * 100) / 100;
            if (remainder !== 0 && distributions.length > 0) {
              distributions[0].amount = Math.round((distributions[0].amount + remainder) * 100) / 100;
            }

            // Build fee metadata
            const totalComponent = globalConfig.maintenanceComponent + globalConfig.growthComponent || 1;
            const maintenanceRatio = globalConfig.maintenanceComponent / totalComponent;
            const baseFee = Math.round(feeAmount * maintenanceRatio * 100) / 100;
            const growthFee = Math.round((feeAmount - baseFee) * 100) / 100;
            feeData = { feePercent, baseFee, growthFee, trustCoreTreeIds };
          } else {
            // No active TrustCore trees → fee = 0
            feeAmount = 0;
            netAmount = amount;
            feePercent = 0;
          }
        }

        const senderAfter = senderWallet.balanceClp - amount;
        const receiverAfter = receiverWallet.balanceClp + netAmount;

        // Debit sender (full amount)
        await tx.userWallet.update({
          where: { userId: fromUserId },
          data: { balanceClp: senderAfter },
        });
        // Credit receiver (net amount, after fee)
        await tx.userWallet.update({
          where: { userId: toUserId },
          data: { balanceClp: receiverAfter },
        });

        // Create P2P_TRANSFER_OUT for sender (full amount)
        txOut = await tx.walletTransaction.create({
          data: {
            walletId: senderWallet.id,
            type: 'P2P_TRANSFER_OUT',
            status: 'COMPLETED',
            amount,
            currency: 'CLP',
            balanceBefore: senderWallet.balanceClp,
            balanceAfter: senderAfter,
            fromUserId,
            toUserId,
            treeId: treeId || null,
            description: description || 'P2P CLP transfer',
          },
        });

        // Create P2P_TRANSFER_IN for receiver (net amount received)
        txIn = await tx.walletTransaction.create({
          data: {
            walletId: receiverWallet.id,
            type: 'P2P_TRANSFER_IN',
            status: 'COMPLETED',
            amount: netAmount,
            currency: 'CLP',
            balanceBefore: receiverWallet.balanceClp,
            balanceAfter: receiverAfter,
            fromUserId,
            toUserId,
            treeId: treeId || null,
            description: description || 'P2P CLP transfer',
            metadataJson: feeAmount > 0 ? { feeAmount, feePercent, originalAmount: amount } : undefined,
          },
        });

        // Create FEE wallet transaction if fee was deducted
        let feeTx: any = null;
        let feeDistRecords: any[] = [];
        if (feeAmount > 0 && distributions.length > 0) {
          feeTx = await tx.walletTransaction.create({
            data: {
              walletId: senderWallet.id,
              type: 'FEE',
              status: 'COMPLETED',
              amount: feeAmount,
              currency: 'CLP',
              balanceBefore: senderWallet.balanceClp,
              balanceAfter: senderAfter,
              fromUserId,
              treeId: trustCoreTreeIds[0] || null,
              description: 'TrustCore fee',
              metadataJson: {
                ...feeData,
                distributionIds: [], // will be filled below
              },
            },
          });

          // Create FeeDistribution records
          for (const dist of distributions) {
            const fd = await tx.feeDistribution.create({
              data: {
                walletTransactionId: feeTx.id,
                trustCoreTreeId: dist.trustCoreTreeId,
                amount: dist.amount,
                totalFeeAmount: feeAmount,
                splitRatio: dist.splitRatio,
              },
            });
            feeDistRecords.push(fd);
          }

          // Update FEE tx metadata with actual distribution IDs
          await tx.walletTransaction.update({
            where: { id: feeTx.id },
            data: {
              metadataJson: {
                ...feeData,
                distributionIds: feeDistRecords.map((d: any) => d.id),
              },
            },
          });
        }

        return {
          txOut,
          txIn,
          feeTx,
          feeDistRecords,
          newSenderBalance: senderAfter,
          newReceiverBalance: receiverAfter,
          feeAmount,
          netAmount,
          feePercent,
          trustCoreTreeIds,
        };
      } else {
        // ── BERRIES validation ──────────────────────────────────────────
        const berryConfig = await (tx as any).berryConfig.findUnique({
          where: { treeId },
        });
        if (!berryConfig) {
          throw Object.assign(
            new Error('Berry economy not configured for this tree'),
            { statusCode: 400 },
          );
        }
        if (!berryConfig.allowP2PTransfers) {
          throw Object.assign(
            new Error('P2P berry transfers are not enabled for this tree'),
            { statusCode: 400 },
          );
        }

        // Check minMembersForBerries
        const memberCount = await tx.treeMember.count({ where: { treeId } });
        if (memberCount < berryConfig.minMembersForBerries) {
          throw Object.assign(
            new Error(`Tree must have at least ${berryConfig.minMembersForBerries} members for berry economy`),
            { statusCode: 400 },
          );
        }

        // ── Sender tree membership + bayas balance ──────────────────────
        const senderMembership = await tx.treeMember.findFirst({
          where: { userId: fromUserId, treeId },
        });
        if (!senderMembership) {
          throw Object.assign(
            new Error('You are not a member of this tree'),
            { statusCode: 400 },
          );
        }
        if (senderMembership.bayasBalance < amount) {
          throw Object.assign(
            new Error(`Insufficient berry balance. Available: ${senderMembership.bayasBalance}, requested: ${amount}`),
            { statusCode: 400, availableBalance: senderMembership.bayasBalance },
          );
        }

        // ── Receiver tree membership ────────────────────────────────────
        const receiverMembership = await tx.treeMember.findFirst({
          where: { userId: toUserId, treeId },
        });
        if (!receiverMembership) {
          throw Object.assign(
            new Error('Recipient is not a member of this tree'),
            { statusCode: 400 },
          );
        }

        const senderBayasBefore = senderMembership.bayasBalance;
        const receiverBayasBefore = receiverMembership.bayasBalance;
        const senderWalletBefore = senderWallet.balanceBerries;
        const receiverWalletBefore = receiverWallet.balanceBerries;

        // Debit sender
        await tx.userWallet.update({
          where: { userId: fromUserId },
          data: { balanceBerries: { decrement: amount } },
        });
        await tx.treeMember.updateMany({
          where: { userId: fromUserId, treeId },
          data: { bayasBalance: { decrement: amount } },
        });

        // Credit receiver
        await tx.userWallet.update({
          where: { userId: toUserId },
          data: { balanceBerries: { increment: amount } },
        });
        await tx.treeMember.updateMany({
          where: { userId: toUserId, treeId },
          data: { bayasBalance: { increment: amount } },
        });

        const meta = {
          treeId,
          senderBayasBefore,
          senderBayasAfter: senderBayasBefore - amount,
          receiverBayasBefore,
          receiverBayasAfter: receiverBayasBefore + amount,
        };

        // Create P2P_TRANSFER_OUT for sender
        txOut = await tx.walletTransaction.create({
          data: {
            walletId: senderWallet.id,
            type: 'P2P_TRANSFER_OUT',
            status: 'COMPLETED',
            amount,
            currency: 'BERRIES',
            balanceBefore: senderWalletBefore,
            balanceAfter: senderWalletBefore - amount,
            fromUserId,
            toUserId,
            treeId,
            description: description || 'P2P berry transfer',
            metadataJson: meta,
          },
        });

        // Create P2P_TRANSFER_IN for receiver
        txIn = await tx.walletTransaction.create({
          data: {
            walletId: receiverWallet.id,
            type: 'P2P_TRANSFER_IN',
            status: 'COMPLETED',
            amount,
            currency: 'BERRIES',
            balanceBefore: receiverWalletBefore,
            balanceAfter: receiverWalletBefore + amount,
            fromUserId,
            toUserId,
            treeId,
            description: description || 'P2P berry transfer',
            metadataJson: meta,
          },
        });

        return {
          txOut,
          txIn,
          newSenderBalance: senderWalletBefore - amount,
          newReceiverBalance: receiverWalletBefore + amount,
        };
      }
    }, { isolationLevel: 'Serializable' });

    // ── 5. EventLog CRITICAL × 2 (+ FEE events) ──────────────────────────
    void logEvent({
      ...getRequestContext(req),
      actorId: fromUserId,
      action: 'WALLET_TRANSFER_OUT',
      entityType: 'WalletTransaction',
      entityId: result.txOut.id,
      severity: 'CRITICAL',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        transferId: result.txOut.id,
        counterpartTxId: result.txIn.id,
        currency,
        amount,
        toUserId,
        treeId: treeId || null,
        direction: 'out',
      }),
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: fromUserId,
      action: 'WALLET_TRANSFER_IN',
      entityType: 'WalletTransaction',
      entityId: result.txIn.id,
      severity: 'CRITICAL',
      source: 'USER',
      metadataJson: getRequestMetadata(req, {
        transferId: result.txIn.id,
        counterpartTxId: result.txOut.id,
        currency,
        amount,
        fromUserId,
        treeId: treeId || null,
        direction: 'in',
      }),
    });

    // ── Fee events (CLP only) ───────────────────────────────────────
    if (result.feeTx) {
      void logEvent({
        ...getRequestContext(req),
        actorId: fromUserId,
        action: 'FEE_COLLECTED',
        entityType: 'WalletTransaction',
        entityId: result.feeTx.id,
        severity: 'INFO',
        source: 'SYSTEM',
        metadataJson: getRequestMetadata(req, {
          amount: result.feeAmount,
          feePercent: result.feePercent,
          parentTxId: result.txOut.id,
          trustCoreTreeIds: result.trustCoreTreeIds,
        }),
      });

      for (const fd of (result.feeDistRecords || [])) {
        void logEvent({
          ...getRequestContext(req),
          actorId: fromUserId,
          action: 'FEE_DISTRIBUTED',
          entityType: 'FeeDistribution',
          entityId: fd.id,
          treeId: fd.trustCoreTreeId,
          severity: 'INFO',
          source: 'SYSTEM',
          metadataJson: getRequestMetadata(req, {
            amount: fd.amount,
            totalFeeAmount: fd.totalFeeAmount,
            splitRatio: fd.splitRatio,
            feeTransactionId: result.feeTx.id,
          }),
        });
      }
    }

    // ── 6. Response ─────────────────────────────────────────────────────
    if (currency === 'CLP') {
      return res.status(201).json({
        transferId: result.txOut.id,
        currency,
        amount,
        feeAmount: result.feeAmount || 0,
        netAmount: result.netAmount || amount,
        feePercent: result.feePercent || 0,
        trustCoreTreeIds: result.trustCoreTreeIds || [],
        fromUserId,
        toUserId,
        treeId: treeId || null,
        newBalance: Math.round(result.newSenderBalance * 100) / 100,
        createdAt: result.txOut.createdAt,
      });
    }

    return res.status(201).json({
      transferId: result.txOut.id,
      currency,
      amount,
      fromUserId,
      toUserId,
      treeId: treeId || null,
      newBalance: result.newSenderBalance,
      createdAt: result.txOut.createdAt,
    });
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        availableBalance: error.availableBalance,
      });
    }
    console.error('[Wallet Transfer] Error:', error);
    return res.status(500).json({ error: 'Transfer failed' });
  }
}
