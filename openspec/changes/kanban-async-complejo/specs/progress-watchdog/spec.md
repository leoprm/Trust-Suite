## ADDED Requirements

### Requirement: Watchdog de progreso cada 2:30 min
Un cron job SHALL monitorear tareas Kanban activas originadas por el bot y
notificar al usuario cada 2:30 minutos con el estado actual.

#### Scenario: Tarea en progreso
- **WHEN** la tarea está en estado `running` y el watchdog se ejecuta
- **THEN** se envía mensaje: "⏳ t_xxx sigue trabajando... (⏱ 5:00 transcurridos)"

#### Scenario: Tarea bloqueada
- **WHEN** la tarea está en estado `blocked`
- **THEN** se notifica: "⚠️ t_xxx está bloqueada: <razón>. Un admin debe revisarla."

#### Scenario: Tarea completada → watchdog se desactiva
- **WHEN** la tarea llega a `done`
- **THEN** el watchdog deja de monitorear esa tarea (se auto-desactiva)

### Requirement: Watchdog por tarea
Cada tarea originada por el bot SHALL tener su propio watchdog (no un watchdog
global). Esto permite múltiples consultas complejas simultáneas.

#### Scenario: Dos consultas simultáneas
- **WHEN** el usuario hace dos consultas complejas seguidas
- **THEN** se crean dos tareas Kanban y dos watchdogs independientes
- **THEN** cada uno notifica a su chat correspondiente
