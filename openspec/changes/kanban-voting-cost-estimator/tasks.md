# Tasks: Kanban Voting + Cost Estimator

## Fase 1: Schema + Migration
- [ ] Agregar modelos `KanbanProposal`, `KanbanCostLog`, `ExchangeRate` a `prisma/schema.prisma`
- [ ] Ejecutar `npx prisma db push` para migrar

## Fase 2: Exchange Rate Cron
- [ ] Crear `src/cron/exchangeRateCron.ts`
- [ ] GET `https://api.exchangerate-api.com/v4/latest/USD` → extraer `rates.CLP`
- [ ] Guardar en tabla `ExchangeRate` (id="USD_CLP")
- [ ] Registrar en `src/bot/scheduler.ts` cada 6h

## Fase 3: CRUD Endpoints
- [ ] `POST /api/trees/:treeId/kanban/propose` — crea propuesta, publica mensaje Telegram con botones [Sí] [No], retorna proposalId
- [ ] `POST /api/trees/:treeId/kanban/vote/:proposalId` — registra voto, actualiza contadores
- [ ] `GET /api/trees/:treeId/kanban/cost-stats` — promedios 30 días por dificultad (1, 2, 3)
- [ ] `POST /api/trees/:treeId/kanban/cost-log` — registra costo real (tokens, USD, CLP)

## Fase 4: Proposal Resolver Cron
- [ ] Crear `src/cron/proposalResolverCron.ts`
- [ ] Buscar propuestas OPEN con expiresAt < now()
- [ ] Contar miembros activos del árbol, calcular % que votó
- [ ] Aplicar reglas: <33% → REJECTED, ≥33% + Sí>No → APPROVED, sino REJECTED
- [ ] Si APPROVED → notificar a Ari (editar mensaje o enviar callback)
- [ ] Registrar en scheduler cada 2 min

## Fase 5: Telegram Bot Vote Handler
- [ ] Handler de callback_data `kanban_vote:${proposalId}:${vote}`
- [ ] Validar que el usuario sea miembro activo del árbol
- [ ] Impedir doble voto (mismo usuario)
- [ ] Actualizar mensaje con conteo: "Sí: 3 | No: 1 | Quórum: 4/6 (67%)"
- [ ] Si se alcanza mayoría irreversible antes de 1h → resolver temprano

## Fase 6: Ari System Prompt
- [ ] Agregar protocolo de votación Kanban en `hermesBridge.ts` buildSystemPrompt()
- [ ] Instruir a Ari: detectar necesidad Kanban → evaluar dificultad → consultar cost-stats → publicar propuesta → esperar

## Fase 7: Integration Test
- [ ] Probar flujo completo: mensaje → propuesta → votación → resolución → ejecución → cost-log
- [ ] Verificar que sin quórum se rechaza
- [ ] Verificar que con mayoría se aprueba
