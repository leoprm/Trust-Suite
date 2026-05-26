# Kanban Multi-Tree para Ari — Propuesta

**Status:** Draft
**Autor:** Leo + Hermes
**Fecha:** 2026-05-25

## Problema

Ari actualmente ejecuta todo el trabajo ella misma — análisis, investigación, escritura, código. Esto es secuencial (un tree a la vez) y limita la escalabilidad. Con la meta de servir 100 árboles simultáneos, Ari necesita delegar trabajo a un pool de workers especializados.

## Solución

Activar Kanban en `/home/trustmaker/.hermes/` con un pool compartido de ~8 workers. Ari solo orquesta (crea tareas Kanban), los workers ejecutan en paralelo y confinados al sandbox de cada tree.

## Principios de diseño

1. **Workers compartidos, no dedicados.** Pool de 8 workers para todos los trees. Sin workers por tree.
2. **Aislamiento por sandbox.** Workers confinados a `dir:/home/trustmaker/trees/<treeId>/sandbox/`. Cero acceso al backend.
3. **Ari orquesta, no ejecuta.** Ari crea tareas Kanban en ~10s y vuelve a estar disponible.
4. **Humanos vía ExternalTask.** `person:<userId>` para revisión humana, sin pool fijo.
5. **Monitoreo mínimo.** Solo alertas de tareas bloqueadas (blocked-only), sin spam de status.

## Dimensionamiento

| Parámetro | Valor |
|---|---|
| Árboles activos | 100 |
| Tareas/día estimadas | 75 |
| Peak concurrente | 2-3 workers |
| Workers totales | 10 (peak + 5 + 2 extra backend) |
| Perfiles | backend-eng(4), analyst(2), researcher(2), writer(2) |

## Impacto

- **hermesBridge.ts:** Agregar instrucciones de delegación Kanban en buildSystemPrompt
- **config.yaml trustmaker:** Agregar sección `kanban:`
- **Perfiles Hermes:** 8 nuevos perfiles vía `hermes profile create`
- **AGENTS.md:** Nuevo archivo en `/home/trustmaker/trees/` con regla de oro sandbox
- **Cron:** Blocked-only alert para monitoreo

## Riesgos

- Workers podrían intentar acceder fuera del sandbox → mitigado con AGENTS.md + system prompt
- Dispatcher podría fallar (bug conocido) → fallback con standalone daemon
- Ari podría generar tareas malformadas → validación en endpoint

## Alternativas consideradas

- **Workers por tree:** Descartado — no escala a 100 trees (mínimo 200-300 perfiles)
- **Delegate_task:** Descartado — no persiste entre sesiones, no tiene revisión humana
- **Pi Agent sub-agents:** Descartado — efímeros, sin multi-tenancy, sin integración con TrustMaker
