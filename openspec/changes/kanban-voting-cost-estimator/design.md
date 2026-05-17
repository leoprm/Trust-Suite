# Design: Kanban Voting + Cost Estimator

## Architecture

```
User pide algo complejo → Ari detecta que requiere Kanban
  → Evalúa dificultad 1-3 por tarea
  → GET /api/trees/:id/kanban/cost-stats (promedios históricos)
  → Calcula estimado CLP
  → POST /api/trees/:id/kanban/propose (crea votación)
  → Bot publica mensaje con [Sí] [No]
  → Miembros votan (máx 1h)
  → Cron resuelve al expirar:
      <33% votaron → REJECTED
      ≥33% + Sí>No → APPROVED → Ari crea tareas Kanban
      ≥33% + No≥Sí → REJECTED
  → Al completar tareas → POST /api/trees/:id/kanban/cost-log
```

## Data Model

### KanbanProposal
- id, treeId, messageId, chatId
- status: OPEN | APPROVED | REJECTED
- tasks: JSON [{title, difficulty}]
- estimatedCostCLP: Float
- votesYes, votesNo: Int
- createdAt, expiresAt (createdAt + 1h), resolvedAt

### KanbanCostLog
- id, treeId, proposalId?, externalTaskId
- difficulty: 1|2|3
- promptTokens, completionTokens
- costUSD, costCLP, exchangeRate
- createdAt

### ExchangeRate
- id="USD_CLP", rate: Float, updatedAt

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/trees/:id/kanban/propose | Crear propuesta + mensaje con botones |
| POST | /api/trees/:id/kanban/vote/:pid | Registrar voto Sí/No |
| GET | /api/trees/:id/kanban/cost-stats | Promedios costo por dificultad (30 días) |
| POST | /api/trees/:id/kanban/cost-log | Registrar costo real post-ejecución |

## Cron Jobs

1. **Exchange rate** (cada 6h): GET exchangerate-api.com → guarda USD→CLP
2. **Proposal resolver** (cada 2 min): resuelve propuestas expiradas

## Ari System Prompt

Agregar al prompt:
- Protocolo de votación antes de derivar a Kanban
- Evaluar dificultad 1-3
- Consultar cost-stats, calcular estimado
- Esperar resolución antes de crear tareas

## Implementation Order

1. Prisma schema + migration
2. Exchange rate cron
3. CRUD endpoints
4. Proposal resolver cron
5. Telegram bot buttons + vote handler
6. Ari system prompt update
7. Integration test
