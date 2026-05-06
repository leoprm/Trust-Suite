# Fiat como ledger externo

## Principio

Fiat financia recursos externos; Berries coordinan circulacion interna; XP certifica contribucion.

Regla constitucional: el fiat puede financiar recursos, pero no comprar autoridad.

## Separacion funcional

- Fiat se trata como ledger externo para ingresos, gastos, inversiones, materiales, infraestructura, sueldos, impuestos, reservas, encargos externos y fondo del Tree.
- Berries se mantienen como circulacion interna del Tree cuando el modo economico las habilite.
- XP, nivel, votos, pesos expertos, permisos de gobernanza y reputacion Trace no se derivan automaticamente de transacciones fiat.
- La conversion directa fiat -> Berries queda bloqueada en esta version.

## Modos economicos del Tree

- `NO_ECONOMY`: sin moneda activa, solo tareas, XP y reputacion.
- `LEGACY_FIAT`: fiat habilitado solo como ledger externo; no reemplaza Berries.
- `BERRIES_LATENT`: el sistema puede calcular valor interno sin activar wallet visible.
- `BERRIES_ACTIVE`: Berries activas para circulacion interna; fiat sigue como ledger externo.
- `TRUST_FULL`: modo futuro para economia Trust madura.

## Endpoints principales

- `GET /api/trees/:treeId/fiat-ledger`
- `POST /api/trees/:treeId/fiat-ledger/transactions`
- `GET /api/trees/:treeId/fiat-ledger/summary`
- `PATCH /api/trees/:treeId/economy-mode`
- `PATCH /api/fiat-transactions/:id`
- `DELETE /api/fiat-transactions/:id`

Los endpoints legacy bajo `/api/fiat` se mantienen por compatibilidad, pero devuelven/operan sobre el mismo ledger externo.

## Reglas defensivas

El backend bloquea payloads que intenten usar fiat para modificar:

- XP o nivel;
- votos o autoridad;
- reputacion Trace;
- pesos expertos;
- permisos de gobernanza;
- Berries o conversion fiat/Berries.

Crear o editar una transaccion fiat no toca saldos de XP, niveles, votos, reputacion ni permisos. Si una tarea pagada entrega XP, ese XP debe provenir de la tarea completada, evidencia, dificultad y auditoria, no del monto fiat.

## EventLog

Eventos integrados:

- `FIAT_TRANSACTION_CREATED`
- `FIAT_TRANSACTION_UPDATED`
- `FIAT_TRANSACTION_VERIFIED`
- `FIAT_TRANSACTION_DELETED`
- `TREE_ECONOMY_MODE_UPDATED`
- `FIAT_REPUTATION_EFFECT_BLOCKED`

El EventLog registra metadata minima y no debe guardar comprobantes crudos ni archivos de evidencia.

## Compatibilidad y deuda tecnica

- `FiatTransaction.amount` sigue como `Float` por compatibilidad con datos existentes. Para contabilidad real debe migrarse a `Decimal`.
- Los comprobantes deben mantenerse como evidencia protegida y metadata verificable, no como archivos publicos.
- Los datos existentes se conservan y quedan con `verificationStatus = DECLARED` por defecto.

## Siguientes pasos

- Ramas de Autosustento y presupuestos por Necesidad Externa.
- Sponsor Wallet.
- Berries con vencimiento por lote individual.
- Trust Wallet completo.
- Politicas de comprobantes, conciliacion y auditoria contable.
- Contabilidad legal/tributaria futura.
