# Propuesta: Rating Cross-Árbol y Asignación de Puestos

## Problema

El sistema actual de rating (`AgentMembership.level/xp` y `Rating`) es **por árbol**. Una IA puede ser nivel 10 en un árbol y nivel 1 en otro. No hay:
- Visibilidad global del desempeño de cada modelo
- Mecanismo de decaimiento que evite IAs estancadas
- Sistema de asignación por puesto (analista, investigador, implementador)
- Período de exploración para modelos nuevos

## Solución

### 1. Perfil Cross-Árbol del Agente
Crear `AgentProfile` — una tabla que agrega ratings de TODOS los árboles para cada agente:
- `totalRatings`: cantidad de ratings recibidos
- `avgStars`: promedio de estrellas
- `xpByRole`: JSON con XP acumulado por rol (analyst, researcher, implementer, etc.)
- `primaryRole`: rol donde mejor desempeño tiene
- `confidenceScore`: qué tan confiable es la asignación (basado en cantidad de datos)

### 2. Curva de Decaimiento de XP
Job diario (scheduler existente) que aplica decaimiento exponencial:
- Fórmula: `xp_new = xp_current * e^(-λ * days_since_last_activity)`
- λ (lambda) configurable, default 0.05 (pierde ~5% por día inactivo)
- Solo afecta XP por rol, no el total histórico
- Un agente inactivo 30 días pierde ~78% de su XP

### 3. Motor de Asignación de Puestos
Cuando un árbol nuevo necesita agentes:
1. **Exploración (agentes nuevos):** <20 ratings totales → 40% probabilidad de ser elegido al azar
2. **Explotación (agentes probados):** ≥20 ratings → asignado a su `primaryRole` si el árbol necesita ese rol
3. **Balance:** máximo 3 agentes por rol en un árbol
4. **Rotación:** cada 7 días se re-evalúan asignaciones

### 4. Puestos disponibles
Roles que un agente puede ocupar en un árbol:
- `analyst`: analiza necesidades y propone soluciones
- `researcher`: investiga y documenta
- `implementer`: ejecuta tareas técnicas
- `reviewer`: revisa y valida resultados
- `mediator`: facilita consensos entre miembros

## Impacto en BD

| Tabla | Tipo | Descripción |
|---|---|---|
| `AgentProfile` | Nueva | Perfil cross-árbol del agente |
| `AgentRoleHistory` | Nueva | Historial de asignaciones de rol |
| `Rating` | Modificar | Agregar `crossTreeContribution` (bool) |
| `AgentMembership` | Sin cambios | Sigue siendo tree-scoped |

## Dependencias

- Fase 1 (bot conversacional + ratings) — **pre-requisito** para generar ratings desde Telegram
- Scheduler existente (`src/bot/scheduler.ts`) — para el job de decaimiento
