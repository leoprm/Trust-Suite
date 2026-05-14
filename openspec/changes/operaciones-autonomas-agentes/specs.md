# Specs: Operaciones Autónomas de Agentes

## SPEC-1: Auto-Provisioning de Árboles

**Trigger:** `TreeCreated` (hook en treeController)

**Acciones:**
1. Asignar 3 agentes vía `assignAgentToTreeSlot()` (Fase 2): analyst, researcher, implementer
2. Crear necesidad génesis: "¿Qué debe lograr este árbol primero?" — creatorId = "system"
3. Si el árbol tiene `telegramChatId`, enviar mensaje:
   > 🌳 ¡Árbol activado! Ya tienes agentes trabajando. Menciona @TrustMakerBot para interactuar.

**Validación:**
- Árbol nuevo → 3 agentes asignados + 1 necesidad inicial + mensaje en Telegram

## SPEC-2: Smart Task Routing

**Objetivo:** Cuando se crea una tarea, asignarla al mejor agente automáticamente.

**Algoritmo:**
1. Identificar rol requerido por la tarea (tags/categoría)
2. Buscar agentes asignados al árbol con ese rol (AgentRoleHistory)
3. Filtrar por carga (< 3 tareas activas)
4. Ordenar por `confidenceScore * 0.7 + (1 - carga/3) * 0.3`
5. Asignar al mejor match
6. Si no hay match en 5 min → broadcast a todos los agentes del árbol

**Endpoint:** `POST /api/tasks/:id/route` — forzar re-routing

## SPEC-3: Auto-Scaling

**Job:** Cada 6 horas

**Lógica por árbol:**
```
needs_sin_agente = count(OPEN needs sin agente asignado)
agentes_activos = count(AgentRoleHistory donde releasedAt IS NULL)

if needs_sin_agente > 5 and agentes_activos < 5:
    rol_faltante = detectarRolMasNecesitado(treeId)
    assignAgentToTreeSlot(treeId, rol_faltante)

if needs_sin_agente < 2 and agentes_activos > 3:
    agente_menos_activo = findLeastActiveAgent(treeId)
    releaseAgent(agente_menos_activo, treeId, rol)
```

## SPEC-4: Dashboard Analytics

**Nuevos endpoints:**
- `GET /api/analytics/ecosystem` — resumen global (total agentes, árboles, necesidades, ratings hoy)
- `GET /api/analytics/agents/heatmap` — matriz rol × modelo con avgStars
- `GET /api/analytics/agents/:id/timeline` — ratings por día (últimos 30)
- `GET /api/analytics/trees/:id/health` — needs abiertas, agentes activos, actividad 7d
- `GET /api/analytics/models/compare` — comparativa side-by-side de modelos

## SPEC-5: BYO AI Rating Integration

**Cambios en byoController:**
- Al registrar un modelo externo → crear entrada en `Agent` + `AgentProfile`
- explorationEligible = true (entra al pool de exploración)
- Los ratings de tareas completadas por BYO models → alimentan AgentProfile
- Dashboard muestra modelos BYO junto con internos

**Endpoint modificado:** `POST /api/byo/register` — ahora crea Agent + AgentProfile
