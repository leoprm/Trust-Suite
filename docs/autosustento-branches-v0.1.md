# Ramas de Autosustento v0.1

## Principio

Las Ramas de Autosustento permiten que un Tree opere una capacidad comercial externa para sostener materiales, trabajo, operacion, impuestos, reservas, mantenimiento y fondo del Tree.

El fiat registrado en estas ramas es ledger externo. No otorga XP, nivel, votos, reputacion, Berries ni autoridad.

## Modelo

- `Branch.type` distingue ramas `NORMAL`, `HASHTAG`, `AUTOSUSTENTO` y `EXTERNAL_CONTRACT`.
- `AutosustentoBranchConfig` guarda la ficha de viabilidad de la rama.
- `SustainabilitySplit` define la distribucion esperada de ingresos y excedentes.
- `FiatTransaction.branchId` permite calcular el resumen financiero por Rama de Autosustento.

Los montos se mantienen como `Float` por compatibilidad con el ledger fiat actual. Para una contabilidad mas estricta, migrar a `Decimal` en una fase posterior.

## Endpoints

- `GET /api/trees/:treeId/autosustento-branches`
- `POST /api/trees/:treeId/autosustento-branches`
- `GET /api/autosustento-branches/:branchId`
- `PATCH /api/autosustento-branches/:branchId/config`
- `PUT /api/autosustento-branches/:branchId/sustainability-split`
- `POST /api/autosustento-branches/:branchId/submit-review`
- `POST /api/autosustento-branches/:branchId/approve`
- `POST /api/autosustento-branches/:branchId/activate`
- `POST /api/autosustento-branches/:branchId/pause`
- `POST /api/autosustento-branches/:branchId/close`
- `POST /api/autosustento-branches/:branchId/reject`
- `GET /api/autosustento-branches/:branchId/financial-summary`

## Reglas

- Miembros del Tree pueden proponer una Rama de Autosustento.
- Solo admin/owner puede aprobar, activar, pausar, cerrar, rechazar o modificar el split.
- El split debe sumar 100 y cada porcentaje debe estar entre 0 y 100.
- No se puede activar una rama sin configuracion minima y split valido.
- Una rama cerrada requiere criterio o nota de cierre.
- Los ingresos/gastos fiat vinculados por `branchId` no cambian XP, nivel, votos, reputacion ni Berries.
- Las tareas dentro de la rama siguen el flujo normal: XP solo por trabajo verificado, evidencia y auditoria.

## EventLog

Eventos registrados:

- `AUTOSUSTENTO_BRANCH_CREATED`
- `AUTOSUSTENTO_BRANCH_CONFIG_UPDATED`
- `AUTOSUSTENTO_BRANCH_SPLIT_UPDATED`
- `AUTOSUSTENTO_BRANCH_SUBMITTED_FOR_REVIEW`
- `AUTOSUSTENTO_BRANCH_APPROVED`
- `AUTOSUSTENTO_BRANCH_ACTIVATED`
- `AUTOSUSTENTO_BRANCH_PAUSED`
- `AUTOSUSTENTO_BRANCH_CLOSED`
- `AUTOSUSTENTO_BRANCH_REJECTED`
- `AUTOSUSTENTO_BRANCH_FINANCIAL_SUMMARY_VIEWED`

## UI

La vista de Tree incluye una pestana `Autosustento` separada de ramas normales.

La UI permite:

- crear propuesta;
- ver ficha de viabilidad;
- editar split;
- ver resumen fiat;
- ver transacciones recientes;
- ejecutar acciones admin de estado.

Las ramas `AUTOSUSTENTO` se ocultan del feed comun de ramas para evitar mezcla visual con ramas normales.

## Pendientes

- Ideas de Autosustento y conversion a Rama.
- Fondo del Tree como ledger real.
- Pagos, sueldos, facturacion y contratos.
- Metricas automaticas de viabilidad.
- Cierre automatico segun criterios.
- Presupuestos y ventas externas mas detalladas.
- Contabilidad legal/tributaria.
- Migracion monetaria de `Float` a `Decimal`.
