## ADDED Requirements

### Requirement: Consulta de estado de tareas
Cuando un usuario pregunta "¿cómo van las tareas?" o variantes, el bot SHALL
consultar `hermes kanban list` filtrado por las tareas del chat actual y responder
con un resumen formateado.

#### Scenario: Usuario pregunta por progreso
- **WHEN** el usuario envía "¿cómo van las tareas?" o "¿cómo va?" o "¿cómo vamos?"
- **THEN** el bot ejecuta `hermes kanban list` y responde con el formato:
  ```
  ✓ T1 Schema + i18n   ✓ T2 Locales JSON
  ● T4 Migrar textos   ◻ T3 Selector  ◻ T6 Tests
  ```

#### Scenario: No hay tareas activas
- **WHEN** el usuario pregunta pero no tiene tareas Kanban activas
- **THEN** responde: "No hay tareas activas en este momento."

#### Scenario: Comando explícito /status
- **WHEN** el usuario envía `/status`
- **THEN** mismo comportamiento que la consulta natural

### Requirement: Auto-claim de tareas
Cuando el bot crea tareas Kanban, SHALL asignárselas a sí mismo automáticamente
para que el watchdog sepa qué tareas monitorear para cada usuario.

#### Scenario: Crear tarea con auto-claim
- **WHEN** el bot crea una tarea Kanban vía `hermes kanban create`
- **THEN** inmediatamente ejecuta `hermes kanban claim <task_id>` o usa `--assignee backend-eng`
- **AND** guarda el mapping task_id → chat_id en el bridge existente
