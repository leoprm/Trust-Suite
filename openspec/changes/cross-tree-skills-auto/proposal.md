# Skills Cross-Árbol Automáticas — Propuesta

## Why

Actualmente las skills globales (WorkerSkill) requieren registro manual del usuario vía bot de soporte.
Esto es redundante porque Ari YA calcula nivel y habilidades del usuario en cada árbol (AgentMembership).
La agregación cross-árbol debe ser automática.

## What Changes

- **Nueva tabla TreeSkill**: treeId, userId, skill, xp, level — almacena skills detectadas por árbol.
  Poblada por Ari al evaluar interacciones. @unique([userId, treeId, skill]).
- **Nuevo servicio crossTreeSkillAggregator.ts**: cron diario (medianoche) que:
  1. Lee todas las TreeSkill agrupadas por (userId, skill)
  2. Promedia level y xp SOLO entre árboles donde la skill EXISTE
  3. Skills ausentes en un árbol NO dividen el promedio
  4. Guarda resultado en WorkerSkill (upsert)
- **Eliminar registro manual**: el comando /skills del bot de soporte ahora lee de WorkerSkill
  en vez de pedir al usuario que declare sus skills.

## Impact

- **Nueva tabla**: TreeSkill (schema.prisma + migración)
- **Nuevo archivo**: src/services/crossTreeSkillAggregator.ts (~60 LOC)
- **Modificado**: src/index.ts (registro de cron diario)
- **Cero tokens LLM** — matemática pura con SQL
- **Skill de Ari**: actualizar trust-maker para guardar TreeSkill
