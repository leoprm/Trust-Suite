// Inject daily financial data (90 days) with realistic variance for rich charts
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

function uuid() { return crypto.randomUUID(); }
function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rngFloat(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  const trees = await prisma.tree.findMany();
  
  const clients = ['Entel', 'Falabella', 'Cencosud', 'BCI', 'Sonda', 'MercadoLibre', 'Walmart Chile', 'Latam Airlines'];
  const suppliers = ['AWS', 'Google Cloud', 'WeWork', 'Notion', 'GitHub', 'Datadog', 'Microsoft', 'Slack'];
  const categories = ['EQUIPMENT', 'MATERIAL', 'MONEY', 'OTHER'];

  // Delete old monthly transactions to avoid duplicates
  await prisma.fiatTransaction.deleteMany({
    where: {
      description: { contains: 'operacionales' },
    }
  });
  console.log('Cleaned old monthly transactions');

  const now = new Date();
  const DAYS = 90;

  for (const tree of trees) {
    const scale = Math.max(1, Math.round((await prisma.treeMember.count({ where: { treeId: tree.id } })) / 5));
    const baseDailyRevenue = rng(2000000, 8000000) * scale; // 2-8M CLP/day base
    const baseDailyCost = rng(1000000, 6000000) * scale;

    const batch = [];
    for (let day = DAYS; day >= 0; day--) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      d.setHours(10, 0, 0, 0);

      // Revenue with ~20% daily variance + weekday/weekend pattern
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const weekendFactor = isWeekend ? rngFloat(0.2, 0.5) : rngFloat(0.9, 1.2);
      const revenue = Math.round(baseDailyRevenue * weekendFactor * rngFloat(0.85, 1.15));

      // Costs with steady baseline + occasional spikes
      const costSpike = Math.random() < 0.08 ? rngFloat(2, 5) : 1; // 8% chance of spike
      const cost = Math.round(baseDailyCost * costSpike * rngFloat(0.9, 1.1));

      batch.push({
        id: uuid(), treeId: tree.id, amount: revenue,
        type: 'INCOME', category: 'MONEY', currency: 'CLP',
        description: `Ingreso diario ${d.toISOString().split('T')[0]}`,
        counterpartyName: pick(clients), counterpartyType: 'CLIENT',
        verificationStatus: 'RECONCILED', createdAt: d,
      });

      batch.push({
        id: uuid(), treeId: tree.id, amount: cost,
        type: 'EXPENSE', category: pick(categories), currency: 'CLP',
        description: `Gasto operacional ${d.toISOString().split('T')[0]}`,
        counterpartyName: pick(suppliers), counterpartyType: 'SUPPLIER',
        verificationStatus: 'RECONCILED', createdAt: d,
      });
    }

    // Insert in chunks of 50
    for (let i = 0; i < batch.length; i += 50) {
      await prisma.fiatTransaction.createMany({ data: batch.slice(i, i + 50) });
    }
    console.log(`✅ ${tree.name}: ${batch.length} daily transactions injected`);
  }

  console.log(`\n🎯 Total: ${DAYS * 2 * trees.length} daily transactions across ${trees.length} trees`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
