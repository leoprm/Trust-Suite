import { buildSnapshot, buildDelta } from './src/services/conciergeContextService';
import { prisma } from './src/index';

async function main() {
  const tree = await prisma.tree.findFirst();
  if (!tree) { console.log('No trees'); process.exit(1); }

  console.log(`Testing with tree: ${tree.name} (${tree.id})`);

  // Test snapshot
  console.log('\n=== SNAPSHOT ===');
  const snapshot = await buildSnapshot(tree.id);
  if (!snapshot) { console.log('FAIL: snapshot null'); process.exit(1); }
  console.log(`  tree: ${snapshot.tree.name} (${snapshot.tree.memberCount} members, ${snapshot.tree.openNeedCount} needs)`);
  console.log(`  members: ${snapshot.members.length}`);
  console.log(`  needs: ${snapshot.needs.length}`);
  console.log(`  tasks: ${snapshot.tasks.length}`);
  console.log(`  ratings: ${snapshot.ratings.length}`);
  console.log(`  timeline: ${snapshot.timeline.last48h.length} events (48h), ${snapshot.timeline.summary.totalEvents} total (30d)`);
  console.log(`  generatedAt: ${snapshot.generatedAt}`);

  // Test delta
  console.log('\n=== DELTA ===');
  const delta = await buildDelta(tree.id);
  console.log(`  providerRatings: ${delta.providerRatings.length} providers`);
  for (const r of delta.providerRatings) {
    console.log(`    ${r.provider}: ${r.avgStars}★ (${r.totalRatings} ratings, ${r.treeCount} trees)`);
  }
  console.log(`  tokenCosts: ${delta.tokenCosts.length} providers`);
  for (const c of delta.tokenCosts) {
    console.log(`    ${c.provider}: $${c.inputCostPer1M}/$M in, $${c.outputCostPer1M}/$M out`);
  }
  console.log(`  maintenance: $${delta.maintenance.totalFixed} total (salaries: $${delta.maintenance.salaries}, infra: $${delta.maintenance.infrastructure}, margin: ${delta.maintenance.growthMarginPct}%)`);
  console.log(`  financialHealth: balance=$${delta.financialHealth.balance}, margin=${delta.financialHealth.marginMonths}mo, delinquency=${delta.financialHealth.delinquencyPct}%`);
  console.log(`  benchmarks: ${delta.crossTreeBenchmarks.length} metrics`);
  console.log(`  resourceConsumption: ${delta.resourceConsumption.tokensToday} today, ${delta.resourceConsumption.tokensThisMonth} this month, sandbox=${delta.resourceConsumption.sandboxUsagePct}%`);
  console.log(`  agentAvailability: ${delta.agentAvailability.totalAgents} agents, ${delta.agentAvailability.online} online`);
  console.log(`  alerts: ${delta.alerts.length}`);
  console.log(`  generatedAt: ${delta.generatedAt}`);

  console.log('\n✅ ALL TESTS PASSED');
  process.exit(0);
}

main().catch(err => { console.error('FAIL:', err); process.exit(1); });
