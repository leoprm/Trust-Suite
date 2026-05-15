## ADDED Requirements

### Requirement: Notificación al completar tarea
Al terminar una tarea Kanban originada por el bot, el sistema SHALL notificar
al usuario con el resultado completo.

#### Scenario: Tarea completada exitosamente
- **WHEN** una tarea Kanban llega a `done`
- **THEN** el watchdog detecta el cambio y envía: "✅ t_xxx completada: <resultado>"
- **THEN** el watchdog se auto-desactiva para esa tarea

#### Scenario: Tarea falla repetidamente
- **WHEN** una tarea falla 3 veces (auto-block)
- **THEN** se notifica: "❌ t_xxx falló después de 3 intentos. Motivo: <razón>"

### Requirement: Watchdog se limpia solo
Los watchdogs SHALL auto-desactivarse cuando su tarea asociada ya no está activa
(done, archived). No debe quedar basura de cron jobs.

#### Scenario: Limpieza automática
- **WHEN** el watchdog detecta que su tarea no existe o está done/archived
- **THEN** el cron job se elimina automáticamente
