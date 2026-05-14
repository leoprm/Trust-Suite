# Design: Rating Cross-Árbol y Asignación de Puestos

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Scheduler (diario/semanal)              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ XP Decay Job │  │ Rotation Job │  │ Assignment Job│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │           │
└─────────┼─────────────────┼───────────────────┼───────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                    AgentProfile Service                    │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │ Recalculate│  │ ApplyDecay │  │ AssignToSlot      │  │
│  │ Profile    │  │ (exponential)│  │ (40/60 explore)  │  │
│  └─────┬──────┘  └─────┬──────┘  └────────┬──────────┘  │
│        │               │                  │              │
└────────┼───────────────┼──────────────────┼──────────────┘
         │               │                  │
         ▼               ▼                  ▼
┌──────────────────────────────────────────────────────────┐
│                       Database                             │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ AgentProfile│  │ AgentRoleHist  │  │   Rating     │  │
│  │ (cross-tree)│  │ (assignments)  │  │ (per-tree)   │  │
│  └─────────────┘  └────────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Esquema de BD

### AgentProfile (nueva)
```sql
CREATE TABLE AgentProfile (
  agentId VARCHAR(191) PRIMARY KEY,
  totalRatings INT NOT NULL DEFAULT 0,
  avgStars DOUBLE NOT NULL DEFAULT 0,
  xpByRole JSON NOT NULL DEFAULT '{}',       -- {"analyst":150,"researcher":80}
  primaryRole VARCHAR(191),                   -- "analyst"
  secondaryRole VARCHAR(191),                 -- "researcher"
  confidenceScore DOUBLE NOT NULL DEFAULT 0,  -- 0.0 to 1.0
  lastActiveAt DATETIME(3),
  explorationEligible BOOLEAN NOT NULL DEFAULT TRUE,
  currentTreeCount INT NOT NULL DEFAULT 0,    -- cuántos árboles activos
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (agentId) REFERENCES Agent(id) ON DELETE CASCADE
);
```

### AgentRoleHistory (nueva)
```sql
CREATE TABLE AgentRoleHistory (
  id VARCHAR(191) PRIMARY KEY,
  agentId VARCHAR(191) NOT NULL,
  treeId VARCHAR(191) NOT NULL,
  role VARCHAR(191) NOT NULL,              -- analyst, researcher, implementer...
  assignedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  releasedAt DATETIME(3),
  assignmentReason ENUM('EXPLORATION','EXPLOITATION','MANUAL') NOT NULL,
  performanceScore DOUBLE,                  -- avg stars durante asignación
  FOREIGN KEY (agentId) REFERENCES Agent(id) ON DELETE CASCADE,
  FOREIGN KEY (treeId) REFERENCES Tree(id) ON DELETE CASCADE
);
```

### Rating (modificar)
```sql
ALTER TABLE Rating ADD COLUMN crossTreeContribution BOOLEAN NOT NULL DEFAULT TRUE;
-- TRUE = este rating cuenta para el perfil cross-árbol
-- FALSE = solo cuenta para el árbol específico (ej: ratings manuales)
```

## Servicios

### agentProfileService.ts (nuevo)

```typescript
// Recalcular perfil cuando se crea un Rating
async function updateProfileFromRating(rating: Rating): Promise<void> {
  const profile = await prisma.agentProfile.upsert({
    where: { agentId: rating.agentId },
    create: { agentId: rating.agentId, ... },
    update: { ... },
  });
  
  // Sumar XP por rol
  const xpByRole = profile.xpByRole as Record<string, number>;
  xpByRole[rating.role] = (xpByRole[rating.role] || 0) + rating.stars;
  
  // Actualizar primary/secondary role
  const sorted = Object.entries(xpByRole).sort((a, b) => b[1] - a[1]);
  
  await prisma.agentProfile.update({
    where: { agentId: rating.agentId },
    data: {
      totalRatings: { increment: 1 },
      avgStars: calculateNewAvg(profile.avgStars, profile.totalRatings, rating.stars),
      xpByRole,
      primaryRole: sorted[0]?.[0] || null,
      secondaryRole: sorted[1]?.[0] || null,
      confidenceScore: Math.min(1, (profile.totalRatings + 1) / 100),
      lastActiveAt: new Date(),
      explorationEligible: (profile.totalRatings + 1) < 20,
    },
  });
}

// Aplicar decaimiento exponencial
async function applyDecay(lambda: number = 0.05): Promise<void> {
  const profiles = await prisma.agentProfile.findMany();
  const now = new Date();
  
  for (const profile of profiles) {
    if (!profile.lastActiveAt) continue;
    const days = (now.getTime() - profile.lastActiveAt.getTime()) / (24 * 3600 * 1000);
    if (days < 1) continue; // no decay if active today
    
    const decayFactor = Math.exp(-lambda * days);
    const xpByRole = profile.xpByRole as Record<string, number>;
    
    for (const role of Object.keys(xpByRole)) {
      xpByRole[role] = Math.max(1, Math.round(xpByRole[role] * decayFactor));
    }
    
    await prisma.agentProfile.update({
      where: { agentId: profile.agentId },
      data: { xpByRole },
    });
  }
}

// Asignar agente a un slot en un árbol
async function assignAgentToTreeSlot(
  treeId: string, 
  role: string
): Promise<string | null> {
  // 1. Verificar si el slot ya está ocupado
  const existing = await prisma.agentRoleHistory.findFirst({
    where: { treeId, role, releasedAt: null },
  });
  if (existing) return existing.agentId;
  
  // 2. Obtener agentes elegibles
  const explorationPool = await prisma.agentProfile.findMany({
    where: { explorationEligible: true, currentTreeCount: { lt: 2 } },
  });
  
  const exploitationPool = await prisma.agentProfile.findMany({
    where: { 
      explorationEligible: false, 
      primaryRole: role,
      currentTreeCount: { lt: 2 },
    },
    orderBy: { confidenceScore: 'desc' },
  });
  
  // 3. 40/60 random
  const useExploration = Math.random() < 0.4 && explorationPool.length > 0;
  const pool = useExploration ? explorationPool : exploitationPool;
  
  if (pool.length === 0) {
    // Fallback al otro pool
    const fallback = useExploration ? exploitationPool : explorationPool;
    if (fallback.length === 0) return null;
    return await assignAgent(fallback[0].agentId, treeId, role, 
      useExploration ? 'EXPLORATION' : 'EXPLOITATION');
  }
  
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return await assignAgent(selected.agentId, treeId, role,
    useExploration ? 'EXPLORATION' : 'EXPLOITATION');
}

async function assignAgent(
  agentId: string, treeId: string, role: string, reason: string
): Promise<string> {
  await prisma.$transaction([
    prisma.agentRoleHistory.create({
      data: { agentId, treeId, role, assignmentReason: reason },
    }),
    prisma.agentProfile.update({
      where: { agentId },
      data: { currentTreeCount: { increment: 1 } },
    }),
  ]);
  return agentId;
}
```

## Jobs del scheduler

### XP Decay Job (diario 03:00)
```typescript
// En src/bot/scheduler.ts
schedule.scheduleJob('0 3 * * *', async () => {
  console.log('[Scheduler] Running XP decay...');
  await agentProfileService.applyDecay(
    parseFloat(process.env.XP_DECAY_LAMBDA || '0.05')
  );
});
```

### Rotation Job (semanal domingo 00:00)
```typescript
schedule.scheduleJob('0 0 * * 0', async () => {
  console.log('[Scheduler] Running weekly rotation...');
  
  const trees = await prisma.tree.findMany();
  for (const tree of trees) {
    const roles = ['analyst', 'researcher', 'implementer', 'reviewer', 'mediator'];
    for (const role of roles) {
      // Evaluar agente actual
      const current = await prisma.agentRoleHistory.findFirst({
        where: { treeId: tree.id, role, releasedAt: null },
      });
      
      if (current) {
        const recentRatings = await prisma.rating.findMany({
          where: { 
            agentId: current.agentId, 
            treeId: tree.id,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
          },
        });
        
        const avgStars = recentRatings.reduce((s, r) => s + r.stars, 0) / (recentRatings.length || 1);
        
        if (recentRatings.length > 0 && avgStars < 2) {
          // Bajo desempeño → remover
          await releaseAgent(current.agentId, tree.id, role);
          // Reasignar
          await assignAgentToTreeSlot(tree.id, role);
        }
      } else {
        // Slot vacío → asignar
        await assignAgentToTreeSlot(tree.id, role);
      }
    }
  }
});
```

## Endpoints API

### GET /api/agents
```typescript
// Retorna lista de agentes con su perfil cross-árbol
router.get('/', async (req, res) => {
  const agents = await prisma.agent.findMany({
    include: { profile: true },
    orderBy: { profile: { totalRatings: 'desc' } },
  });
  res.json(agents);
});
```

### GET /api/agents/leaderboard?role=analyst
```typescript
router.get('/leaderboard', async (req, res) => {
  const role = req.query.role as string;
  const profiles = await prisma.agentProfile.findMany({
    where: role ? { primaryRole: role } : {},
    orderBy: { confidenceScore: 'desc' },
    take: 20,
  });
  res.json(profiles);
});
```

## Integración con Fase 1 (analyzer.ts)

```typescript
// En analyzer.ts, al crear un rating:
async function createSentimentRating(
  agentId: string, treeId: string, needId: string, 
  stars: number, messageText: string
) {
  // Detectar rol basado en keywords del mensaje
  let role = 'analyst'; // default
  if (/implement|desarrollo|código|pr|pull request|commit/i.test(messageText)) {
    role = 'implementer';
  } else if (/investig|research|paper|estudio|análisis/i.test(messageText)) {
    role = 'researcher';
  } else if (/review|revisión|validación|check/i.test(messageText)) {
    role = 'reviewer';
  } else if (/consenso|mediación|acuerdo|discusión/i.test(messageText)) {
    role = 'mediator';
  }
  
  await fetch('http://localhost:3100/api/ratings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SERVER_KEY}`,
    },
    body: JSON.stringify({
      agentId,
      treeId,
      taskId: needId, // usando needId como taskId
      ratings: [{ role, stars }],
      crossTreeContribution: true,
    }),
  });
}
```

## Orden de implementación

1. **SPEC-1**: Tabla AgentProfile + servicio de actualización
2. **SPEC-5**: Endpoints API (depende de SPEC-1)
3. **SPEC-2**: Decaimiento de XP (depende de SPEC-1)
4. **SPEC-3**: Motor de asignación (depende de SPEC-1)
5. **SPEC-4**: Rotación semanal (depende de SPEC-3)
6. **SPEC-6**: Integración con analyzer.ts (depende de Fase 1 + SPEC-1)
