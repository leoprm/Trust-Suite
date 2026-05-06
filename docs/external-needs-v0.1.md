# Necesidades Externas v0.1

## Diagnostico

Las `Need` actuales representan necesidades internas del Tree y se conectan con puntos internos, funding democratico, ideas y ramas. Para no contaminar la gobernanza, las Necesidades Externas viven en modelos separados.

## Principio

El mundo externo puede traer necesidades y financiar soluciones, pero no comprar autoridad dentro del Tree.

## Modelos

- `ExternalNeed`: encargo externo asociado a un Tree.
- `ExternalAgent`: cliente, sponsor, contacto, aprobador u observador externo. Sus datos de contacto son privados por defecto.
- `ScopePreference`: preferencias de alcance de 1 a 10. No son Puntos de Necesidad.
- `SolutionProposal`: propuesta de solucion con estimaciones fiat, Berries estimadas, duracion, riesgos y supuestos.

Los presupuestos usan `Float` por compatibilidad con el ledger fiat existente. Para contabilidad madura, migrar a `Decimal`.

## Permisos

- Miembros del Tree pueden listar, ver, crear Necesidades Externas y proponer soluciones.
- Admin/owner del Tree puede abrir, aprobar, rechazar, cancelar, seleccionar soluciones y administrar agentes.
- Usuarios fuera del Tree no pueden modificar ni ver el modulo.
- Agentes externos no tienen cuenta ni permisos politicos en esta version.

## Reglas de negocio

- No consume Puntos de Necesidad internos.
- No cambia rankings de Needs internas.
- No otorga XP automaticamente.
- No cambia nivel, votos, reputacion Trace, Berries ni permisos.
- Presupuesto fiat es estimacion o contexto, no pago real.
- `CONVERTED_TO_TASKS` queda reservado para una fase futura.

## Endpoints

- `GET /api/trees/:treeId/external-needs`
- `POST /api/trees/:treeId/external-needs`
- `GET /api/external-needs/:id`
- `PATCH /api/external-needs/:id`
- `DELETE /api/external-needs/:id`
- `POST /api/external-needs/:id/open`
- `POST /api/external-needs/:id/cancel`
- `POST /api/external-needs/:id/approve`
- `POST /api/external-needs/:id/reject`
- `POST /api/external-needs/:id/agents`
- `PATCH /api/external-agents/:agentId`
- `DELETE /api/external-agents/:agentId`
- `POST /api/external-needs/:id/scope-preferences`
- `PATCH /api/scope-preferences/:scopeId`
- `DELETE /api/scope-preferences/:scopeId`
- `GET /api/external-needs/:id/solutions`
- `POST /api/external-needs/:id/solutions`
- `PATCH /api/solution-proposals/:solutionId`
- `POST /api/solution-proposals/:solutionId/submit`
- `POST /api/solution-proposals/:solutionId/select`
- `POST /api/solution-proposals/:solutionId/reject`

## EventLog

Eventos implementados:

- `EXTERNAL_NEED_CREATED`
- `EXTERNAL_NEED_UPDATED`
- `EXTERNAL_NEED_OPENED`
- `EXTERNAL_NEED_APPROVED`
- `EXTERNAL_NEED_REJECTED`
- `EXTERNAL_NEED_CANCELLED`
- `EXTERNAL_AGENT_ADDED`
- `SCOPE_PREFERENCE_CREATED`
- `SCOPE_PREFERENCE_UPDATED`
- `SOLUTION_PROPOSAL_CREATED`
- `SOLUTION_PROPOSAL_SUBMITTED`
- `SOLUTION_PROPOSAL_SELECTED`
- `SOLUTION_PROPOSAL_REJECTED`

No se guardan emails ni documentos crudos en EventLog.

## Pendientes

- Puntos de Alcance avanzados.
- Presupuestos automaticos.
- Conversion a tareas.
- Pagos fiat/Berries.
- Sponsor Wallet.
- Trust Insight.
- Convocatorias externas.
- Validacion de candidatos externos.
- Contratos legales.
