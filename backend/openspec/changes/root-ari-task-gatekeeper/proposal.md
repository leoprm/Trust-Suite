# Root Ari Task Gatekeeper + Deep Tree Warning — Propuesta

**Status:** Draft
**Autor:** Leo + Hermes
**Fecha:** 2026-05-20

## Problema

Actualmente los comentarios dirigidos a sub-árboles (vía hashtag o mención) llegan directamente a la Ari del sub-árbol sin filtro. No hay priorización ni clasificación. La Ari raíz (árbol padre) tiene capacidad de orquestación pero no participa en el flujo de tareas hacia sub-árboles.

Además, no hay advertencia al crear sub-árboles profundos (nivel 3+) sobre el aumento de latencia en la coordinación entre Aris.

## Solución

Dos cambios:

### A. Root Ari como clasificador/priorizador (no bloqueante)
- Los mensajes llegan **inmediatamente** al sub-árbol (sin esperar a la Ari raíz)
- En paralelo, la Ari raíz evalúa el comentario y asigna:
  - **Importancia** (1-10) según keywords
  - **Intento de resolución interna**: si puede responder sin crear tarea, lo hace
  - **Delegación a Kanban**: si requiere trabajo del sub-árbol, crea tarea asignada al sub-árbol como "agente"
- El sub-árbol recibe la tarea vía external-tasks (fase 2)

### B. Advertencia de profundidad en onboarding
- Al crear un sub-árbol, detectar profundidad (cadena de parentTreeId)
- Si depth ≥ 2 (sería nivel 3), mostrar warning sobre latencia

## Principios

1. **No bloqueante** — mensajes llegan al sub-árbol al instante
2. **Clasificación asíncrona** — la Ari raíz procesa en segundo plano
3. **Sub-árbol como agente Kanban** — reusa human-worker + external-tasks
4. **Transparencia** — advertir sobre latencia en árboles profundos
