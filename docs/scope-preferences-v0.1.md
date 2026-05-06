# Puntos de Alcance v0.1

## Diagnostico

`ScopePreference` ya existia como parte de Necesidades Externas, pero solo guardaba `label`, `score` y `description`. En esta version se completo como modulo propio de preferencias relativas.

## Principio

Los clientes externos pueden definir preferencias de alcance, pero no comprar prioridad politica dentro del Tree.

## Modelo

`ScopePreference` ahora incluye:

- `externalNeedId`: Necesidad Externa asociada.
- `agentId`: agente externo opcional.
- `label`: criterio visible.
- `labelKey`: version normalizada para evitar duplicados simples.
- `score`: entero de 1 a 10.
- `description`: detalle opcional.
- `normalizedWeight`: peso relativo guardado para lectura rapida.
- `createdById`: usuario Trust que registro la preferencia.

## Normalizacion

Los scores son relativos. Si un cliente marca todo con 10, no obtiene mas poder: todos los criterios pesan igual.

Ejemplo:

- Seguridad 10
- Rapidez 5
- Diseno 5

Suma = 20:

- Seguridad 50%
- Rapidez 25%
- Diseno 25%

El resumen agregado agrupa por `labelKey`, promedia score por criterio y calcula peso sobre la suma de promedios.

## Endpoints

- `GET /api/external-needs/:externalNeedId/scope-preferences`
- `POST /api/external-needs/:externalNeedId/scope-preferences`
- `PATCH /api/scope-preferences/:scopePreferenceId`
- `DELETE /api/scope-preferences/:scopePreferenceId`
- `GET /api/external-needs/:externalNeedId/scope-summary`

## Reglas

- `label` requerido, maximo 80 caracteres.
- `description` maximo 500 caracteres.
- `score` entero entre 1 y 10.
- `agentId`, si existe, debe pertenecer a la misma Necesidad Externa.
- No se permiten labels duplicados simples para el mismo agente/contexto.
- No modifica `NeedFunding`.
- No modifica votos internos.
- No otorga XP.
- No modifica nivel, reputacion, Berries ni autoridad.

## UI

La vista de Necesidad Externa muestra:

- lista de criterios;
- score 1-10;
- peso relativo;
- agente opcional;
- resumen con barras porcentuales;
- resumen visible antes de crear propuestas de solucion.

## EventLog

Eventos:

- `SCOPE_PREFERENCE_CREATED`
- `SCOPE_PREFERENCE_UPDATED`
- `SCOPE_PREFERENCE_DELETED`

La metadata no incluye emails ni datos sensibles de agentes externos.

## Pendientes

- Presupuestos automaticos.
- Alineacion declarada de solucion por criterio.
- Portal de cliente externo.
- Ponderaciones distintas por tipo de agente.
- Conversion a tareas.
- Contratos y pagos.
