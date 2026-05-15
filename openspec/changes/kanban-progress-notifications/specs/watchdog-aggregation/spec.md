## MODIFIED Requirements

### Requirement: Watchdog envía resumen de progreso
El watchdog SHALL enviar un resumen agregado del progreso de todas las tareas
Kanban del usuario cuando al menos una tarea cambia de estado, en vez de solo
notificar tareas individuales.

#### Scenario: Progreso intermedio
- **WHEN** el watchdog detecta que una tarea pasó a `done` y hay más tareas pendientes
- **THEN** envía: "📊 Progreso: ✓ 3/6 tareas | ● corriendo: T4 Migrar textos | ◻ pendientes: T5, T6"

#### Scenario: Todas completadas
- **WHEN** el watchdog detecta que la última tarea pendiente pasó a `done`
- **THEN** envía: "🎉 ¡Todas las tareas completadas! (6/6) ✅"

#### Scenario: Tarea bloqueada
- **WHEN** una tarea pasa a `blocked`
- **THEN** el watchdog notifica: "⊘ T3 bloqueada: [razón]. Revisando..."

### Requirement: Frecuencia de notificaciones
El watchdog SHALL notificar máximo una vez por minuto por usuario para evitar spam.
Si múltiples tareas cambian de estado en el mismo minuto, se agrupan en un solo mensaje.

#### Scenario: Rate limiting
- **WHEN** 3 tareas pasan a `done` en 30 segundos
- **THEN** se envía un solo mensaje agrupando los 3 cambios
