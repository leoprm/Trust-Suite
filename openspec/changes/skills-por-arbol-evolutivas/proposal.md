# Propuesta: Skills por Árbol Evolutivas

## Problema
Si todos los usuarios de todos los árboles pueden crear skills globales de Hermes, el sistema se satura — demasiadas skills, ruido, lentitud, inutilidad. Hermes tiene ~65 skills built-in; 40 skills curadas de TrustMaker es más que suficiente.

## Solución
Sistema de skills híbrido: locales al árbol + promoción selectiva a globales vía selección natural.

1. **Skills locales**: Ari guarda skills como `.md` en `<sandbox>/skills/` del árbol. Solo visibles en ese árbol.
2. **Rating**: Cada skill incluye `rating.json` con nota 1-10 de qué tan global es.
3. **Contador de usos**: `usos.json` — cada vez que Ari carga una skill global, suma 1.
4. **Trigger 20 tareas**: Cuando Ari completa 20 tareas en un árbol, evalúa si alguna interacción merece ser skill.
5. **Cron nocturno**: Hermes escanea skills de todos los árboles. Filtra rating ≥ 6 en el promedio de los ratings de todas las apariciones de la skill en distintos árboles + deduplica por nombre/normalización.
6. **Fitness score**: `(rating_promedio × 0.4) + (usos × 0.6)`. Las 40 mejores sobreviven.
7. **Reemplazo**: Si 40 llenas, entra la de mayor fitness y sale la de menor.
8. **Solo Leo**: Solo el admin (Telegram ID específico) puede crear/modificar skills globales.

## Impacto
- `src/bot/hermesBridge.ts` — instrucciones de skill en system prompt
- `src/services/skillEvolution.ts` — nuevo: cron nocturno de evolución
- `src/bot/scheduler.ts` — cron nocturno
- Sandbox API — handler de skills en `sandboxController.ts`
