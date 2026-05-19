# Clasificación de Árboles + Motor de Contratación — Propuesta

## Why

Al crear un árbol, Ari debe clasificarlo (gremio/academia/empresa) según su descripción
y determinar qué habilidades nutre. Esto alimenta el motor de contratación que pondera
4 factores para recomendar candidatos.

## What Changes

- **Clasificación de árbol** (al crearse):
  1. Ari analiza la descripción del árbol
  2. Genera `tree-classification.json` en el sandbox: { type, skills }
  3. Cron sync desde sandbox → DB (Tree.classification, JSON)
  
- **Motor de contratación** (puente controlado):
  1. Ari del árbol define 3 mínimos → `hiring-request-{taskId}.json` en sandbox:
     { minSkillLevel, minSatisfactionPersonal, minSatisfactionGrupal }
  2. Puente unidireccional → POST al Hermes Agent de /home/support/
     SOLO transmite esos 3 números. NUNCA lista de candidatos.
  3. Support Agent: filtra candidatos que superen los 3 mínimos,
     pondera 4 factores (skill + satPersonal + satGrupal + volumen),
     genera top 3 → `hiring-result-{taskId}.json`
  4. Resultado vuelve al sandbox → Ari lo presenta al grupo

- **Skill de Ari**: clasificar árbol al crearse, definir mínimos de contratación.

## Impact

- **Modificado**: schema.prisma (+classification JSON en Tree)
- **Nuevo archivo**: src/services/treeClassifier.ts (~40 LOC — sync sandbox→DB)
- **Nuevo script**: /home/support/hiring-evaluator.py (Hermes Agent)
- **Skill Ari**: actualizar trust-maker con pasos de clasificación + contratación
- **SÍ requiere LLM**: clasificación inicial y evaluación de contratación
