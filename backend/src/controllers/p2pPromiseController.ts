import { Request, Response } from 'express';
import { prisma } from '../index';
import { isBerriesUnlocked, syncBerriesBalance } from '../utils/berriesEngine';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

export const createPledge = async (req: Request, res: Response) => {
  try {
    const { taskId, amount, currencyType } = req.body;
    const sponsorId = (req as any).user.id;

    const task = await (prisma as any).task.findUnique({
      where: { id: taskId },
      include: { branch: true }
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    const treeId = task.branch.treeId;

    if (currencyType === 'BERRY') {
      const unlocked = await isBerriesUnlocked(treeId);
      if (!unlocked) {
        return res.status(403).json({ error: 'Fase 1: Berries bloqueados hasta alcanzar 100 miembros Nivel 3. Solo Fiat permitido.' });
      }

      // Deduct Berries immediately (Escrow)
      const member = await (prisma as any).treeMember.findUnique({ where: { userId_treeId: { userId: sponsorId, treeId } } });
      if (!member) return res.status(404).json({ error: 'Membership not found' });

      const currentBalance = await syncBerriesBalance(member.id);
      if (currentBalance < amount) return res.status(400).json({ error: 'Insufficient Berries.' });

      await (prisma as any).treeMember.update({
        where: { id: member.id },
        data: { bayasBalance: { decrement: amount } }
      });
    }

    const pledge = await (prisma as any).promiseP2P.create({
      data: {
        taskId,
        sponsorId,
        amount,
        currencyType,
        status: 'PENDING'
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'P2P_PROMISE_CREATED',
      entityType: 'PromiseP2P',
      entityId: pledge.id,
      afterJson: { id: pledge.id, taskId, amount, currencyType, status: pledge.status },
      metadataJson: getRequestMetadata(req, {
        fiatRole: currencyType === 'FIAT' ? 'external_payment_promise' : undefined,
        berriesRole: currencyType === 'BERRY' ? 'internal_circulation_escrow' : undefined,
        noReputationEffect: true,
      }),
    });

    res.status(201).json(pledge);
  } catch (err) {
    res.status(500).json({ error: 'Error creating pledge' });
  }
};

export const sendFiatPayment = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const { comprobanteUrl } = req.body;
    const userId = (req as any).user.id;

    const promise = await (prisma as any).promiseP2P.findUnique({ where: { id } });
    if (!promise || promise.sponsorId !== userId || promise.currencyType !== 'FIAT') {
      return res.status(403).json({ error: 'Invalid operation' });
    }

    const updated = await (prisma as any).promiseP2P.update({
      where: { id },
      data: { status: 'PAYMENT_SENT', comprobanteUrl }
    });

    void logEvent({
      ...getRequestContext(req),
      action: 'P2P_PROMISE_ACCEPTED',
      entityType: 'PromiseP2P',
      entityId: id,
      metadataJson: getRequestMetadata(req, {
        fiatRole: 'external_payment_receipt_declared',
        noReputationEffect: true,
        hasReceiptReference: Boolean(comprobanteUrl),
      }),
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error processing fiat payment sent' });
  }
};

export const confirmPaymentReceived = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const userId = (req as any).user.id; // Must be Executor handling this. For now simplified auth.

    const updated = await (prisma as any).promiseP2P.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });
    void logEvent({
      ...getRequestContext(req),
      action: 'P2P_PROMISE_COMPLETED',
      entityType: 'PromiseP2P',
      entityId: id,
      metadataJson: getRequestMetadata(req, {
        userId,
        noReputationEffect: true,
        note: 'Promise completion does not grant XP or level by itself.',
      }),
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
};

// Cancel & Disputes
export const cancelPromise = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const { motivoCancelacion } = req.body;
    const userId = (req as any).user.id;

    const promise = await (prisma as any).promiseP2P.findUnique({
      where: { id }, include: { task: true }
    });

    if (!promise || promise.sponsorId !== userId) return res.status(403).json({ error: 'Invalid operation' });

    if (!motivoCancelacion) return res.status(400).json({ error: 'Motivo es obligatorio al cancelar.' });

    // Si la gila post-ejecucion, entra a disputa. Si la tarea está OPEN, simple cancelar.
    let nextStatus = 'CANCELLED';
    if (promise.task.status === 'COMPLETED') nextStatus = 'DISPUTED';

    const updated = await (prisma as any).promiseP2P.update({
      where: { id },
      data: { status: nextStatus, motivoCancelacion }
    });

    void logEvent({
      ...getRequestContext(req),
      action: 'P2P_PROMISE_CANCELLED',
      entityType: 'PromiseP2P',
      entityId: id,
      metadataJson: getRequestMetadata(req, { nextStatus, noReputationEffect: true }),
    });

    // Note: If Berry currency and cancelled safely (task not completed), we should refund berries.
    if (nextStatus === 'CANCELLED' && promise.currencyType === 'BERRY') {
      const treeId = promise.task.branch?.treeId; // Should fetch treeId
      // refund snippet omitted for simplicity 
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
};

export const rejectCancellationStampingStrike = async (req: Request, res: Response) => {
  try {
     const id = String(req.params.id || '');
     const executorId = (req as any).user.id;

     const promise = await (prisma as any).promiseP2P.findUnique({
       where: { id }, include: { task: { include: { branch: true } } }
     });

     if (!promise || promise.status !== 'DISPUTED') return res.status(400).json({ error: 'No dispute open.' });
     // Validation that executor is executorId omitted for brevity.

     const treeId = promise.task.branch.treeId;
     const member = await (prisma as any).treeMember.findUnique({
       where: { userId_treeId: { userId: promise.sponsorId, treeId } }
     });

     if (member) {
       let strikes: string[] = JSON.parse(member.strikesEconomicos || "[]");
       strikes.push(new Date().toISOString());

       // Filter 24 months
       const limitBorder = new Date();
       limitBorder.setMonth(limitBorder.getMonth() - 24);
       
       const validStrikes = strikes.filter(dateStr => new Date(dateStr) > limitBorder);
       
       let newStatus = member.status;
       let bayasUpdate = member.bayasBalance;

       // Regla de 3 Strikes -> Baneo Automatico y FLASH CRASH
       if (validStrikes.length >= 3) {
         newStatus = 'BANNED';
         bayasUpdate = 0; // FLASH CRASH INFERNO
       }

       await (prisma as any).treeMember.update({
         where: { id: member.id },
         data: {
           strikesEconomicos: JSON.stringify(validStrikes),
           status: newStatus,
           bayasBalance: bayasUpdate
         }
       });
     }

     const finalResult = await (prisma as any).promiseP2P.update({
       where: { id },
       data: { status: 'CANCELLED' } // Closed disputed
     });

     res.json(finalResult);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
};
