# Design: Operaciones Autónomas

## Componentes nuevos

### genesisService.ts
```typescript
async function onTreeCreated(tree: Tree): Promise<void> {
  const roles = ['analyst', 'researcher', 'implementer'];
  for (const role of roles) {
    await assignAgentToTreeSlot(tree.id, role); // Fase 2
  }
  await prisma.need.create({
    data: {
      title: '¿Qué debe lograr este árbol primero?',
      description: 'Necesidad inicial de génesis. Define el propósito del árbol.',
      treeId: tree.id, creatorId: 'system',
      status: 'OPEN', importance: 5,
    },
  });
  if (tree.telegramChatId) {
    await sendTelegramMessage(tree.telegramChatId, WELCOME_MSG);
  }
}
```

### taskRouter.ts
```typescript
async function routeTask(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const role = inferRole(task.tags);
  const agents = await getActiveAgentsForTree(task.treeId, role);
  const available = agents.filter(a => a.activeTaskCount < 3);
  if (available.length === 0) return null;
  const best = available.sort((a, b) =>
    (b.confidenceScore * 0.7 + (1 - b.activeTaskCount/3) * 0.3) -
    (a.confidenceScore * 0.7 + (1 - a.activeTaskCount/3) * 0.3)
  )[0];
  await assignTask(taskId, best.id);
  return best.id;
}
```

### autoScaler.ts
```typescript
// Job cada 6 horas
async function autoScale(): Promise<void> {
  const trees = await prisma.tree.findMany();
  for (const tree of trees) {
    const openNeeds = await prisma.need.count({ where: { treeId: tree.id, status: 'OPEN' } });
    const activeAgents = await prisma.agentRoleHistory.count({
      where: { treeId: tree.id, releasedAt: null },
    });
    if (openNeeds > 5 && activeAgents < 5) {
      const role = await detectNeededRole(tree.id);
      await assignAgentToTreeSlot(tree.id, role);
    }
    if (openNeeds < 2 && activeAgents > 3) {
      const leastActive = await findLeastActiveAgent(tree.id);
      await releaseAgent(leastActive.agentId, tree.id, leastActive.role);
    }
  }
}
```

## Integración con treeController
Agregar llamada a `onTreeCreated()` después de crear árbol.

## Dashboard: extender analyticsController
Ya existe `src/controllers/` con algunos endpoints. Extender con queries agregadas desde Rating + AgentProfile.
