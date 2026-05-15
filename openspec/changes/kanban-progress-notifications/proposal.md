# Propuesta: Notificaciones de Progreso Kanban

## ¿Por qué?

Cuando Harry (el bot de Trust Maker) crea tareas Kanban, el usuario queda a ciegas:
- No sabe si las tareas se están procesando o se congelaron
- No sabe cuántas van completadas ni cuántas faltan
- Si pregunta "¿cómo vas?", Harry no sabe responder consultando el Kanban

El watchdog actual solo notifica "✅ Tarea completada" individualmente. Falta contexto de progreso.

## ¿Qué cambia?

- **Mejorado**: Watchdog ahora envía resumen agregado: "✓ 3/6 tareas completadas. ● corriendo: T4. ◻ pendientes: T5, T6"
- **Nuevo**: Handler de consulta — cuando el usuario pregunta "¿cómo van las tareas?", Harry consulta `hermes kanban list` y responde con estado
- **Nuevo**: Auto-claim — cuando Harry crea tareas Kanban, se las asigna automáticamente

## Capacidades

1. **watchdog-aggregation** — Watchdog notifica progreso agregado, no solo tareas individuales
2. **status-query** — El bot responde a consultas de estado consultando Kanban

## Impacto

- **Backend**: Modificar `kanbanWatchdog.ts`, agregar handler en `messages.ts`
- **No DB**: Sin cambios en schema
- **Frontend**: No aplica
