# Tasks: Rating Cross-Árbol y Asignación de Puestos

## SPEC-1: AgentProfile — Perfil cross-árbol

- [ ] **S1.1** Crear migración MySQL para tabla `AgentProfile` (agentId, totalRatings, avgStars, xpByRole JSON, primaryRole, secondaryRole, confidenceScore, lastActiveAt, explorationEligible, currentTreeCount)
- [ ] **S1.2** Crear migración MySQL para tabla `AgentRoleHistory` (id, agentId, treeId, role, assignedAt, releasedAt, assignmentReason, performanceScore)
- [ ] **S1.3** Agregar columna `crossTreeContribution` a tabla `Rating` (boolean, default true)
- [ ] **S1.4** Crear `backend/src/services/agentProfileService.ts` con `updateProfileFromRating()` — recalcula AgentProfile cuando se crea un Rating
- [ ] **S1.5** Modificar `ratingController.ts` para llamar a `updateProfileFromRating()` después de crear ratings

## SPEC-5: Endpoints API

- [ ] **S5.1** `GET /api/agents` — lista agentes con perfil (include profile)
- [ ] **S5.2** `GET /api/agents/:id/profile` — perfil detallado de un agente con historial
- [ ] **S5.3** `GET /api/agents/leaderboard?role=X` — top agentes por rol, ordenados por confidenceScore
- [ ] **S5.4** `GET /api/trees/:id/agents` — agentes asignados actualmente a un árbol
- [ ] **S5.5** `POST /api/trees/:id/agents/assign` — forzar reasignación (admin, requiere JWT)

## SPEC-2: Curva de decaimiento de XP

- [ ] **S2.1** Agregar `applyDecay(lambda)` a `agentProfileService.ts`:
  - Fórmula: `xp_new = xp_current * e^(-λ * days)`
  - Por rol en `xpByRole`, mínimo 1 XP
  - Solo agentes inactivos ≥1 día
- [ ] **S2.2** Agregar job diario (03:00) en `scheduler.ts` que ejecute `applyDecay()`
- [ ] **S2.3** Configurar λ vía env `XP_DECAY_LAMBDA` (default 0.05)

## SPEC-3: Motor de asignación

- [ ] **S3.1** Agregar `assignAgentToTreeSlot(treeId, role)` a `agentProfileService.ts`:
  - Verificar slot vacío
  - Separar explorationPool vs exploitationPool
  - 40/60 random
  - Máximo 2 árboles por agente
- [ ] **S3.2** Agregar `releaseAgent(agentId, treeId, role)` — libera slot y actualiza currentTreeCount
- [ ] **S3.3** Agregar lógica de asignación inicial cuando se crea un árbol nuevo (vía `treeController`)

## SPEC-4: Rotación semanal

- [ ] **S4.1** Agregar job semanal (domingo 00:00) en `scheduler.ts`:
  - Evaluar avgStars de últimos 7 días por agente asignado
  - < 2 estrellas → remover y reasignar
  - Slots vacíos → asignar nuevo agente
- [ ] **S4.2** Agregar endpoint `POST /api/trees/:id/agents/rotate` para forzar rotación manual

## SPEC-6: Integración con analyzer.ts (Fase 1)

- [ ] **S6.1** Modificar `analyzer.ts`: al crear rating desde feedback, detectar rol del mensaje (implementer/researcher/analyst/reviewer/mediator) basado en keywords
- [ ] **S6.2** Pasar `crossTreeContribution: true` en el body del POST a `/api/ratings`
