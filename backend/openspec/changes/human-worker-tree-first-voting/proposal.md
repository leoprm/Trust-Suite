# Human-in-the-Loop: Árbol Primero + Votación — Propuesta

**Status:** Draft | **Autor:** Leo + Hermes | **Fecha:** 2026-05-18

## Mejora

Cuando una tarea human-worker aparece en Kanban, antes de buscar externos, Ari pregunta dentro del grupo del árbol si alguien tiene las habilidades. Se postulan candidatos del árbol. Luego votación anónima decide: candidato interno, contratar externo, o cancelar.

## Flujo completo

1. Ari publica en grupo: titulo, skills requeridas, budget, deadline
2. 4h de ventana para que miembros se postulen con boton "Yo puedo"
3. 20 min antes del cierre: Ari recuerda "nadie mas?"
4. Al cerrar: encuesta anonima nativa de Telegram con candidatos + "Contratar externo (~$X)" + "Cancelar tarea"
5. Si gana candidato interno: se le asigna la tarea
6. Si gana externo: ExternalTask al marketplace via @AriSuperManagerBot
7. Si gana cancelar: Ari propone alternativas, guarda el plan para futuro

## Timing

- Ventana candidatos: 4 horas
- Recordatorio: 20 min antes del cierre
- Votacion: mismo tiempo que votacion de necesidades (24h o configurable)

## Schema nuevo

- Candidate: userId, taskId, status, createdAt
- CancelledPlan: titulo, descripcion, skills, budget, motivo, createdAt (para reusar)
