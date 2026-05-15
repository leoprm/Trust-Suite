## ADDED Requirements

### Requirement: Crear tarea Kanban desde el bot
El bot SHALL poder crear tareas en Kanban ejecutando el CLI `hermes kanban create`
vía `child_process.exec`.

#### Scenario: Tarea creada exitosamente
- **WHEN** se detecta consulta compleja
- **THEN** se ejecuta `hermes kanban create "Consulta: <resumen>" --assignee backend-eng --workspace dir:/home/leo/Documentos/TrustMaker/backend --body "<consulta completa con contexto>"`
- **THEN** se extrae el task ID del stdout
- **THEN** se responde al usuario con "⏳ t_xxx — te mantengo al tanto cada 2:30 min"

#### Scenario: Fallo al crear tarea
- **WHEN** el CLI de Kanban falla (timeout, error)
- **THEN** se hace fallback a concierge en línea con timeout de 10 min

### Requirement: Contexto completo en la tarea
La tarea Kanban SHALL incluir el mensaje completo del usuario, el treeId, y el
chatId de Telegram para que el worker pueda responder al canal correcto.

#### Scenario: Worker responde al chat
- **WHEN** el worker completa la tarea
- **THEN** envía la respuesta al chatId original vía API de Telegram
