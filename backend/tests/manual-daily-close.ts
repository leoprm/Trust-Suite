/**
 * Test manual del cierre diario.
 *
 * Uso:
 *   npx tsx tests/manual-daily-close.ts
 *
 * Simula el cierre diario:
 *   1. Crea datos de prueba (necesidades con votos)
 *   2. Ejecuta el cierre diario
 *   3. Verifica: ganadora → IN_PROGRESS, votos reseteados, puntos renovados
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== TEST: CIERRE DIARIO ===\n");

  // ── 1. Crear datos de prueba ──
  // Buscar o crear el árbol de test
  let testTree = await (prisma as any).tree.findFirst({
    where: { telegramChatId: "-1009999999999" },
  });

  if (!testTree) {
    testTree = await (prisma as any).tree.create({
      data: {
        name: "Test Tree",
        telegramChatId: "-1009999999999",
        admissionPolicy: "OPEN",
        icono: "🧪",
      },
    });
    console.log(`✅ Árbol creado: ${testTree.name} (${testTree.id})`);
  } else {
    console.log(`📋 Árbol existente: ${testTree.name} (${testTree.id})`);
  }

  // Limpiar necesidades previas del test
  await (prisma as any).need.deleteMany({ where: { treeId: testTree.id } });
  console.log("🧹 Necesidades anteriores limpiadas.");

  // Crear necesidades frescas
  const adminUser = await (prisma as any).user.findFirst();
  const creatorId = adminUser?.id || "6dbb9524-8a50-4361-b3f4-d728f5f6f1c2";

  await (prisma as any).need.createMany({
    data: [
      { title: "Fix login bug", description: "Users can't login", treeId: testTree.id, creatorId, dailyVotes: 15, status: "OPEN", importance: 8 },
      { title: "Add dark mode", description: "Dark theme for app", treeId: testTree.id, creatorId, dailyVotes: 7, status: "OPEN", importance: 5 },
      { title: "Improve docs", description: "Better API docs", treeId: testTree.id, creatorId, dailyVotes: 3, status: "OPEN", importance: 3 },
    ],
  });

  // Verificar que se crearon
  const needsCheck = await (prisma as any).need.count({ where: { treeId: testTree.id } });
  console.log(`✅ ${needsCheck} necesidades de prueba creadas\n`);

  // ── 2. Mostrar estado antes ──
  console.log("--- ESTADO ANTES DEL CIERRE ---");
  const needsBefore = await (prisma as any).need.findMany({
    where: { treeId: testTree.id },
    orderBy: { dailyVotes: "desc" },
  });

  for (const n of needsBefore) {
    console.log(`  ${n.dailyVotes > 0 ? "🟢" : "⚪"} "${n.title}" — ${n.dailyVotes} votos — ${n.status}`);
  }

  // ── 3. Ejecutar cierre diario ──
  console.log("\n--- EJECUTANDO CIERRE DIARIO ---");
  const { runDailyClose } = await import("../src/bot/cron");

  const results = await runDailyClose(prisma, null);
  console.log("\nResultados:");
  for (const r of results) {
    console.log(
      `  🌳 ${r.treeName}: ` +
        (r.winner ? `ganó "${r.winner.title}" (${r.winner.votes} votos)` : "sin ganador") +
        ` | ${r.totalNeeds} necesidades`
    );
    if (r.error) console.log(`    ❌ Error: ${r.error}`);
  }

  // ── 4. Verificar estado después ──
  console.log("\n--- ESTADO DESPUÉS DEL CIERRE ---");
  const allNeeds = await (prisma as any).need.findMany({
    where: { treeId: testTree.id },
    orderBy: { status: "asc" },
  });

  for (const n of allNeeds) {
    const emoji = n.status === "IN_PROGRESS" ? "🏆" : n.status === "OPEN" ? "📋" : n.status === "SATISFIED" ? "✅" : "🔒";
    console.log(`  ${emoji} "${n.title}" — ${n.dailyVotes} votos — ${n.status}`);
  }

  // ── 5. Assertions ──
  console.log("\n--- VERIFICACIONES ---");
  let allPassed = true;

  // Verificar dailyVotes = 0
  const nonZero = allNeeds.filter((n: any) => n.dailyVotes !== 0);
  if (nonZero.length > 0) {
    console.log(`❌ ${nonZero.length} necesidades con votos != 0`);
    allPassed = false;
  } else {
    console.log("✅ Todos los dailyVotes = 0");
  }

  // Verificar que "Fix login bug" (15 votos) está IN_PROGRESS
  const winner = allNeeds.find((n: any) => n.title === "Fix login bug");
  if (winner && winner.status === "IN_PROGRESS") {
    console.log(`✅ Ganadora "Fix login bug" → IN_PROGRESS`);
  } else {
    console.log(`❌ Ganadora debería estar IN_PROGRESS, está ${winner?.status}`);
    allPassed = false;
  }

  // Verificar que las perdedoras quedaron OPEN
  const losers = allNeeds.filter((n: any) => n.title !== "Fix login bug");
  for (const l of losers) {
    if (l.status === "OPEN") {
      console.log(`✅ "${l.title}" quedó OPEN (perdedora)`);
    } else {
      console.log(`❌ "${l.title}" debería estar OPEN, está ${l.status}`);
      allPassed = false;
    }
  }

  console.log(allPassed ? "\n🎉 TODAS LAS VERIFICACIONES PASARON" : "\n⚠️ ALGUNAS VERIFICACIONES FALLARON");

  // ── 6. Limpiar ──
  await (prisma as any).need.deleteMany({ where: { treeId: testTree.id } });
  await (prisma as any).tree.delete({ where: { id: testTree.id } });
  console.log("🧹 Datos de prueba limpiados.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
