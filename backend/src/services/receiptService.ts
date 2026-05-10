import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { UPLOAD_ROOT, sanitizeOriginalName } from '../utils/fileSecurity';

// ── Receipt directory ─────────────────────────────────────────────────────
const RECEIPTS_DIR = path.join(UPLOAD_ROOT, 'receipts');

async function ensureReceiptDir() {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
}

// ── Receipt file storage ──────────────────────────────────────────────────

/**
 * Saves an uploaded receipt buffer to disk.
 * Returns { relativePath, originalName, storedName }.
 */
export async function saveReceiptFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ relativePath: string; originalName: string; storedName: string }> {
  await ensureReceiptDir();

  const sanitized = sanitizeOriginalName(originalName);
  const ext = path.extname(sanitized).toLowerCase();
  const storedName = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(RECEIPTS_DIR, storedName);

  await fs.writeFile(filePath, buffer);

  return {
    relativePath: `receipts/${storedName}`,
    originalName: sanitized,
    storedName,
  };
}

/**
 * Reads a receipt file from disk and returns its buffer + mime type.
 */
export async function readReceiptFile(
  relativePath: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const fullPath = path.join(UPLOAD_ROOT, relativePath);
  // Path traversal guard
  if (!fullPath.startsWith(UPLOAD_ROOT)) return null;

  try {
    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(relativePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.pdf': 'application/pdf',
    };
    return { buffer, mimeType: mimeMap[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

// ── Image preprocessing with sharp ───────────────────────────────────────

/**
 * Preprocesses an image buffer for OCR: grayscale, contrast boost, threshold.
 */
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .grayscale()
    .normalize()
    .linear(1.3, -(128 * 0.3)) // contrast boost
    .sharpen()
    .toBuffer();
}

// ── OCR via Tesseract.js ─────────────────────────────────────────────────

let tesseractWorker: any = null;
let tesseractReady = false;

async function initTesseract(): Promise<boolean> {
  if (tesseractReady) return true;
  try {
    const Tesseract = require('tesseract.js');
    tesseractWorker = await Tesseract.createWorker('spa', 1, {
      logger: () => {}, // silence progress logs
    });
    tesseractReady = true;
    return true;
  } catch {
    tesseractReady = false;
    return false;
  }
}

/**
 * Runs OCR on an image buffer.
 * Returns the extracted text string.
 * Falls back to null if Tesseract is unavailable.
 */
async function runOCR(imageBuffer: Buffer): Promise<string | null> {
  const ready = await initTesseract();
  if (!ready || !tesseractWorker) return null;

  try {
    const { data } = await tesseractWorker.recognize(imageBuffer);
    return data.text || null;
  } catch {
    return null;
  }
}

// ── PDF to image conversion ──────────────────────────────────────────────

/**
 * Attempts to convert first page of a PDF to PNG buffer using sharp.
 * Returns null if unsupported (sharp not compiled with PDF support).
 */
async function pdfToImage(buffer: Buffer): Promise<Buffer | null> {
  try {
    return sharp(buffer, { page: 0, density: 150 })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// ── OCR result structure ─────────────────────────────────────────────────

export interface OcrResult {
  success: boolean;
  mode: 'ocr' | 'manual';
  extracted?: {
    amount?: number;
    rawAmount?: string;
    date?: string;
    reference?: string;
  };
  rawText?: string;
  error?: string;
}

// ── Amount & Date extraction from OCR text ───────────────────────────────

/**
 * Extracts a monetary amount from OCR text.
 * Handles formats: $10.000, $10,000, 10000, CLP 10000, etc.
 */
function extractAmount(text: string): { amount?: number; raw?: string } {
  // Match patterns like: $10.000, $10,000.50, CLP 10000, 10.000,00, 10000.00
  const patterns = [
    /\$[\s]*([\d.,]+)/gi,
    /(?:CLP|USD|EUR)[\s]*([\d.,]+)/gi,
    /(?:MONTO|TOTAL|IMPORTE|VALOR)[\s:]*[\$]?[\s]*([\d.,]+)/gi,
    /([\d]{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?)/g,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const m of matches) {
      let raw = m[1] || m[0];
      raw = raw.replace(/[^,\d.]/g, '');

      // Normalize: if it has comma and period, comma is thousands separator
      let amount: number;
      if (raw.includes(',') && raw.includes('.')) {
        // e.g. "10,000.50" or "10.000,50" — determine which is decimal
        const lastDot = raw.lastIndexOf('.');
        const lastComma = raw.lastIndexOf(',');
        if (lastDot > lastComma) {
          // period is decimal: "10,000.50"
          amount = parseFloat(raw.replace(/,/g, ''));
        } else {
          // comma is decimal: "10.000,50"
          amount = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
        }
      } else if (raw.includes(',')) {
        // Only commas: could be "10,000" or "10,50" — check position
        const parts = raw.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          amount = parseFloat(raw.replace(',', '.'));
        } else {
          amount = parseFloat(raw.replace(/,/g, ''));
        }
      } else {
        amount = parseFloat(raw);
      }

      if (!isNaN(amount) && amount > 0 && amount < 1_000_000_000) {
        return { amount, raw };
      }
    }
  }

  return {};
}

/**
 * Extracts a date from OCR text.
 * Handles formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.
 */
function extractDate(text: string): string | undefined {
  const patterns = [
    /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/,
    /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/,
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const parts = m.slice(1, 4).map(Number);
      // DD/MM/YYYY format
      if (parts[0] <= 31 && parts[1] <= 12 && parts[2] >= 2000) {
        const y = parts[2], mo = String(parts[1]).padStart(2, '0'), d = String(parts[0]).padStart(2, '0');
        return `${y}-${mo}-${d}`;
      }
      // YYYY-MM-DD format
      if (parts[0] >= 2000 && parts[1] <= 12 && parts[2] <= 31) {
        const y = parts[0], mo = String(parts[1]).padStart(2, '0'), d = String(parts[2]).padStart(2, '0');
        return `${y}-${mo}-${d}`;
      }
    }
  }

  return undefined;
}

/**
 * Extracts a reference/beneficiary name from OCR text.
 */
function extractReference(text: string): string | undefined {
  const patterns = [
    /(?:DESTINATARIO|BENEFICIARIO|RECEPTOR|A NOMBRE DE|TRANSFERENCIA A)[\s:]+([^\n]{5,60})/i,
    /(?:REFERENCIA|REF\.?|NRO?\.?\s*REF)[\s:]+([^\n]{3,30})/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      return m[1].trim().replace(/\s+/g, ' ');
    }
  }
  return undefined;
}

// ── Main OCR pipeline ────────────────────────────────────────────────────

/**
 * Processes a receipt file buffer through the OCR pipeline:
 * 1. Preprocess image (sharp)
 * 2. Run OCR (Tesseract.js)
 * 3. Extract amount, date, reference
 *
 * Falls back to manual mode if Tesseract is unavailable.
 */
export async function processReceiptWithOCR(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  // Try to init Tesseract
  const hasTesseract = await initTesseract();

  if (!hasTesseract) {
    return {
      success: true,
      mode: 'manual',
      error: 'Tesseract no disponible. El comprobante queda pendiente de revisión manual.',
    };
  }

  let imageBuffer: Buffer;

  try {
    // Convert PDF to image if needed
    if (mimeType === 'application/pdf') {
      const converted = await pdfToImage(buffer);
      if (!converted) {
        return {
          success: true,
          mode: 'manual',
          error: 'No se pudo convertir PDF a imagen para OCR. Revisión manual requerida.',
        };
      }
      imageBuffer = converted;
    } else {
      imageBuffer = buffer;
    }

    // Preprocess for better OCR
    const processed = await preprocessImage(imageBuffer);

    // Run OCR
    const rawText = await runOCR(processed);

    if (!rawText || rawText.trim().length < 5) {
      return {
        success: true,
        mode: 'manual',
        rawText: rawText || '',
        error: 'OCR no pudo extraer texto suficiente. Revisión manual requerida.',
      };
    }

    // Extract fields
    const amountExtract = extractAmount(rawText);
    const date = extractDate(rawText);
    const reference = extractReference(rawText);

    return {
      success: true,
      mode: 'ocr',
      extracted: {
        amount: amountExtract.amount,
        rawAmount: amountExtract.raw,
        date,
        reference,
      },
      rawText,
    };
  } catch (err: any) {
    return {
      success: false,
      mode: 'manual',
      error: `Error de OCR: ${err.message || 'desconocido'}`,
    };
  }
}

// ── Receipt comparison logic ─────────────────────────────────────────────

export interface ReceiptMatch {
  matched: boolean;
  reasons: string[];
  extractedAmount?: number;
  expectedAmount: number;
  extractedDate?: string;
  tolerance: number; // 5%
  dateDriftDays: number; // 2 days
}

/**
 * Compares OCR-extracted amount and date with the expected MemberPayment.
 * Tolerance: ±5% for amount, ±2 days for date.
 */
export function compareReceipt(
  ocrResult: OcrResult,
  expectedAmount: number,
): ReceiptMatch {
  const reasons: string[] = [];
  const tolerance = 0.05;
  const dateDriftDays = 2;

  const match: ReceiptMatch = {
    matched: true,
    reasons,
    expectedAmount,
    extractedAmount: ocrResult.extracted?.amount,
    extractedDate: ocrResult.extracted?.date,
    tolerance,
    dateDriftDays,
  };

  if (ocrResult.mode === 'manual') {
    match.matched = false;
    reasons.push(`Modo manual: ${ocrResult.error || 'pendiente de revisión'}`);
    return match;
  }

  // Compare amounts
  const extracted = ocrResult.extracted?.amount;
  if (extracted === undefined || isNaN(extracted)) {
    match.matched = false;
    reasons.push('No se pudo detectar monto en el comprobante');
  } else {
    const diff = Math.abs(extracted - expectedAmount);
    const maxDiff = expectedAmount * tolerance;
    if (diff > maxDiff) {
      match.matched = false;
      reasons.push(
        `Monto no coincide: detectado $${extracted.toLocaleString('es-CL')}, esperado $${expectedAmount.toLocaleString('es-CL')} (±${(tolerance * 100).toFixed(0)}%)`,
      );
    }
  }

  // Compare dates (only if extracted)
  if (ocrResult.extracted?.date) {
    const extDate = new Date(ocrResult.extracted.date);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - extDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays > dateDriftDays) {
      // Date outside 2-day window — non-blocking warning (OCR dates can be noisy)
      reasons.push(
        `Fecha del comprobante (${ocrResult.extracted.date}) difiere más de ${dateDriftDays} días`,
      );
      // Don't set match=false for date drift — OCR date parsing is too unreliable
    }
  }

  return match;
}
