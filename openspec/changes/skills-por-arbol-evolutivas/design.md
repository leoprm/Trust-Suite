# Design: Skills por Árbol Evolutivas

## Arquitectura

```
┌─────────────────────────────────────┐
│              Hermes Agent           │
│  ┌───────────────────────────────┐  │
│  │  ~/.hermes/skills/trustmaker/ │  │
│  │  Máx 40 skills globales       │  │
│  │  <skill>.md + usos.json       │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │ load if global
              ▼
┌─────────────────────────────────────┐
│      TrustMaker Backend :3100       │
│  ┌───────────────────────────────┐  │
│  │    hermesBridge.ts            │  │
│  │    buildSystemPrompt()        │  │
│  │    + reglas de skills         │  │
│  │    + lista skills del árbol   │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │    skillEvolution.ts          │  │
│  │    nightlyScan()              │  │
│  │    computeFitness()           │  │
│  │    promoteToGlobal()          │  │
│  │    evictLowest()              │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │    scheduler.ts               │  │
│  │    Cron 03:00 diario          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │ sandbox API
              ▼
┌─────────────────────────────────────┐
│  /home/trustmaker/trees/<treeId>/   │
│  ┌───────────────────────────────┐  │
│  │  skills/                      │  │
│  │    ventas.md                  │  │
│  │    ventas.rating.json         │  │
│  │    onboarding.md              │  │
│  │    onboarding.rating.json     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Flujo: Creación de skill local (usuario → Ari)
1. Usuario: "Ari, guarda esto como skill"
2. Ari genera .md con frontmatter (name, description, version)
3. Ari autoevalúa rating 1-10 → .rating.json
4. Ari: POST /api/trees/:id/sandbox/write → skills/
5. Ari confirma: "Skill 'ventas.md' guardada (rating: 7)"
6. Contador de tareas +1

## Flujo: Trigger 20 tareas
1. Ari completa tarea #20 en árbol X
2. Revisa últimas 20 interacciones (patrones, soluciones)
3. Si detecta algo → "He notado un patrón útil en nuestras últimas conversaciones. ¿Quieres que lo guarde como skill?"
4. Si usuario acepta → crea skill local (mismo flujo)
5. Reinicia contador a 0

## Flujo: Cron nocturno (03:00)
1. Escanear `/home/trustmaker/trees/*/skills/` en todos los árboles
2. Agrupar por nombre normalizado
3. Calcular avg_rating + total_usos
4. fitness = (avg_rating × 0.4) + (usos × 0.6)
5. Filtrar fitness ≥ umbral mínimo (rating ≥ 6)
6. Ordenar por fitness descendente
7. Top 40 → promover a `~/.hermes/skills/trustmaker/`
8. Si ya existe → actualizar usos.json
9. Si >40 → evict las de menor fitness (>40)
10. Loggear resultados

## Estructura de archivos

### Skill markdown (.md)
```markdown
---
name: ventas-consultivas
description: Técnicas de venta consultiva B2B para simulador
version: 1.0.0
createdBy: telegramId
createdAt: 2026-05-18T01:30:00Z
treeId: 9170d631-dfa1-4123-a545-17c5881fd261
---

# Ventas Consultivas B2B

Pasos para una venta consultiva efectiva...
```

### Rating (.rating.json)
```json
{
  "rating": 7,
  "ratedBy": "123456789",
  "ratedAt": "2026-05-18T01:30:00Z"
}
```

### Usos globales (.usos.json)
```json
{
  "usos": 47,
  "treeIds": ["9170d631...", "b1f7cab7..."],
  "lastUsed": "2026-05-18T01:30:00Z"
}
```
