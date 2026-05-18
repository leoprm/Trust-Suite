# Design: Worker Levels + XP + Decay

## Schema (Prisma)

```prisma
model WorkerSkill {
  id        String   @id @default(uuid())
  userId    String
  skill     String   // "diseño", "figma", etc (lowercase)
  xp        Int      @default(0)
  level     Int      @default(1)  // floor(xp/50) + 1
  updatedAt DateTime @updatedAt

  @@unique([userId, skill])
  @@index([userId])
  @@index([skill])
}

model WorkerLevelHistory {
  id        String   @id @default(uuid())
  userId    String
  skill     String
  xpDelta   Int      // positive = earned, negative = decay
  reason    String   // "TASK_COMPLETED", "XP_DECAY", "ADMIN_ADJUST"
  taskId    String?  // ExternalTask ID si viene de tarea completada
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
}
```

Nuevo campo en ExternalTask:
```prisma
model ExternalTask {
  // ... existing fields ...
  difficulty Int? @default(5)  // 1-10, set by Ari
  quality    Float?            // 0.0-1.0, set by Ari after completion
}
```

## LevelingService (`src/services/levelingService.ts`)

```typescript
const XP_PER_LEVEL = 50;

// Calcular XP ganado
function calculateXpGain(difficulty: number, quality: number): number {
  return Math.round(difficulty * 10 * quality);
}

// Nivel actual dado XP
function xpToLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// XP necesario para siguiente nivel
function xpToNextLevel(xp: number): number {
  const currentLevel = xpToLevel(xp);
  return (currentLevel * XP_PER_LEVEL) - xp;
}

// Decay diario: XP * (nivel * 0.5)%
function calculateDailyDecay(xp: number, level: number): number {
  const rate = level * 0.005; // 0.5% per level
  return Math.round(xp * rate);
}

// Aplicar decay (NO baja de nivel 1, XP mínimo 0)
function applyDecay(currentXp: number, currentLevel: number): { newXp: number, newLevel: number } {
  const decay = calculateDailyDecay(currentXp, currentLevel);
  const newXp = Math.max(0, currentXp - decay);
  const newLevel = xpToLevel(newXp);
  return { newXp, newLevel };
}
```

## Decay Cron (`src/cron/xpDecayCron.ts`)

Job diario (00:00 UTC):
1. Query all WorkerSkill where xp > 0
2. Para cada uno: applyDecay()
3. Si decay > 0: registrar en WorkerLevelHistory (reason: "XP_DECAY")
4. Actualizar WorkerSkill.xp y WorkerSkill.level
5. Loggear summary

## Multiplicador de precio

En `matchingService.ts` o al mostrar la tarea:
```
precio_efectivo = worker.hourlyRate × (1 + (difficulty - 1) × 0.15)
```

Tabla de referencia:
| Difficulty | Multiplier | Ej: $10,000 base |
|-----------|-----------|-------------------|
| 1 | ×1.00 | $10,000 |
| 3 | ×1.30 | $13,000 |
| 5 | ×1.60 | $16,000 |
| 7 | ×1.90 | $19,000 |
| 10 | ×2.35 | $23,500 |

## Matching por nivel

Agregar en `matchingService.ts` después del filtro de skills y ubicación:
```typescript
// Level filter: worker.level(skill) >= task.difficulty - 2
matched = matched.filter(w => {
  const workerSkill = workerSkills.find(ws => ws.userId === w.id && taskSkills.includes(ws.skill));
  const workerLevel = workerSkill?.level ?? 1;
  return workerLevel >= (task.difficulty || 5) - 2;
});
```

## Ari auto-evaluación

- **Al crear tarea**: Ari estima `difficulty` (1-10) según complejidad descrita
- **Al recibir entrega**: Ari evalúa `quality` (0.0-1.0) según: completitud, adherencia a specs, puntualidad
- Esto se integra en `hermesBridge.ts` — Ari setea ambos campos vía API

## Flujo completo

```
1. Árbol crea ExternalTask → Ari setea difficulty
2. MatchingService notifica workers con nivel suficiente
3. Worker reclama → ejecuta → entrega
4. Ari evalúa quality → levelingService aplica XP
5. WorkerSkill.xp += xpGain → si cruza threshold → level up + notificación
6. Cada medianoche: decay cron reduce XP de todos
```
