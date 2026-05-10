import { Response } from 'express';
import multer from 'multer';
import { prisma } from '../index';
import {
  saveReceiptFile,
  readReceiptFile,
  processReceiptWithOCR,
  compareReceipt,
} from '../services/receiptService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ── Multer config for receipts ───────────────────────────────────────────
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Formato no permitido. Use PNG, JPG o PDF.'));
      return;
    }
    cb(null, true);
  },
}).single('receipt');

// ── Multer error wrapper ─────────────────────────────────────────────────
function handleUpload(req: any, res: Response): Promise<Express.Multer.File> {
  return new Promise((resolve, reject) => {
    receiptUpload(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return reject(new Error('El archivo excede el tamaño máximo de 5MB'));
          }
          return reject(new Error(`Error de subida: ${err.message}`));
        }
        return reject(err);
      }
      if (!req.file) {
        return reject(new Error('No se recibió ningún archivo'));
      }
      resolve(req.file);
    });
  });
}

// ── POST /api/payments/:id/receipt ───────────────────────────────────────

export const uploadReceipt = async (req: any, res: Response) => {
  try {
    // 1. Handle file upload
    let file: Express.Multer.File;
    try {
      file = await handleUpload(req, res);
    } catch (uploadErr: any) {
      return res.status(400).json({ error: uploadErr.message });
    }

    const paymentId = String(req.params.id);

    // 2. Fetch payment with member info
    const payment = await prisma.memberPayment.findUnique({
      where: { id: paymentId },
      include: {
        member: {
          select: { userId: true, treeId: true },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    // 3. Ownership check: only the member who owns the payment can upload
    if (payment.member.userId !== req.user!.id) {
      return res.status(403).json({
        error: 'Solo el miembro dueño del pago puede subir el comprobante',
      });
    }

    // 4. Anti-spam: max 3 attempts
    if (payment.receiptAttempts >= 3) {
      return res.status(429).json({
        error: 'Has alcanzado el máximo de 3 intentos de subida para este pago',
        attempts: payment.receiptAttempts,
      });
    }

    // 5. Status check: only PLEDGED payments can receive receipts
    if (payment.status !== 'PLEDGED') {
      return res.status(400).json({
        error: `El pago ya está en estado ${payment.status}. Solo pagos PLEDGED aceptan comprobantes.`,
      });
    }

    // 6. Save file to disk
    const saved = await saveReceiptFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // 7. Process with OCR
    const ocrResult = await processReceiptWithOCR(file.buffer, file.mimetype);

    // 8. Compare with expected payment
    const match = compareReceipt(ocrResult, payment.amount);

    // 9. Update payment
    const ocrData = {
      mode: ocrResult.mode,
      extracted: ocrResult.extracted,
      matched: match.matched,
      comparedAt: new Date().toISOString(),
    };

    if (match.matched) {
      // Mark as PAID
      await prisma.memberPayment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          receiptPath: saved.relativePath,
          receiptFileName: saved.originalName,
          receiptAttempts: { increment: 1 },
          receiptJSON: ocrData,
          paidAt: new Date(),
        },
      });

      void logEvent({
        ...getRequestContext(req),
        treeId: payment.treeId,
        actorId: req.user!.id,
        action: 'PAYMENT_RECEIPT_VERIFIED',
        entityType: 'MemberPayment',
        entityId: paymentId,
        metadataJson: getRequestMetadata(req, {
          mode: ocrResult.mode,
          detectedAmount: ocrResult.extracted?.amount,
          detectedDate: ocrResult.extracted?.date,
        }),
        severity: 'INFO',
      });

      return res.json({
        success: true,
        match: true,
        payment: {
          id: paymentId,
          status: 'PAID',
          receiptPath: saved.relativePath,
        },
        ocr: {
          mode: ocrResult.mode,
          extracted: ocrResult.extracted,
        },
      });
    }

    // No match — increment attempts, save file but don't mark as paid
    await prisma.memberPayment.update({
      where: { id: paymentId },
      data: {
        receiptPath: saved.relativePath,
        receiptFileName: saved.originalName,
        receiptAttempts: { increment: 1 },
        receiptJSON: ocrData,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: payment.treeId,
      actorId: req.user!.id,
      action: 'PAYMENT_RECEIPT_REJECTED',
      entityType: 'MemberPayment',
      entityId: paymentId,
      metadataJson: getRequestMetadata(req, {
        mode: ocrResult.mode,
        detectedAmount: ocrResult.extracted?.amount,
        expectedAmount: payment.amount,
        reasons: match.reasons,
        attempt: payment.receiptAttempts + 1,
      }),
      severity: 'WARNING',
    });

    return res.json({
      success: true,
      match: false,
      reasons: match.reasons,
      payment: {
        id: paymentId,
        status: 'PLEDGED',
        attempts: payment.receiptAttempts + 1,
        maxAttempts: 3,
      },
      ocr: {
        mode: ocrResult.mode,
        extracted: ocrResult.extracted,
        rawText: ocrResult.rawText,
      },
    });
  } catch (err: any) {
    console.error('[uploadReceipt]', err);
    return res.status(500).json({
      error: 'Error interno al procesar comprobante',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
};

// ── GET /api/payments/:id ──────────────────────────────────────────────

export const getPayment = async (req: any, res: Response) => {
  try {
    const paymentId = String(req.params.id);

    const payment = await prisma.memberPayment.findUnique({
      where: { id: paymentId },
      include: {
        member: {
          select: { userId: true, treeId: true },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    // Access check: payment owner or tree admin
    const userId = req.user!.id;
    const isOwner = payment.member.userId === userId;

    let isAdmin = false;
    if (!isOwner) {
      const memberRecord = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId, treeId: payment.treeId } },
        select: { role: true },
      });
      isAdmin = memberRecord?.role === 'ADMIN';
    }

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para ver este pago' });
    }

    res.json({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      period: payment.period,
      status: payment.status,
      paidAt: payment.paidAt,
      receiptPath: payment.receiptPath,
      receiptFileName: payment.receiptFileName,
      receiptAttempts: payment.receiptAttempts,
      receiptJSON: payment.receiptJSON,
    });
  } catch (err: any) {
    console.error('[getPayment]', err);
    return res.status(500).json({
      error: 'Error interno al obtener pago',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
};

// ── GET /api/payments/:id/receipt ────────────────────────────────────────

export const getReceipt = async (req: any, res: Response) => {
  try {
    const paymentId = String(req.params.id);

    const payment = await prisma.memberPayment.findUnique({
      where: { id: paymentId },
      include: {
        member: { select: { userId: true } },
        tree: { select: { visibility: true } },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    // Access check: payment owner or tree admin
    const userId = req.user!.id;
    const isOwner = payment.member.userId === userId;

    let isAdmin = false;
    if (!isOwner) {
      const memberRecord = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId, treeId: payment.treeId } },
        select: { role: true },
      });
      isAdmin = memberRecord?.role === 'ADMIN';
    }

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para ver este comprobante' });
    }

    if (!payment.receiptPath) {
      return res.status(404).json({ error: 'No se ha subido comprobante para este pago' });
    }

    // Read file from disk
    const fileData = await readReceiptFile(payment.receiptPath);
    if (!fileData) {
      return res.status(404).json({ error: 'Archivo de comprobante no encontrado en disco' });
    }

    res.setHeader('Content-Type', fileData.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="comprobante-${paymentId}${payment.receiptFileName ? '-' + payment.receiptFileName : ''}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.send(fileData.buffer);
  } catch (err: any) {
    console.error('[getReceipt]', err);
    return res.status(500).json({
      error: 'Error interno al obtener comprobante',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
};
