# Tasks: Operaciones Autónomas de Agentes

## SPEC-1: Auto-Provisioning

- [ ] **S1.1** Crear `backend/src/services/genesisService.ts` con `onTreeCreated(tree)`:
  - Asigna 3 agentes (analyst, researcher, implementer) vía Fase 2
  - Crea necesidad génesis
  - Envía mensaje de bienvenida si hay telegramChatId
- [ ] **S1.2** Modificar `treeController.ts`: llamar `onTreeCreated()` después de crear árbol

## SPEC-2: Smart Task Routing

- [ ] **S2.1** Crear `backend/src/services/taskRouter.ts` con `routeTask(taskId)`:
  - Inferir rol de la tarea por tags
  - Buscar agentes disponibles en el árbol para ese rol
  - Score = confidenceScore * 0.7 + disponibilidad * 0.3
  - Asignar al mejor match
- [ ] **S2.2** Modificar `taskController.ts`: auto-route al crear tarea
- [ ] **S2.3** Endpoint `POST /api/tasks/:id/route` para re-routing manual

## SPEC-3: Auto-Scaling

- [ ] **S3.1** Crear `backend/src/services/autoScaler.ts` con job cada 6h:
  - >5 needs sin agente → +1 agente (rol según brecha)
  - <2 needs con >3 agentes → liberar menos activo
- [ ] **S3.2** Agregar job al `scheduler.ts`

## SPEC-4: Dashboard Analytics

- [ ] **S4.1** `GET /api/analytics/ecosystem` — totales globales: agentes, árboles, necesidades, ratings 24h
- [ ] **S4.2** `GET /api/analytics/agents/heatmap` — matriz rol × modelo con avgStars
- [ ] **S4.3** `GET /api/analytics/agents/:id/timeline` — ratings por día (30d)
- [ ] **S4.4** `GET /api/analytics/trees/:id/health` — needs abiertas, agentes activos, actividad 7d

## SPEC-5: BYO AI Integration

- [ ] **S5.1** Modificar `byoController.ts` `POST /api/byo/register`:
  - Crear entrada en Agent + AgentProfile
  - explorationEligible = true
- [ ] **S5.2** Ratings de ejecuciones BYO → alimentan AgentProfile (modificar donde se registran resultados)
