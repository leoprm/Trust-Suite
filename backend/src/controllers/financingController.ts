import { Response } from 'express';
import { prisma } from '../index';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── Helpers ────────────────────────────────────────────────────────────────

async function requireTreeAdmin(treeId: string, userId: string) {
  const tree = await prisma.tree.findUnique({ where: { id: treeId } });
  if (!tree) return { tree: null, error: 'Tree not found', status: 404 };

  const member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });

  if (tree.creatorId !== userId && member?.role !== 'ADMIN') {
    return { tree, error: 'Forbidden. Solo el creador o administradores pueden gestionar el financiamiento.', status: 403 };
  }

  return { tree };
}

// ── Financing Config ───────────────────────────────────────────────────────

export const getFinancingConfig = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: {
        id: true,
        name: true,
        financingMode: true,
        subscriptionAmount: true,
        subscriptionCurrency: true,
        subscriptionDayOfMonth: true,
        subscriptionBillingMode: true,
      },
    });

    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch financing config' });
  }
};

export const updateFinancingConfig = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const userId = req.user!.id;
    const { financingMode, subscriptionAmount, subscriptionCurrency, subscriptionDayOfMonth, subscriptionBillingMode } = req.body;

    const { tree: t, error, status } = await requireTreeAdmin(treeId, userId);
    if (error) return res.status(status!).json({ error });
    const tree = t!;

    // Validaciones
    if (financingMode) {
      // Validar gates de madurez antes de permitir cambio de modo
      const { canActivateFinancingMode, canActivateProportionalBilling } = await import('../services/maturityGates');

      if (financingMode === 'SUBSCRIPCION' && tree.financingMode !== 'SUBSCRIPCION') {
        const canSwitch = await canActivateFinancingMode(treeId, 'SUBSCRIPCION');
        if (!canSwitch) {
          const { getMaturityGateStatus } = await import('../services/maturityGates');
          const status = await getMaturityGateStatus(treeId);
          const subBlocked = status.blockedModes.find(b => b.mode === 'SUBSCRIPCION');
          return res.status(422).json({
            error: 'El Tree no cumple los gates de madurez para SUBSCRIPCION',
            missingGates: subBlocked?.missingGates || [],
          });
        }
      }

      if (financingMode === 'SUBSCRIPCION' && subscriptionBillingMode === 'PROPORTIONAL') {
        const canUseProportional = await canActivateProportionalBilling(treeId);
        if (!canUseProportional) {
          const { getProportionalGateDetails } = await import('../services/maturityGates');
          const details = await getProportionalGateDetails(treeId);
          const missing = details.gates.filter(g => !g.passed).map(g => `${g.name}: ${g.detail}`);
          return res.status(422).json({
            error: 'El Tree no cumple los gates para billing PROPORTIONAL',
            missingGates: missing,
          });
        }
      }
    }

    // Validaciones de negocio
    if (financingMode === 'SUBSCRIPCION') {
      if (!subscriptionBillingMode || subscriptionBillingMode === 'FIXED') {
        if (subscriptionAmount === undefined || subscriptionAmount === null || subscriptionAmount <= 0) {
          return res.status(400).json({ error: 'subscriptionAmount debe ser mayor a 0 en modo SUBSCRIPCION con billing FIXED' });
        }
      }
    }

    if (subscriptionBillingMode && !['FIXED', 'PROPORTIONAL'].includes(subscriptionBillingMode)) {
      return res.status(400).json({ error: 'subscriptionBillingMode debe ser FIXED o PROPORTIONAL' });
    }

    if (subscriptionDayOfMonth !== undefined && (subscriptionDayOfMonth < 1 || subscriptionDayOfMonth > 28)) {
      return res.status(400).json({ error: 'subscriptionDayOfMonth debe estar entre 1 y 28' });
    }

    const beforeJson = {
      financingMode: tree.financingMode,
      subscriptionAmount: tree.subscriptionAmount,
      subscriptionCurrency: tree.subscriptionCurrency,
      subscriptionDayOfMonth: tree.subscriptionDayOfMonth,
      subscriptionBillingMode: tree.subscriptionBillingMode,
    };

    const updateData: any = {};
    if (financingMode !== undefined) updateData.financingMode = financingMode;
    if (subscriptionAmount !== undefined) updateData.subscriptionAmount = subscriptionAmount;
    if (subscriptionCurrency !== undefined) updateData.subscriptionCurrency = subscriptionCurrency;
    if (subscriptionDayOfMonth !== undefined) updateData.subscriptionDayOfMonth = subscriptionDayOfMonth;
    if (subscriptionBillingMode !== undefined) updateData.subscriptionBillingMode = subscriptionBillingMode;

    const updated = await prisma.tree.update({
      where: { id: treeId },
      data: updateData,
      select: {
        id: true,
        name: true,
        financingMode: true,
        subscriptionAmount: true,
        subscriptionCurrency: true,
        subscriptionDayOfMonth: true,
        subscriptionBillingMode: true,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'TREE_FINANCING_UPDATED',
      entityType: 'Tree',
      entityId: treeId,
      beforeJson,
      afterJson: {
        financingMode: updated.financingMode,
        subscriptionAmount: updated.subscriptionAmount,
        subscriptionCurrency: updated.subscriptionCurrency,
        subscriptionDayOfMonth: updated.subscriptionDayOfMonth,
        subscriptionBillingMode: updated.subscriptionBillingMode,
      },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update financing config' });
  }
};

// ── Expenses ───────────────────────────────────────────────────────────────

export const getExpenses = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const { month } = req.query;

    const where: any = { treeId };
    if (month && typeof month === 'string') {
      where.month = month; // "2026-05"
    }

    const expenses = await prisma.treeExpense.findMany({
      where,
      include: {
        addedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

export const addExpense = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const userId = req.user!.id;
    const { description, amount, currency, category, isRecurring, dueDayOfMonth, month } = req.body;

    const { error, status } = await requireTreeAdmin(treeId, userId);
    if (error) return res.status(status!).json({ error });

    if (!description || amount === undefined || !month) {
      return res.status(400).json({ error: 'description, amount y month son requeridos' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount debe ser mayor a 0' });
    }

    const expense = await prisma.treeExpense.create({
      data: {
        treeId,
        description,
        amount,
        currency: currency || 'CLP',
        category: category || 'OTHER',
        isRecurring: isRecurring || false,
        dueDayOfMonth: dueDayOfMonth || null,
        addedById: userId,
        month,
      },
      include: {
        addedBy: { select: { id: true, username: true } },
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'TREE_EXPENSE_ADDED',
      entityType: 'TreeExpense',
      entityId: expense.id,
      afterJson: {
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        category: expense.category,
        month: expense.month,
        isRecurring: expense.isRecurring,
      },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add expense' });
  }
};

export const updateExpense = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const expenseId = req.params.expenseId;
    const userId = req.user!.id;
    const { description, amount, currency, category, isRecurring, dueDayOfMonth, month } = req.body;

    const { error, status } = await requireTreeAdmin(treeId, userId);
    if (error) return res.status(status!).json({ error });

    const expense = await prisma.treeExpense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.treeId !== treeId) {
      return res.status(404).json({ error: 'Expense not found in this tree' });
    }

    const beforeJson = {
      description: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      isRecurring: expense.isRecurring,
      dueDayOfMonth: expense.dueDayOfMonth,
      month: expense.month,
    };

    const updateData: any = {};
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) {
      if (amount <= 0) return res.status(400).json({ error: 'amount debe ser mayor a 0' });
      updateData.amount = amount;
    }
    if (currency !== undefined) updateData.currency = currency;
    if (category !== undefined) updateData.category = category;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (dueDayOfMonth !== undefined) updateData.dueDayOfMonth = dueDayOfMonth;
    if (month !== undefined) updateData.month = month;

    const updated = await prisma.treeExpense.update({
      where: { id: expenseId },
      data: updateData,
      include: {
        addedBy: { select: { id: true, username: true } },
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'TREE_EXPENSE_UPDATED',
      entityType: 'TreeExpense',
      entityId: expenseId,
      beforeJson,
      afterJson: {
        description: updated.description,
        amount: updated.amount,
        currency: updated.currency,
        category: updated.category,
        isRecurring: updated.isRecurring,
        month: updated.month,
      },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

// ── Maturity Gates ──────────────────────────────────────────────────────────

export const getMaturityGates = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const { getMaturityGateStatus, getProportionalGateDetails } = await import('../services/maturityGates');

    const tree = await prisma.tree.findUnique({ where: { id: treeId }, select: { id: true } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const status = await getMaturityGateStatus(treeId);
    const proportional = await getProportionalGateDetails(treeId);

    res.json({
      ...status,
      proportionalBilling: proportional,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get maturity gates' });
  }
};

export const deleteExpense = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const expenseId = req.params.expenseId;
    const userId = req.user!.id;

    const { error, status } = await requireTreeAdmin(treeId, userId);
    if (error) return res.status(status!).json({ error });

    const expense = await prisma.treeExpense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.treeId !== treeId) {
      return res.status(404).json({ error: 'Expense not found in this tree' });
    }

    await prisma.treeExpense.delete({ where: { id: expenseId } });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'TREE_EXPENSE_DELETED',
      entityType: 'TreeExpense',
      entityId: expenseId,
      beforeJson: {
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        category: expense.category,
        month: expense.month,
      },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      severity: 'WARNING',
      source: 'USER',
    });

    res.json({ message: 'Expense deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};
