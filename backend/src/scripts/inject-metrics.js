// Inject profitability, investment, and satisfaction data for each tree
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function uuid() { return crypto.randomUUID(); }
function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rngFloat(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  const trees = await prisma.tree.findMany({ include: { members: true } });
  console.log(`Found ${trees.length} trees`);

  for (const tree of trees) {
    console.log(`\n🌳 ${tree.name} (${tree.members.length} members)`);

    // Scale amounts based on tree "size" — more members = bigger numbers
    const scale = Math.max(1, Math.round(tree.members.length / 5));
    const monthlyRevenue = rng(15, 80) * scale; // in millones CLP
    const monthlyCosts = rng(8, 50) * scale;
    const monthlyProfit = monthlyRevenue - monthlyCosts;
    const totalInvestment = rng(50, 400) * scale;

    // ── 1. FIAT TRANSACTIONS ──
    const clients = ['Entel', 'Falabella', 'Cencosud', 'BCI', 'Sonda', 'MercadoLibre', 'Walmart Chile', 'Latam Airlines'];

    // Monthly revenue (last 6 months of INCOME)
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      months.push(d);
    }

    for (const m of months) {
      const variation = rngFloat(0.85, 1.15);
      await prisma.fiatTransaction.create({
        data: {
          id: uuid(), treeId: tree.id, amount: Math.round(monthlyRevenue * variation * 1000000),
          type: 'INCOME', category: 'MONEY', currency: 'CLP',
          description: `Ingresos operacionales ${m.toLocaleString('es-CL', { month: 'long', year: 'numeric' })}`,
          counterpartyName: pick(clients), counterpartyType: 'CLIENT',
          verificationStatus: 'RECONCILED', createdAt: m,
        }
      });

      await prisma.fiatTransaction.create({
        data: {
          id: uuid(), treeId: tree.id, amount: Math.round(monthlyCosts * variation * 1000000),
          type: 'EXPENSE', category: pick(['EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER']), currency: 'CLP',
          description: `Costos operacionales ${m.toLocaleString('es-CL', { month: 'long', year: 'numeric' })}`,
          counterpartyName: pick(['AWS', 'Google Cloud', 'WeWork', 'Notion', 'GitHub', 'Datadog']),
          counterpartyType: 'SUPPLIER',
          verificationStatus: 'RECONCILED', createdAt: m,
        }
      });
    }

    // Investment transactions
    const investments = [
      { amount: Math.round(totalInvestment * 0.4 * 1000000), desc: 'Ronda Serie A — Levantamiento de capital', cp: 'Kaszek Ventures', cpType: 'INSTITUTION' },
      { amount: Math.round(totalInvestment * 0.3 * 1000000), desc: 'Inversión en infraestructura cloud y CI/CD', cp: 'AWS', cpType: 'SUPPLIER' },
      { amount: Math.round(totalInvestment * 0.3 * 1000000), desc: 'Equipamiento para laboratorio de innovación', cp: 'Dell Technologies', cpType: 'SUPPLIER' },
    ];
    for (const inv of investments) {
      await prisma.fiatTransaction.create({
        data: {
          id: uuid(), treeId: tree.id, amount: inv.amount,
          type: 'INVESTMENT', category: 'EQUIPMENT', currency: 'CLP',
          description: inv.desc, counterpartyName: inv.cp, counterpartyType: inv.cpType,
          verificationStatus: 'RECONCILED', createdAt: new Date(now.getFullYear(), rng(0, 4), rng(1, 28)),
        }
      });
    }

    // ── 2. SATISFACTION (TreeMember) ──
    let totalSatisfaction = 0;
    for (const member of tree.members) {
      const satisfaction = rngFloat(3.2, 5.0); // 3.2-5.0 range
      totalSatisfaction += satisfaction;
      await prisma.treeMember.update({
        where: { id: member.id },
        data: {
          // Store satisfaction in XP as a proxy (or we can use a note field)
          xp: Math.max(member.xp, rng(100, 2000)),
          level: Math.max(member.level, rng(3, 10)),
        }
      });
    }
    const avgSatisfaction = tree.members.length > 0 ? totalSatisfaction / tree.members.length : 0;

    // ── 3. Store metrics in tree capacidades as JSON ──
    let capacidades = [];
    try {
      const raw = tree.capacidades || '[]';
      capacidades = JSON.parse(raw);
      if (!Array.isArray(capacidades)) capacidades = [];
    } catch {
      capacidades = [];
    }
    capacidades.push({
      type: 'financial_metrics',
      updatedAt: new Date().toISOString(),
      monthlyRevenue: monthlyRevenue * 1000000,
      monthlyCosts: monthlyCosts * 1000000,
      monthlyProfit: monthlyProfit * 1000000,
      totalInvestment: totalInvestment * 1000000,
      avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
      memberCount: tree.members.length,
      currency: 'CLP',
    });
    await prisma.tree.update({
      where: { id: tree.id },
      data: { capacidades: JSON.stringify(capacidades) },
    });

    console.log(`   Revenue: $${monthlyRevenue}M/mes | Costs: $${monthlyCosts}M/mes | Profit: $${monthlyProfit}M/mes`);
    console.log(`   Investment: $${totalInvestment}M | Satisfaction: ${avgSatisfaction.toFixed(1)}/5.0`);
    console.log(`   ✅ 15 transactions + member scores injected`);
  }

  console.log('\n✅ All trees updated with financial & satisfaction data');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
