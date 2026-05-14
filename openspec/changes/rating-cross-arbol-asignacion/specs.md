# Specs: Rating Cross-Árbol y Asignación de Puestos

## SPEC-1: AgentProfile — Perfil cross-árbol

**Objetivo:** Mantener un perfil agregado del agente a nivel servidor, independiente del árbol.

**Campos:**
| Campo | Tipo | Descripción |
|---|---|---|
| `agentId` | FK → Agent | Agente |
| `totalRatings` | int | Total de ratings recibidos (todos los árboles) |
| `avgStars` | float | Promedio de estrellas |
| `xpByRole` | JSON | `{ "analyst": 150, "researcher": 80, ... }` |
| `primaryRole` | string | Rol con mayor XP |
| `secondaryRole` | string | Segundo rol con mayor XP |
| `confidenceScore` | float | 0-1, basado en totalRatings |
| `lastActiveAt` | datetime | Última vez que recibió un rating |
| `explorationEligible` | bool | true si totalRatings < 20 |

**Actualización:** Cada vez que se crea un `Rating`, recalcular `AgentProfile`:
- Incrementar `totalRatings`
- Actualizar `avgStars`
- Sumar stars al `xpByRole[role]`
- Actualizar `primaryRole` y `secondaryRole`
- Calcular `confidenceScore = min(1, totalRatings / 100)`
- Actualizar `lastActiveAt`

**Validación:**
- Agente con 50 ratings en "analyst" (avg 4.2) y 10 en "researcher" (avg 3.1) → primaryRole = "analyst", confidenceScore = 0.5

## SPEC-2: Curva de decaimiento de XP

**Objetivo:** Reducir XP por rol con el tiempo para evitar estancamiento.

**Fórmula:** `xp_new = xp_current * e^(-λ * days)`
- λ = 0.05 (configurable vía env `XP_DECAY_LAMBDA`)
- `days` = días desde `lastActiveAt`
- Se aplica por rol en `xpByRole`
- XP no baja de 1 (mínimo)

**Job:** Diario a las 03:00 UTC, ejecutado por el scheduler existente.

**Validación:**
- Agente inactivo 7 días con 100 XP en "analyst" → 100 * e^(-0.05*7) = 100 * 0.704 = 70 XP
- Agente inactivo 30 días con 100 XP → 100 * e^(-0.05*30) = 100 * 0.223 = 22 XP

## SPEC-3: Motor de asignación de puestos

**Objetivo:** Asignar agentes a roles en árboles, balanceando exploración y explotación.

**Reglas:**
1. Cada árbol tiene slots: 1 analyst, 1 researcher, 1 implementer, 1 reviewer, 1 mediator
2. Los slots pueden estar vacíos
3. Asignación se revisa cada 7 días

**Algoritmo de asignación para un slot vacío:**
1. Filtrar agentes elegibles para el rol (tienen XP en ese rol)
2. Separar en dos grupos:
   - **Exploración:** explorationEligible = true (< 20 ratings)
   - **Explotación:** explorationEligible = false (≥ 20 ratings)
3. 40% de probabilidad de elegir del grupo exploración
4. 60% de probabilidad de elegir del grupo explotación (mejor primaryRole match)
5. Si un grupo está vacío, usar el otro
6. Máximo 2 árboles simultáneos por agente

**Validación:**
- Árbol nuevo → 40% chance de agente nuevo, 60% chance de agente probado
- Agente con 200 ratings como "analyst" → siempre asignado como analyst en explotación

## SPEC-4: Rotación y re-evaluación

**Objetivo:** Evitar que agentes malos ocupen slots para siempre.

**Job semanal (domingo 00:00):**
1. Para cada árbol, evaluar desempeño de agentes asignados
2. Si un agente tiene < 2 estrellas promedio en los últimos 7 días → remover del slot
3. Si un agente bajó de primaryRole → reasignar al nuevo primaryRole
4. Slots vacíos → ejecutar algoritmo de asignación

## SPEC-5: Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/agents` | Lista agentes con perfil cross-árbol |
| GET | `/api/agents/:id/profile` | Perfil detallado de un agente |
| GET | `/api/agents/:id/history` | Historial de roles asignados |
| GET | `/api/trees/:id/agents` | Agentes asignados a un árbol |
| POST | `/api/trees/:id/agents/assign` | Forzar reasignación (admin) |
| GET | `/api/agents/leaderboard?role=analyst` | Top agentes por rol |

## SPEC-6: Integración con feedback de Telegram

**Objetivo:** El analyzer.ts de Fase 1 alimenta los ratings cross-árbol.

**Flujo:**
1. `analyzer.ts` detecta sentimiento sobre una necesidad
2. Busca el agente asociado a la necesidad (vía necesidad → idea → agente, o el agente asignado al árbol)
3. Crea `Rating` con `crossTreeContribution: true`
4. El trigger de BD o el controller actualiza `AgentProfile`

**Roles detectados automáticamente:**
- Si el feedback es sobre una **solución técnica** → role = "implementer"
- Si el feedback es sobre un **análisis** → role = "analyst"
- Si el feedback es sobre una **investigación** → role = "researcher"
- Default → role = "analyst"
