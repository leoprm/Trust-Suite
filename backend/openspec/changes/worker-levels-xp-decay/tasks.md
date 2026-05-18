# Tasks: Worker Levels + XP + Decay

- [ ] **W1: Schema — WorkerSkill + WorkerLevelHistory + difficulty/quality en ExternalTask**
  - Agregar modelos WorkerSkill, WorkerLevelHistory a schema.prisma
  - Agregar campos `difficulty Int? @default(5)` y `quality Float?` a ExternalTask
  - Generar migración Prisma
  - ~30 LOC

- [ ] **W2: LevelingService — XP calculation, level-up, decay formulas**
  - Crear `src/services/levelingService.ts`
  - Funciones: calculateXpGain(), xpToLevel(), xpToNextLevel(), calculateDailyDecay(), applyDecay()
  - Función awardXp(userId, skill, xpDelta, reason, taskId?) que escribe WorkerSkill + WorkerLevelHistory
  - Detectar level-up y loggear
  - ~80 LOC

- [ ] **W3: Decay Cron — job diario de XP decay**
  - Crear `src/cron/xpDecayCron.ts`
  - Query all WorkerSkill where xp > 0
  - Aplicar applyDecay() a cada uno
  - Registrar decay en WorkerLevelHistory
  - Loggear summary (workers affected, total XP decayed)
  - ~50 LOC

- [ ] **W4: Ari auto-evaluación — difficulty al crear, quality al completar**
  - En `hermesBridge.ts`: cuando Ari crea ExternalTask, estimar difficulty (1-10) del system prompt
  - Cuando worker entrega (DELIVERED), Ari evalúa quality (0.0-1.0)
  - Actualizar ExternalTask con difficulty/quality vía API
  - Disparar awardXp() al evaluar quality
  - ~60 LOC

- [ ] **W5: Matching por nivel — filtro adicional en matchingService**
  - Agregar query de WorkerSkill en matchingService.ts
  - Filtrar matched workers: worker.level(skill) >= task.difficulty - 2
  - Worker sin skill registrada = nivel 1
  - ~40 LOC

- [ ] **W6: Precio dinámico — multiplicador por dificultad**
  - En matchingService.ts o al mostrar tarea: precio = hourlyRate × (1 + (difficulty - 1) × 0.15)
  - Mostrar en DM de notificación y en respuesta de API
  - ~20 LOC

- [ ] **W7: Integración final + E2E — test de flujo completo**
  - Verificar: crear tarea → Ari asigna difficulty → notifica workers aptos → worker reclama → entrega → Ari evalúa quality → XP awarded → nivel sube → decay aplica
  - Agregar endpoint opcional GET /api/workers/:userId/levels para dashboard
  - ~40 LOC
