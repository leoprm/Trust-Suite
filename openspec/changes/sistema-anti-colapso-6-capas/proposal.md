# Propuesta: Sistema Anti-Colapso (6 Capas)

## Problema
Trust Maker está diseñado para grupos pequeños (~5 personas), pero necesita escalar a 200+. Sin protecciones, Ari puede ser víctima de spam, DDoS y colapso por concurrencia. Un solo usuario malintencionado puede consumir todos los tokens del día o hacer que Ari deje de responder.

## Solución
Sistema de defensa en 6 capas progresivas:

1. **Rate-limit por usuario** — 3 msg/60s → cooldown 5 min (en memoria)
2. **Votación grupal** — Reactivar kanbanProposal/kanbanVote para grupos >20 miembros
3. **Semáforo typing + cola FIFO** — Encolar (no rechazar), máx 5 mensajes
4. **Prioridad admin** — Admin salta la cola
5. **Anti-DDoS** — Límite usuarios/árbol → salida → 3 strikes → bloqueo 3 meses
6. **Modo pausa + /reset** — Control manual por admin

## Impacto
- Archivos: `bot/index.ts`, `bot/hermesBridge.ts`, `prisma/schema.prisma`
- Nuevos campos en Tree: `maxMembers`, `voteThreshold`, `paused`, `leaveAttempts`, `blockedUntil`
- Sin breaking changes — todo es aditivo
