import PDFDocument from 'pdfkit';
import { prisma } from '../index';

const TRUST_DARK = '#0a0a0f';
const TRUST_BLUE = '#3b82f6';
const TRUST_GREEN = '#10b981';
const TRUST_RED = '#ef4444';
const TRUST_AMBER = '#f59e0b';
const TRUST_LIGHTER = '#94a3b8';
const TRUST_LIGHT_BG = '#f1f5f9';

function formatCurrency(amount: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function parseJsonField(raw: string | null, fallback: any = []): any {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function generateTreePdf(treeId: string): Promise<{ buffer: Buffer; treeName: string }> {
  const tree = await prisma.tree.findUnique({
    where: { id: treeId },
    include: {
      members: {
        include: { user: { select: { username: true } } },
        orderBy: { xp: 'desc' },
      },
      _count: { select: { members: true } },
    },
  });

  if (!tree) throw new Error('Tree not found');

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [fiatTxns, tasks] = await Promise.all([
    prisma.fiatTransaction.findMany({
      where: { treeId, date: { gte: sixMonthsAgo } },
      orderBy: { date: 'desc' },
      include: { createdBy: { select: { username: true } } },
    }),
    prisma.task.findMany({
      where: {
        branch: { treeId },
        status: { in: ['COMPLETED', 'OPEN', 'IN_PROGRESS'] as any },
      },
      include: { tags: { select: { skillName: true } } },
    }),
  ]);

  // Executive summary calcs
  const totalMembers = tree._count.members;
  const incomeTxns = fiatTxns.filter(t => t.type === 'INCOME');
  const expenseTxns = fiatTxns.filter(t => t.type === 'EXPENSE');
  const totalIncome = incomeTxns.reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = expenseTxns.reduce((sum, t) => sum + t.amount, 0);
  const monthlyProfit = totalIncome - totalExpense;
  const investmentTxns = fiatTxns.filter(t => t.type === 'INVESTMENT');
  const totalInvested = investmentTxns.reduce((sum, t) => sum + t.amount, 0);
  const investmentPct = totalIncome > 0 ? (totalInvested / totalIncome) * 100 : 0;

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
  const pendingTasks = tasks.filter(t => t.status !== 'COMPLETED');

  // Skill distribution from task tags
  const skillCounts = new Map<string, number>();
  for (const t of tasks) {
    for (const tag of t.tags) {
      skillCounts.set(tag.skillName, (skillCounts.get(tag.skillName) || 0) + 1);
    }
  }

  // Satisfaction — average of branch votes if available
  let avgSatisfaction = 0;
  try {
    const votes = await (prisma as any).branchNeedVote.findMany({
      where: { branch: { treeId } },
      select: { score: true },
    });
    if (votes.length > 0) {
      avgSatisfaction = votes.reduce((s: number, v: any) => s + v.score, 0) / votes.length;
    }
  } catch {
    avgSatisfaction = 0;
  }

  // ── Generate PDF ──
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: `Trust Report - ${tree.name}`,
      Author: 'Trust Suite',
      Subject: 'Tree Financial & Member Report',
    },
  });

  // Track footer stamping — stamp before each new page, and on final page
  let pageNum = 1;
  const footerHeight = 40;

  function stampFooter() {
    doc.fontSize(8).fillColor(TRUST_LIGHTER);
    doc.text(
      `Generado por Trust Suite — trust-lite.com | Página ${pageNum}`,
      50, doc.page.height - footerHeight,
      { align: 'center', width: doc.page.width - 100 },
    );
  }

  function newPage() {
    stampFooter();
    pageNum++;
    doc.addPage();
  }

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const leftX = 50;
  const rightX = 50;
  let y: number;

  // ── Cover Page ──
  y = 150;
  doc.fontSize(10).fillColor(TRUST_BLUE).text('TRUST SUITE', leftX, y, { align: 'center' });
  y += 30;
  doc.fontSize(28).fillColor(TRUST_DARK).font('Helvetica-Bold')
    .text('Reporte de Árbol', leftX, y, { align: 'center' });
  y += 45;
  doc.fontSize(20).fillColor(TRUST_BLUE).text(tree.name, leftX, y, { align: 'center' });
  y += 60;

  doc.fontSize(12).fillColor(TRUST_LIGHTER).font('Helvetica');
  doc.text(`Fecha de generación: ${formatDate(new Date())}`, leftX, y, { align: 'center' });
  y += 25;
  doc.text(`Identificador del Árbol: ${tree.id}`, leftX, y, { align: 'center' });
  y += 25;
  doc.text(`Visibilidad: ${tree.visibility || 'PRIVATE'}`, leftX, y, { align: 'center' });

  y += 60;
  doc.moveTo(leftX + 100, y).lineTo(480, y).strokeColor(TRUST_BLUE).lineWidth(1).stroke();
  y += 20;
  doc.fontSize(10).fillColor(TRUST_LIGHTER)
    .text('Este reporte contiene métricas financieras, de miembros y tareas', leftX, y, {
      align: 'center',
      width: doc.page.width - 100,
    });
  y += 20;
  doc.text('para análisis interno y toma de decisiones.', leftX, y, {
    align: 'center',
    width: doc.page.width - 100,
  });

  newPage();

  // ── Executive Summary ──
  y = doc.y + 20;
  doc.fontSize(18).fillColor(TRUST_DARK).font('Helvetica-Bold')
    .text('Resumen Ejecutivo', leftX, y);
  y += 10;
  doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_BLUE).lineWidth(2).stroke();
  y += 25;

  const summaryItems = [
    { label: 'Total Miembros', value: String(totalMembers) },
    { label: 'Ingresos (6 meses)', value: formatCurrency(totalIncome) },
    { label: 'Egresos (6 meses)', value: formatCurrency(totalExpense) },
    { label: 'Balance Neto', value: formatCurrency(monthlyProfit), color: monthlyProfit >= 0 ? TRUST_GREEN : TRUST_RED },
    { label: 'Inversión (% de ingresos)', value: `${investmentPct.toFixed(1)}%` },
    { label: 'Satisfacción Promedio', value: avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/100` : 'Sin datos' },
    { label: 'Tareas Completadas', value: String(completedTasks.length) },
    { label: 'Tareas Pendientes', value: String(pendingTasks.length) },
  ];

  const col1X = leftX;
  const col2X = 310;
  let rowY = y;
  for (let i = 0; i < summaryItems.length; i++) {
    const col = i % 2;
    const x = col === 0 ? col1X : col2X;
    if (col === 0 && i > 0) rowY += 30;

    doc.fontSize(11).fillColor(TRUST_LIGHTER).font('Helvetica')
      .text(summaryItems[i].label, x, rowY, { continued: false, width: 250 });
    doc.fontSize(14).fillColor(summaryItems[i].color || TRUST_DARK).font('Helvetica-Bold')
      .text(summaryItems[i].value, x, rowY + 16, { width: 250 });
  }
  y = rowY + 60;

  // ── FIAT Transactions ──
  if (doc.y > 600) doc.addPage();
  y = Math.max(doc.y + 20, y);
  doc.fontSize(18).fillColor(TRUST_DARK).font('Helvetica-Bold')
    .text('Transacciones FIAT (últimos 6 meses)', leftX, y);
  y += 10;
  doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_BLUE).lineWidth(2).stroke();
  y += 20;

  if (fiatTxns.length === 0) {
    doc.fontSize(12).fillColor(TRUST_LIGHTER).font('Helvetica-Oblique')
      .text('Sin transacciones FIAT registradas en este período.', leftX, y);
  } else {
    // Table header
    const cols = [
      { label: 'Fecha', x: leftX, w: 90 },
      { label: 'Tipo', x: leftX + 95, w: 70 },
      { label: 'Monto', x: leftX + 170, w: 80 },
      { label: 'Descripción', x: leftX + 255, w: 200 },
      { label: 'Verificación', x: leftX + 460, w: 85 },
    ];

    doc.fontSize(9).fillColor(TRUST_DARK).font('Helvetica-Bold');
    for (const c of cols) {
      doc.text(c.label, c.x, y, { width: c.w });
    }
    y += 5;
    doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_LIGHTER).lineWidth(0.5).stroke();
    y += 10;

    doc.fontSize(8).font('Helvetica');
    for (const tx of fiatTxns.slice(0, 30)) {
      if (y > 750) { doc.addPage(); y = 50; }
      const txColor = tx.type === 'INCOME' ? TRUST_GREEN : tx.type === 'EXPENSE' ? TRUST_RED : TRUST_DARK;
      doc.fillColor(TRUST_DARK).text(formatDate(tx.date).slice(0, 12), cols[0].x, y, { width: cols[0].w });
      doc.fillColor(txColor).text(tx.type, cols[1].x, y, { width: cols[1].w });
      doc.fillColor(TRUST_DARK).text(formatCurrency(tx.amount, tx.currency), cols[2].x, y, { width: cols[2].w });
      doc.fillColor(TRUST_LIGHTER).text((tx.description || '').slice(0, 40), cols[3].x, y, { width: cols[3].w });
      doc.fillColor(TRUST_LIGHTER).text(tx.verificationStatus, cols[4].x, y, { width: cols[4].w });
      y += 18;
    }
    if (fiatTxns.length > 30) {
      doc.fontSize(9).fillColor(TRUST_LIGHTER).font('Helvetica-Oblique')
        .text(`... y ${fiatTxns.length - 30} transacciones más`, leftX, y);
    }
  }

  // ── Task Metrics ──
  if (doc.y > 600) doc.addPage();
  y = Math.max(doc.y + 25, doc.y);
  doc.fontSize(18).fillColor(TRUST_DARK).font('Helvetica-Bold')
    .text('Métricas de Tareas', leftX, y);
  y += 10;
  doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_BLUE).lineWidth(2).stroke();
  y += 20;

  if (tasks.length === 0) {
    doc.fontSize(12).fillColor(TRUST_LIGHTER).font('Helvetica-Oblique')
      .text('Sin tareas registradas.', leftX, y);
  } else {
    // Completion pie
    doc.fontSize(12).fillColor(TRUST_DARK).font('Helvetica-Bold')
      .text('Distribución de Estado', leftX, y);
    y += 18;
    doc.fontSize(11).font('Helvetica');
    doc.fillColor(TRUST_GREEN).text(`✓ Completadas: ${completedTasks.length} (${((completedTasks.length / tasks.length) * 100).toFixed(0)}%)`, leftX, y);
    y += 20;
    doc.fillColor(TRUST_AMBER).text(`◷ Pendientes/En Progreso: ${pendingTasks.length} (${((pendingTasks.length / tasks.length) * 100).toFixed(0)}%)`, leftX, y);
    y += 30;

    // Skill distribution
    if (skillCounts.size > 0) {
      doc.fontSize(12).fillColor(TRUST_DARK).font('Helvetica-Bold')
        .text('Distribución por Skill', leftX, y);
      y += 18;
      const sorted = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [skill, count] of sorted.slice(0, 15)) {
        if (y > 750) { doc.addPage(); y = 50; }
        const barW = Math.max(count * 8, 10);
        doc.fontSize(9).font('Helvetica').fillColor(TRUST_DARK);
        doc.text(skill, leftX, y, { width: 120 });
        doc.rect(leftX + 125, y + 2, barW, 12).fillColor(TRUST_BLUE).fill();
        doc.fillColor(TRUST_DARK).text(String(count), leftX + 130 + barW, y - 1);
        y += 20;
      }
    }
  }

  // ── Members Table ──
  if (doc.y > 600) doc.addPage();
  y = Math.max(doc.y + 25, doc.y);
  doc.fontSize(18).fillColor(TRUST_DARK).font('Helvetica-Bold')
    .text('Miembros del Árbol', leftX, y);
  y += 10;
  doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_BLUE).lineWidth(2).stroke();
  y += 20;

  if (tree.members.length === 0) {
    doc.fontSize(12).fillColor(TRUST_LIGHTER).font('Helvetica-Oblique')
      .text('Sin miembros registrados.', leftX, y);
  } else {
    const mCols = [
      { label: '#', x: leftX, w: 25 },
      { label: 'Usuario', x: leftX + 30, w: 110 },
      { label: 'Rol', x: leftX + 145, w: 70 },
      { label: 'XP', x: leftX + 220, w: 50 },
      { label: 'Nivel', x: leftX + 275, w: 50 },
      { label: 'Skills', x: leftX + 330, w: 215 },
    ];

    doc.fontSize(9).fillColor(TRUST_DARK).font('Helvetica-Bold');
    for (const c of mCols) {
      doc.text(c.label, c.x, y, { width: c.w });
    }
    y += 5;
    doc.moveTo(leftX, y).lineTo(550, y).strokeColor(TRUST_LIGHTER).lineWidth(0.5).stroke();
    y += 10;

    doc.fontSize(8).font('Helvetica');
    tree.members.forEach((m, i) => {
      if (y > 760) { doc.addPage(); y = 50; }
      const skills = parseJsonField(m.skills, []).join(', ') || '—';
      const roleLabel = m.role === 'ADMIN' ? 'Admin' : m.userId === tree.creatorId ? 'Creador' : 'Miembro';
      const roleColor = m.role === 'ADMIN' || m.userId === tree.creatorId ? TRUST_BLUE : TRUST_LIGHTER;
      const memberBgColor = i % 2 === 0 ? TRUST_LIGHT_BG : undefined;

      if (memberBgColor) {
        doc.rect(leftX, y - 2, 500, 18).fillColor(memberBgColor).fill();
      }
      doc.fillColor(TRUST_LIGHTER).text(String(i + 1), mCols[0].x, y, { width: mCols[0].w });
      doc.fillColor(TRUST_DARK).text(m.user?.username || 'Unknown', mCols[1].x, y, { width: mCols[1].w });
      doc.fillColor(roleColor).text(roleLabel, mCols[2].x, y, { width: mCols[2].w });
      doc.fillColor(TRUST_DARK).text(String(Math.floor(m.xp)), mCols[3].x, y, { width: mCols[3].w });
      doc.fillColor(TRUST_DARK).text(String(m.level), mCols[4].x, y, { width: mCols[4].w });
      doc.fillColor(TRUST_LIGHTER).text(skills.slice(0, 50), mCols[5].x, y, { width: mCols[5].w });
      y += 18;
    });
  }

  // Stamp footer on the final page
  stampFooter();

  doc.end();

  return new Promise<{ buffer: Buffer; treeName: string }>((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), treeName: tree.name }));
    doc.on('error', reject);
  });
}
