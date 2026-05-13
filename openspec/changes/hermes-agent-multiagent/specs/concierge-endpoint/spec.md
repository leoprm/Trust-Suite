## ADDED Requirements

### Requirement: Endpoint POST /api/concierge
El sistema SHALL exponer un endpoint que recibe mensajes del chat y los reenvía a Hermes Agent API.

#### Scenario: Enviar mensaje simple
- **WHEN** frontend envía POST /api/concierge con body { message: "¿Qué necesidades hay?", treeId: "xxx", agentId: "yyy" }
- **THEN** el backend llama a POST :8642/v1/chat/completions con X-Hermes-Session-Key: tree-agent-xxx y devuelve la respuesta al frontend

#### Scenario: Rate limiting aplicado
- **WHEN** un agente excede 30 requests en 1 minuto
- **THEN** el sistema devuelve 429 con mensaje "Too many concierge requests"

#### Scenario: Timeout de Hermes Agent
- **WHEN** Hermes Agent no responde en 30 segundos
- **THEN** el sistema devuelve 504 con mensaje de timeout

### Requirement: Contexto de árbol y necesidad
El endpoint SHALL incluir el treeId y needId en el contexto enviado a Hermes Agent.

#### Scenario: Mensaje con contexto de necesidad
- **WHEN** frontend envía { message: "¿ideas?", treeId: "t1", needId: "n1" }
- **THEN** el system prompt incluye datos del árbol "t1" y necesidad "n1"

### Requirement: Historial de conversación
El sistema SHALL mantener historial de conversación por sesión vía X-Hermes-Session-Key.

#### Scenario: Continuidad entre mensajes
- **WHEN** el mismo agente envía 3 mensajes seguidos
- **THEN** Hermes Agent recibe el historial completo de la sesión
