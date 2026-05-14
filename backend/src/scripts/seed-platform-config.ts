import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIG_SEED = [
  // Costos fijos mensuales (USD)
  { key: 'cost_salaries',       value: '5000',  label: 'Sueldos del equipo',           category: 'fixed' },
  { key: 'cost_infrastructure', value: '1200',  label: 'Servidores, APIs, hosting',    category: 'fixed' },
  { key: 'cost_fixed',          value: '800',   label: 'Electricidad, internet, oficina', category: 'fixed' },

  // Costos de API por proveedor (USD por 1M tokens)
  { key: 'cost_api_input_1m',   value: '0.27',  label: 'Costo API — input 1M tokens (DeepSeek)',  category: 'api_cost' },
  { key: 'cost_api_output_1m',  value: '1.10',  label: 'Costo API — output 1M tokens (DeepSeek)', category: 'api_cost' },
  { key: 'cost_openai_input_1m',  value: '2.50',  label: 'Costo OpenAI — input 1M tokens',  category: 'api_cost' },
  { key: 'cost_openai_output_1m', value: '10.00', label: 'Costo OpenAI — output 1M tokens', category: 'api_cost' },
  { key: 'cost_anthropic_input_1m',  value: '3.00',  label: 'Costo Anthropic — input 1M tokens',  category: 'api_cost' },
  { key: 'cost_anthropic_output_1m', value: '15.00', label: 'Costo Anthropic — output 1M tokens', category: 'api_cost' },

  // Margen de crecimiento
  { key: 'growth_margin_pct', value: '20', label: 'Margen de crecimiento (%)', category: 'margin' },
];

async function main() {
  console.log('[seed-platform-config] Iniciando...');

  for (const cfg of CONFIG_SEED) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO PlatformConfig (id, \`key\`, value, label, category, createdAt, updatedAt)
       VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE value = VALUES(value), label = VALUES(label), category = VALUES(category), updatedAt = NOW()`,
      cfg.key, cfg.value, cfg.label, cfg.category
    );
    console.log(`  ✓ ${cfg.key} = ${cfg.value}`);
  }

  console.log('[seed-platform-config] Listo.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
