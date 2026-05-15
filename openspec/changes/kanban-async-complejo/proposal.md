# Propuesta: Kanban Async para Consultas Complejas

## ¿Por qué?

Las consultas complejas (SSH, instalación, multi-paso) exceden el timeout del
concierge (10 min). El usuario se queda esperando y reenvía mensajes. La solución
es derivar estas consultas a Kanban para procesamiento asíncrono con notificaciones
de progreso.

## ¿Qué cambia?

- **Nuevo**: Detector de complejidad en el bot — decide si responde en línea o deriva a Kanban
- **Nuevo**: Creación de tareas Kanban desde el bot (exec `hermes kanban create`)
- **Nuevo**: Watchdog de progreso — notifica cada 2:30 min mientras la tarea corre
- **Nuevo**: Notificación final con resultado al completar la tarea
- **Modificado**: `messages.ts` — ruteo condicional (simple → concierge, complejo → kanban)

## Capacidades

1. **complexity-detector** — Heurísticas para decidir si una consulta va a Kanban
2. **kanban-task-creation** — El bot crea tareas Kanban vía CLI
3. **progress-watchdog** — Cron cada 2:30 min notifica estado de la tarea
4. **completion-notification** — Al terminar la tarea, se notifica resultado al usuario

## Impacto

- **Backend**: `messages.ts`, `commands.ts`, nuevo `kanbanBridge.ts`
- **Cron**: Nuevo job de watchdog cada 2:30 min
- **DB**: Sin cambios de schema
