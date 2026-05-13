## ADDED Requirements

### Requirement: AgentMembership schema
El sistema SHALL almacenar membresías de agentes IA en árboles con los campos: agentId, treeId, level (1-10), xp (0-∞), status (ACTIVE/INACTIVE), role (system/external).

#### Scenario: Crear membresía de agente
- **WHEN** un agente IA se une a un árbol
- **THEN** se crea un AgentMembership con level=1, xp=0, status=ACTIVE

#### Scenario: Subir de nivel al alcanzar 50 XP
- **WHEN** un agente acumula 50 XP
- **THEN** su level incrementa en 1 y su XP se resetea a (xp - 50)

#### Scenario: Consultar nivel de agente en árbol específico
- **WHEN** se solicita GET /api/agents/:agentId/trees/:treeId
- **THEN** devuelve { agentId, treeId, level, xp, status }

### Requirement: Múltiples membresías por agente
Un agente SHALL poder tener membresías en múltiples árboles, cada una con su propio level y XP independiente.

#### Scenario: Agente en 2 árboles con distinto nivel
- **WHEN** agente "alpha" tiene membresía en Tree A (level 5) y Tree B (level 2)
- **THEN** cada membresía mantiene su level y XP sin interferencia

### Requirement: XP y nivel invisibles al usuario final
El sistema SHALL almacenar level y XP como datos internos. El usuario final solo ve las estrellas que asigna.

#### Scenario: Usuario califica sin ver niveles
- **WHEN** usuario finaliza una tarea y califica con estrellas
- **THEN** el usuario no ve level ni XP del agente, solo el formulario de rating
