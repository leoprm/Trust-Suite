# Protocolo: Necesidad Base (Sedimentación Orgánica a 12 Meses)

> **Versión**: 1.0.0 — Diseño
> **Fecha**: 2026-05-11
> **Estado**: ⚠️ NO IMPLEMENTADO — solo diseño

---

## 1. Especificación del Protocolo

### 1.1 Propósito

Una Necesidad que permanece **activa durante 12 meses** continuos adquiere legitimidad histórica suficiente para convertirse en **Necesidad Base**: un estado especial donde la necesidad se mantiene abierta por su trayectoria, no por asignación activa de puntos. Esto libera el pool de puntos semanales de los usuarios para nuevas prioridades mientras preserva el valor acumulado de necesidades longevas.

### 1.2 Mecánica

#### Sedimentación (ACTIVE → BASE)

**Condiciones de elegibilidad:**
- `status === 'ACTIVE'` (no IN_PROGRESS ni RESOLVED)
- `createdAt` ≥ 12 meses atrás
- `isBase === false` (no sedimentada previamente)
- `relevanceThresholdMet === true` (tuvo apoyo suficiente en algún momento)

**Qué ocurre al sedimentar:**

1. **Conserva legitimidad acumulada**: historial de votos (`NeedFunding`), badges (`relevanceThresholdMet`, `quorumMet`), peso en decisiones de gobernanza.
2. **Libera puntos de asignación**: `totalPointsAssigned` se congela a 0. Los `NeedFunding` existentes se preservan para auditoría pero la necesidad ya no consume del pool semanal. Los usuarios NO recuperan sus `weeklyNeedPoints` ya gastados — simplemente la necesidad deja de requerir puntos para mantenerse.
3. **Generación de tareas y XP restringida**: Solo se puede ganar XP mediante **trabajo verificable** — un `EvidenceFile` con `visibility !== 'PRIVATE'` y `status === 'ACTIVE'` debe estar asociado a la task para que `completeTask` otorgue XP. Sin evidence aprobado → task se completa sin XP.
4. **Se congela la línea base**: `baselineUserCount` = número de usuarios activos en el árbol (ver §1.3) en el instante de sedimentación. Este número es el ancla para el decay.

#### Decay (BASE → ACTIVE, pérdida de estado)

**Revisión**: Cada **3 meses** (ciclo), un cron job evalúa todas las necesidades base.

**Condiciones de degradación (AMBAS deben cumplirse):**
1. **Ciclo actual**: `activeUsers(tree) < 66% × baselineUserCount`
2. **Ciclo anterior**: `activeUsers(tree) < 66% × baselineUserCount`

Es decir: **2 ciclos consecutivos (6 meses)** por debajo del 66% de la línea base.

**Qué ocurre al degradar:**
1. `isBase = false`, `sedimentedAt = null`
2. La necesidad vuelve a ser `ACTIVE` normal
3. Se notifica a todos los usuarios activos del árbol: "Esta necesidad ahora es normal, asígnale puntos si quieres mantenerla."
4. Se loguea `NEED_DEGRADED_FROM_BASE` en EventLog

#### Re-sedimentación

Una necesidad que fue degradada puede volver a sedimentar si vuelve a cumplir 12 meses como ACTIVE. No hay límite de ciclos de sedimentación/degradación.

### 1.3 Definición de "Usuarios Activos" (Usuarios Finales)

Para el conteo de `baselineUserCount` y las revisiones trimestrales:

**Definición propuesta**: Miembros del árbol con `status === 'VERIFIED'` y `lastActiveAt` en los últimos 90 días. Si el campo `lastActiveAt` no existe en `TreeMember`, se usa `membership.status === 'VERIFIED'` como proxy (todo miembro verificado cuenta como activo).

**Alternativa (más precisa pero más costosa)**: Usuarios que han completado al menos 1 task en branches derivados de esta necesidad en los últimos 90 días. Esta definición es más fiel a "usuarios que se benefician de la necesidad" pero requiere joins complejos (Need → Idea → Branch → Task → assignedTo).

**Recomendación**: Usar la definición simple (miembros verificados del árbol) para el MVP. La alternativa se puede implementar como optimización futura si se detecta que el proxy es insuficiente.

### 1.4 Flujo completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA DE UNA NECESIDAD               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    12 meses     ┌──────────────┐                  │
│  │  ACTIVE  │ ───────────────→│  BASE NEED   │                  │
│  │ (normal) │                 │ (sedimentada)│                  │
│  └──────────┘                 └──────┬───────┘                  │
│       ↑                              │                          │
│       │                              │ cada 3 meses             │
│       │                              ▼                          │
│       │                    ┌──────────────────┐                 │
│       │                    │ ¿activeUsers     │                 │
│       │                    │  < 66% baseline  │                 │
│       │                    │  × 2 ciclos?     │                 │
│       │                    └────┬───┬─────────┘                 │
│       │                         │   │                           │
│       │                    NO ◄─┘   └─► SÍ                      │
│       │                         │       │                       │
│       │                    ┌────▼──┐    │                       │
│       │                    │ Sigue │    │                       │
│       │                    │ BASE  │    │                       │
│       │                    └───────┘    │                       │
│       │                                ▼                       │
│       │                      ┌─────────────────┐               │
│       └──────────────────────│   DEGRADADA     │               │
│            vuelve a ACTIVE   │ (vuelve normal) │               │
│            (reasignar puntos)└─────────────────┘               │
│                                                                 │
│  Requisitos para sedimentar:                                    │
│  • status = ACTIVE                                              │
│  • createdAt ≥ 12 meses                                         │
│  • relevanceThresholdMet = true                                 │
│  • isBase = false                                               │
│                                                                 │
│  Al sedimentar:                                                 │
│  • isBase = true                                                │
│  • sedimentedAt = now()                                         │
│  • baselineUserCount = miembros verificados del árbol           │
│  • totalPointsAssigned = 0 (libera pool)                        │
│  • lastReviewCycle1 = null, userCountCycle1 = null              │
│  • lastReviewCycle2 = null, userCountCycle2 = null              │
│                                                                 │
│  Al degradar:                                                   │
│  • isBase = false                                               │
│  • sedimentedAt = null                                          │
│  • baselineUserCount = null                                     │
│  • Se notifica a todos los miembros del árbol                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Schema Prisma (Diff Propuesto)

### 2.1 Campos nuevos en `model Need`

```prisma
model Need {
  // ... campos existentes ...

  // ── Base Need (sedimentación a 12 meses) ─────────────────────
  isBase              Boolean   @default(false)
  sedimentedAt        DateTime?
  baselineUserCount   Int?

  // Ciclos de revisión trimestral (para decay)
  lastReviewCycle1    DateTime?   // fecha del primer ciclo de revisión
  lastReviewCycle2    DateTime?   // fecha del segundo ciclo (más reciente)
  userCountCycle1     Int?        // conteo de usuarios en ciclo 1
  userCountCycle2     Int?        // conteo de usuarios en ciclo 2

  // ... resto de campos y relaciones ...
}
```

### 2.2 SQL equivalente (para migration.sql)

```sql
ALTER TABLE Need
  ADD COLUMN isBase TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN sedimentedAt DATETIME(3) NULL,
  ADD COLUMN baselineUserCount INT NULL,
  ADD COLUMN lastReviewCycle1 DATETIME(3) NULL,
  ADD COLUMN lastReviewCycle2 DATETIME(3) NULL,
  ADD COLUMN userCountCycle1 INT NULL,
  ADD COLUMN userCountCycle2 INT NULL;
```

### 2.3 Decisión: campos inline vs modelo separado

Se opta por **agregar campos a `Need`** en vez de crear un modelo `BaseNeed` separado porque:
- La relación es 1:1 (una necesidad es base o no lo es)
- Simplifica queries: no se necesita join extra
- Los campos son pocos (7) y semánticamente pertenecen a Need
- Evita el patrón de tabla satélite que complica migraciones y relaciones

---

## 3. Archivos a Crear/Modificar

### 3.1 Archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `backend/src/services/baseNeedService.ts` | Lógica de negocio completa |
| `backend/src/cron/baseNeedReviewCron.ts` | Cron trimestral de revisión |
| `backend/src/routes/baseNeedRoutes.ts` | Endpoints de Base Need |
| `backend/src/controllers/baseNeedController.ts` | Handlers HTTP |

### 3.2 Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `backend/prisma/schema.prisma` | Agregar 7 campos a `Need` |
| `backend/src/index.ts` | Importar y montar `baseNeedRoutes`, llamar `startBaseNeedReviewCron()` |
| `backend/src/controllers/taskController.ts:completeTask` | Agregar gate: si need es Base, verificar EvidenceFile antes de XP |
| `backend/src/controllers/needController.ts` | Agregar `getNeed` (single) y extender `getNeeds` con campos base |
| `backend/src/routes/needRoutes.ts` | Agregar `GET /:id` |

---

## 4. Lógica de Negocio (`baseNeedService.ts`)

### 4.1 `checkSedimentationEligibility(needId: string): Promise<boolean>`

```typescript
export async function checkSedimentationEligibility(needId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: { include: { tree: true } } },
  });

  if (!need) return { eligible: false, reason: 'Need not found' };
  if (need.isBase) return { eligible: false, reason: 'Already a Base Need' };
  if (need.status !== 'ACTIVE') return { eligible: false, reason: 'Status is not ACTIVE' };
  if (!need.relevanceThresholdMet) return { eligible: false, reason: 'Relevance threshold never met' };

  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  if (need.createdAt > twelveMonthsAgo) {
    const daysRemaining = Math.ceil((need.createdAt.getTime() - twelveMonthsAgo.getTime()) / (1000 * 60 * 60 * 24));
    return { eligible: false, reason: `${daysRemaining} days remaining until 12 months` };
  }

  return { eligible: true };
}
```

### 4.2 `sedimentNeed(needId: string, actorId?: string): Promise<Need>`

```typescript
export async function sedimentNeed(needId: string, actorId?: string): Promise<any> {
  const eligibility = await checkSedimentationEligibility(needId);
  if (!eligibility.eligible) {
    throw new Error(`Not eligible: ${eligibility.reason}`);
  }

  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: true },
  });
  if (!need) throw new Error('Need not found');

  // Contar usuarios activos: miembros verificados de los árboles de esta necesidad
  const treeIds = need.treeLinks.map(tl => tl.treeId);
  const activeUsers = await prisma.treeMember.count({
    where: {
      treeId: { in: treeIds },
      status: 'VERIFIED',
    },
  });

  const before = { ...need };

  const updated = await prisma.need.update({
    where: { id: needId },
    data: {
      isBase: true,
      sedimentedAt: new Date(),
      baselineUserCount: activeUsers,
      totalPointsAssigned: 0, // Libera el pool de puntos
      // Resetear ciclos de revisión
      lastReviewCycle1: null,
      lastReviewCycle2: null,
      userCountCycle1: null,
      userCountCycle2: null,
    },
  });

  // EventLog
  void logEvent({
    treeId: treeIds[0], // el primer árbol como referencia
    actorId: actorId || 'SYSTEM',
    action: 'NEED_SEDIMENTED_AS_BASE',
    entityType: 'Need',
    entityId: needId,
    beforeJson: { status: before.status, isBase: before.isBase, totalPointsAssigned: before.totalPointsAssigned },
    afterJson: { isBase: true, baselineUserCount: activeUsers, sedimentedAt: updated.sedimentedAt },
    severity: 'INFO',
    source: actorId ? 'USER' : 'AUTOMATION',
  });

  // Notificar a miembros de los árboles
  await notifyTreeMembersOfSedimentation(need, treeIds);

  return updated;
}
```

### 4.3 `reviewBaseNeeds(): Promise<{ reviewed: number; degraded: number }>`

```typescript
export async function reviewBaseNeeds(): Promise<{ reviewed: number; degraded: number }> {
  const baseNeeds = await prisma.need.findMany({
    where: { isBase: true, status: 'ACTIVE' },
    include: { treeLinks: true },
  });

  let degraded = 0;
  const now = new Date();

  for (const need of baseNeeds) {
    const treeIds = need.treeLinks.map(tl => tl.treeId);
    const currentUserCount = await prisma.treeMember.count({
      where: { treeId: { in: treeIds }, status: 'VERIFIED' },
    });

    const threshold = Math.floor((need.baselineUserCount || 1) * 0.66);
    const belowThreshold = currentUserCount < threshold;

    // Shift: cycle2 ← cycle1, cycle1 ← current
    const newCycle1 = { lastReviewCycle1: now, userCountCycle1: currentUserCount };
    const newCycle2 = need.lastReviewCycle1
      ? { lastReviewCycle2: need.lastReviewCycle1, userCountCycle2: need.userCountCycle1 }
      : {};

    if (belowThreshold && need.userCountCycle1 !== null && need.userCountCycle1 < threshold) {
      // 2 ciclos consecutivos debajo del threshold → DEGRADAR
      await degradeBaseNeed(need.id, currentUserCount, need.baselineUserCount || 0);
      degraded++;
    } else {
      // Solo actualizar los contadores de ciclo
      await prisma.need.update({
        where: { id: need.id },
        data: { ...newCycle1, ...newCycle2 },
      });
    }
  }

  console.log(`[BaseNeedReview] Reviewed: ${baseNeeds.length}, Degraded: ${degraded}`);
  return { reviewed: baseNeeds.length, degraded };
}
```

### 4.4 `degradeBaseNeed(needId: string, currentUserCount: number, baselineCount: number): Promise<void>`

```typescript
export async function degradeBaseNeed(
  needId: string,
  currentUserCount: number,
  baselineCount: number
): Promise<void> {
  const need = await prisma.need.findUnique({
    where: { id: needId },
    include: { treeLinks: true },
  });
  if (!need) return;

  const before = { isBase: need.isBase, sedimentedAt: need.sedimentedAt, baselineUserCount: need.baselineUserCount };

  await prisma.need.update({
    where: { id: needId },
    data: {
      isBase: false,
      sedimentedAt: null,
      baselineUserCount: null,
      lastReviewCycle1: null,
      lastReviewCycle2: null,
      userCountCycle1: null,
      userCountCycle2: null,
    },
  });

  // EventLog
  const treeIds = need.treeLinks.map(tl => tl.treeId);
  void logEvent({
    treeId: treeIds[0],
    actorId: 'SYSTEM',
    action: 'NEED_DEGRADED_FROM_BASE',
    entityType: 'Need',
    entityId: needId,
    beforeJson: before,
    afterJson: {
      isBase: false,
      reason: `activeUsers (${currentUserCount}) < 66% baseline (${baselineCount}) for 2 cycles`,
    },
    severity: 'WARNING',
    source: 'AUTOMATION',
  });

  // Notificar usuarios activos
  await notifyUsersOnDegradation(need, treeIds);
}
```

### 4.5 Notificaciones

```typescript
async function notifyTreeMembersOfSedimentation(need: any, treeIds: string[]): Promise<void> {
  const members = await prisma.treeMember.findMany({
    where: { treeId: { in: treeIds } },
    select: { userId: true },
  });
  const uniqueUserIds = [...new Set(members.map(m => m.userId))];

  for (const userId of uniqueUserIds) {
    await createNotification({
      userId,
      type: 'INFO',
      category: 'ARBOL',
      title: '🏛️ Necesidad sedimentada como Base',
      body: `"${need.title}" ha alcanzado 12 meses de actividad y ahora es una Necesidad Base. Ya no consume puntos — se mantiene por su legitimidad histórica.`,
      entityType: 'NEED',
      entityAction: 'SEDIMENTED',
      entityId: need.id,
    });
  }
}

async function notifyUsersOnDegradation(need: any, treeIds: string[]): Promise<void> {
  const members = await prisma.treeMember.findMany({
    where: { treeId: { in: treeIds } },
    select: { userId: true },
  });
  const uniqueUserIds = [...new Set(members.map(m => m.userId))];

  for (const userId of uniqueUserIds) {
    await createNotification({
      userId,
      type: 'WARNING',
      category: 'ARBOL',
      title: '⚠️ Necesidad Base degradada',
      body: `"${need.title}" ha perdido su estado Base por baja actividad. Ahora es una necesidad normal — asígnale puntos si quieres mantenerla activa.`,
      entityType: 'NEED',
      entityAction: 'DEGRADED',
      entityId: need.id,
    });
  }
}
```

---

## 5. Cron Job (`baseNeedReviewCron.ts`)

```typescript
import { prisma } from '../index';
import { reviewBaseNeeds } from '../services/baseNeedService';

/**
 * Cron trimestral: revisa todas las necesidades Base.
 * Corre cada 3 meses (el día 1 a las 04:00 UTC).
 * 
 * Primer ciclo: 1 de enero, 1 de abril, 1 de julio, 1 de octubre.
 */
export async function runBaseNeedReview() {
  console.log('[BaseNeedReview] Starting quarterly review...');
  try {
    const result = await reviewBaseNeeds();
    console.log(`[BaseNeedReview] Done. Reviewed: ${result.reviewed}, Degraded: ${result.degraded}`);
  } catch (err: any) {
    console.error('[BaseNeedReview] Error:', err.message);
  }
}

export function startBaseNeedReviewCron() {
  const now = new Date();

  // Calcular próximo 1ro del trimestre a las 04:00 UTC
  const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4, 0, 0));
  // Avanzar hasta que sea un mes de trimestre (0,3,6,9) y sea futuro
  while (nextRun.getUTCMonth() % 3 !== 0) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  }
  if (nextRun <= now) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 3);
  }

  const msUntil = nextRun.getTime() - now.getTime();
  console.log(`[BaseNeedReview] Quarterly cron scheduled. First run: ${nextRun.toISOString()} (in ${Math.round(msUntil / 1000 / 3600)} hours).`);

  setTimeout(() => {
    runBaseNeedReview().catch(err =>
      console.error('[BaseNeedReview] Run failed:', err.message)
    );
    // Repetir cada 90 días (~3 meses)
    setInterval(() => {
      runBaseNeedReview().catch(err =>
        console.error('[BaseNeedReview] Run failed:', err.message)
      );
    }, 90 * 24 * 60 * 60 * 1000);
  }, msUntil);
}
```

---

## 6. Endpoints API

### 6.1 `GET /api/needs/:id` (NUEVO — single need)

Actualmente no existe endpoint para obtener una necesidad individual.

```typescript
// needController.ts
export const getNeed = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const need = await prisma.need.findUnique({
      where: { id },
      include: {
        creator: { select: { username: true } },
        treeLinks: { include: { tree: { select: { id: true, name: true } } } },
        _count: { select: { ideas: true, fundings: true } },
        ideas: {
          select: { id: true, branch: { select: { id: true } } },
          orderBy: { likesCount: 'desc' },
          take: 1,
        },
      },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const formatted = {
      ...need,
      branchId: (need as any).ideas[0]?.branch?.id ?? null,
      // Campos de Base Need ya vienen incluidos en ...need
    };
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Need' });
  }
};
```

### 6.2 `POST /api/needs/:id/sediment` (NUEVO — admin)

Fuerza la sedimentación manual de una necesidad elegible. Solo admin.

```typescript
// baseNeedController.ts
export const forceSediment = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { id } = req.params;
    const updated = await sedimentNeed(id, req.user.id);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
```

### 6.3 `GET /api/needs/base` (NUEVO)

Lista necesidades base de un árbol.

```typescript
// baseNeedController.ts
export const getBaseNeeds = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId required' });

    const needs = await prisma.need.findMany({
      where: {
        isBase: true,
        treeLinks: { some: { treeId: treeId as string } },
      },
      include: {
        creator: { select: { username: true } },
        _count: { select: { ideas: true, fundings: true } },
        ideas: { select: { id: true, branch: { select: { id: true } } }, orderBy: { likesCount: 'desc' }, take: 1 },
      },
      orderBy: { sedimentedAt: 'desc' },
    });

    res.json(needs.map((n: any) => ({
      ...n,
      branchId: n.ideas[0]?.branch?.id ?? null,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch base needs' });
  }
};
```

### 6.4 `GET /api/needs/:id/base-status` (NUEVO)

Estado detallado de sedimentación de una necesidad.

```typescript
// baseNeedController.ts
export const getBaseStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const need = await prisma.need.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isBase: true,
        sedimentedAt: true,
        baselineUserCount: true,
        createdAt: true,
        status: true,
        relevanceThresholdMet: true,
        lastReviewCycle1: true,
        lastReviewCycle2: true,
        userCountCycle1: true,
        userCountCycle2: true,
      },
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });

    // Calcular elegibilidad
    const eligibility = need.isBase ? null : await checkSedimentationEligibility(id);
    const twelveMonths = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const daysUntilEligible = need.createdAt > twelveMonths
      ? Math.ceil((need.createdAt.getTime() - twelveMonths.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Si es base, calcular estado actual de decay
    let decayStatus = null;
    if (need.isBase && need.baselineUserCount) {
      const treeIds = (await prisma.need.findUnique({
        where: { id },
        include: { treeLinks: { select: { treeId: true } } },
      }))?.treeLinks.map(tl => tl.treeId) || [];

      const currentUsers = await prisma.treeMember.count({
        where: { treeId: { in: treeIds }, status: 'VERIFIED' },
      });

      const threshold = Math.floor(need.baselineUserCount * 0.66);
      const cyclesBelow = [
        need.userCountCycle2 !== null && need.userCountCycle2 < threshold ? 2 : 0,
        need.userCountCycle1 !== null && need.userCountCycle1 < threshold ? 1 : 0,
        currentUsers < threshold ? 1 : 0,
      ].filter(Boolean).length;

      decayStatus = {
        currentUsers,
        baseline: need.baselineUserCount,
        threshold,
        belowThreshold: currentUsers < threshold,
        consecutiveCyclesBelow: cyclesBelow,
        willDegradeNextCycle: currentUsers < threshold && need.userCountCycle1 !== null && need.userCountCycle1 < threshold,
      };
    }

    res.json({
      ...need,
      eligibility: eligibility || { eligible: false, reason: 'Already Base' },
      daysUntilEligible,
      decayStatus,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch base status' });
  }
};
```

### 6.5 `POST /api/tasks/:id/complete` — MODIFICACIÓN

Agregar **gate de evidence para Base Needs** antes de otorgar XP:

```typescript
// En completeTask, después de la validación de 24h y antes de calcular XP:

// ── Base Need evidence gate ──────────────────────────────────────
const need = task.branch?.idea?.need;
if (need?.isBase) {
  // Verificar que existe un EvidenceFile aprobado para esta task
  const evidenceCount = await prisma.evidenceFile.count({
    where: {
      taskId: id,
      status: 'ACTIVE',
      visibility: { not: 'PRIVATE' },
    },
  });

  if (evidenceCount === 0) {
    // Completar la task sin XP
    await prisma.task.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        evidenceUrl: evidenceUrl || currentTask.evidenceUrl,
        completionComment: comment !== undefined ? comment : currentTask.completionComment,
        completionPhotoUrl: resolvedPhotoUrl ?? currentTask.completionPhotoUrl,
        completedAt: currentTask.completedAt || new Date(),
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: treeIds[0],
      actorId: req.user!.id,
      action: 'TASK_COMPLETED_NO_XP',
      entityType: 'Task',
      entityId: id,
      metadataJson: { reason: 'Base Need requires approved evidence file for XP' },
      severity: 'INFO',
      source: 'USER',
    });

    return res.json({
      ...updatedTask,
      xpAwarded: 0,
      message: 'Tarea completada. No se otorgó XP: la Necesidad Base requiere evidencia verificable.',
    });
  }
}
// ── Fin gate ─────────────────────────────────────────────────────
```

### 6.6 `GET /api/needs` — MODIFICACIÓN

El endpoint existente `getNeeds` ya usa `...n` en el spread del formateo, por lo que los nuevos campos (`isBase`, `sedimentedAt`, etc.) se incluirán automáticamente. No se requiere modificación adicional, pero se recomienda verificar que el frontend no rompa con campos nuevos.

---

## 7. Plan de Implementación por Fases

### Fase 1 — Schema y migración (30 min)
- [ ] Agregar 7 campos a `Need` en `schema.prisma`
- [ ] Escribir `migration.sql` manual
- [ ] Ejecutar migración en MySQL
- [ ] `npx prisma generate`

### Fase 2 — Service layer (45 min)
- [ ] Crear `backend/src/services/baseNeedService.ts`
- [ ] Implementar `checkSedimentationEligibility`
- [ ] Implementar `sedimentNeed`
- [ ] Implementar `reviewBaseNeeds`
- [ ] Implementar `degradeBaseNeed`
- [ ] Implementar helpers de notificación

### Fase 3 — Cron job (20 min)
- [ ] Crear `backend/src/cron/baseNeedReviewCron.ts`
- [ ] Importar y llamar en `index.ts`

### Fase 4 — Endpoints (30 min)
- [ ] Crear `backend/src/controllers/baseNeedController.ts`
- [ ] Crear `backend/src/routes/baseNeedRoutes.ts`
- [ ] Agregar `GET /:id` en `needController.ts` y `needRoutes.ts`
- [ ] Montar rutas en `index.ts`

### Fase 5 — Gate de evidence en completeTask (15 min)
- [ ] Modificar `completeTask` en `taskController.ts`
- [ ] Verificar que el gate no interfiera con el flujo normal (needs no-base)

### Fase 6 — Testing (30 min)
- [ ] Seed: crear una necesidad con 12 meses de antigüedad
- [ ] Verificar sedimentación automática (cron)
- [ ] Verificar sedimentación manual (POST /needs/:id/sediment)
- [ ] Crear task en branch de need base, completar sin evidence → 0 XP
- [ ] Completar con evidence → XP normal
- [ ] Simular decay: bajar userCount, correr 2 ciclos → degradación

### Fase 7 — Frontend (opcional, fuera de este diseño)
- [ ] Badge "Base" en tarjetas de necesidad
- [ ] Página de estado de sedimentación
- [ ] Panel admin para forzar sedimentación

---

## 8. Notas y Decisiones de Diseño

### 8.1 ¿Por qué no un modelo separado `BaseNeed`?
Relación 1:1, pocos campos, simplifica queries y evita migraciones complejas. Si en el futuro se necesitan más atributos específicos de Base Need (ej: configuraciones de decay por árbol), se puede migrar a tabla separada.

### 8.2 ¿Qué son "usuarios activos"?
Para el MVP: miembros `VERIFIED` del árbol. Esto es un proxy conservador. Si el árbol tiene 100 verified, la necesidad base se mantiene mientras ≥66 sigan verificados. Alternativa más precisa: usuarios con tasks completadas en branches de esta necesidad en últimos 90 días — se puede implementar como `baseNeedUserTrackingService` en el futuro.

### 8.3 ¿Se liberan puntos o se cancelan?
Los `NeedFunding` existentes se preservan (auditoría). `totalPointsAssigned` se pone a 0. Los usuarios NO recuperan `weeklyNeedPoints` — esos puntos ya fueron "gastados" al asignarlos. La necesidad simplemente deja de consumir del pool.

### 8.4 ¿El cron corre exactamente cada 3 meses?
Sí. Se alinea al primer día del trimestre (enero, abril, julio, octubre) a las 04:00 UTC. Esto da margen después de los otros crons nocturnos (02:00 skillInfluence, 03:00 quorumTimeout).

### 8.5 ¿Qué pasa si una necesidad base se resuelve?
Si `status` cambia a `RESOLVED`, la necesidad deja de ser revisada por el cron (el query de `reviewBaseNeeds` filtra por `status: 'ACTIVE'`). Los campos `isBase` y relacionados quedan como registro histórico pero no tienen efecto.

### 8.6 EventLog coverage
Todas las transiciones de estado generan entradas en EventLog:
- `NEED_SEDIMENTED_AS_BASE` (INFO, USER o AUTOMATION)
- `NEED_DEGRADED_FROM_BASE` (WARNING, AUTOMATION)
- `TASK_COMPLETED_NO_XP` (INFO, USER) — cuando se completa sin evidence en need base
