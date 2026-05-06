# Soluciones con presupuesto v0.1

## Diagnostico

`SolutionProposal` ya existia como propuesta basica para Necesidades Externas. Faltaban presupuesto esperado, desglose por lineas, metadata de seleccion/aprobacion y endpoints para administrar el presupuesto sin mezclarlo con pagos reales, XP o Berries.

## Incluido

- `SolutionProposal` extendido con:
  - `estimatedFiatMin`, `estimatedFiatExpected`, `estimatedFiatMax`;
  - duracion estimada, riesgo, supuestos, incluidos, excluidos, entregables, criterios de aceptacion y notas de mantencion;
  - `scopeAlignmentJson` para declarar como responde a los Puntos de Alcance;
  - `selectedAt`, `selectedById`, `approvedByTreeAt`, `approvedByClientAt`.
- Nuevo modelo `BudgetLine` con tipos:
  - `LABOR`, `MATERIALS`, `INFRASTRUCTURE`, `TAXES`, `RESERVE`, `TREE_FUND`, `MAINTENANCE`, `EXTERNAL_SERVICE`, `OTHER`.
- Estados de solucion:
  - `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED_BY_TREE`, `APPROVED_BY_CLIENT`, `SELECTED`, `REJECTED`, `ARCHIVED`, `CONVERTED_TO_TASKS`.

## Endpoints

- `GET /api/external-needs/:externalNeedId/solutions`
- `POST /api/external-needs/:externalNeedId/solutions`
- `GET /api/solution-proposals/:solutionId`
- `PATCH /api/solution-proposals/:solutionId`
- `DELETE /api/solution-proposals/:solutionId`
- `POST /api/solution-proposals/:solutionId/submit`
- `POST /api/solution-proposals/:solutionId/review`
- `POST /api/solution-proposals/:solutionId/approve-tree`
- `POST /api/solution-proposals/:solutionId/approve-client`
- `POST /api/solution-proposals/:solutionId/select`
- `POST /api/solution-proposals/:solutionId/reject`
- `POST /api/solution-proposals/:solutionId/archive`
- `POST /api/solution-proposals/:solutionId/budget-lines`
- `PATCH /api/budget-lines/:budgetLineId`
- `DELETE /api/budget-lines/:budgetLineId`
- `GET /api/solution-proposals/:solutionId/budget-summary`

## Reglas

- Crear, enviar, aprobar o seleccionar una solucion no otorga XP.
- No cambia nivel, reputacion, votos, pesos expertos, Berries ni permisos.
- No crea transacciones fiat automaticamente.
- Solo una solucion queda `SELECTED` por Necesidad Externa; las demas quedan `ARCHIVED` salvo rechazadas/archivadas.
- No se permite seleccionar soluciones `DRAFT`.
- No se permite seleccionar soluciones de Necesidades Externas canceladas, rechazadas, completadas o convertidas a tareas.
- `CONVERTED_TO_TASKS` queda reservado para una fase futura.

## EventLog

Se registran:

- `SOLUTION_PROPOSAL_CREATED`
- `SOLUTION_PROPOSAL_UPDATED`
- `SOLUTION_PROPOSAL_SUBMITTED`
- `SOLUTION_PROPOSAL_UNDER_REVIEW`
- `SOLUTION_PROPOSAL_APPROVED_BY_TREE`
- `SOLUTION_PROPOSAL_APPROVED_BY_CLIENT`
- `SOLUTION_PROPOSAL_SELECTED`
- `SOLUTION_PROPOSAL_REJECTED`
- `SOLUTION_PROPOSAL_ARCHIVED`
- `BUDGET_LINE_CREATED`
- `BUDGET_LINE_UPDATED`
- `BUDGET_LINE_DELETED`

No se guarda contrato, comprobante ni pago real en estos eventos.

## Pendientes

- Migrar montos de `Float` a `Decimal` cuando se endurezca contabilidad.
- Versionado formal de propuestas seleccionadas.
- Conversion explicita a tareas en Branch OS.
- Pagos fiat, Sponsor Wallet, contratos y facturacion.
- Comparacion avanzada y presupuesto automatico con datos historicos.
