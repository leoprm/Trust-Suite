## ADDED Requirements

### Requirement: Tool ssh_exec en system prompt
El Concierge SHALL incluir en su system prompt la capacidad de ejecutar comandos
SSH en servidores registrados, usando un identificador de servidor pero SIN acceso
a las claves. El Concierge solo ve el resultado del comando.

#### Scenario: IA ordena ejecutar comando
- **WHEN** el usuario pide "instala Docker en mi servidor"
- **THEN** la IA identifica el servidor por nombre/IP, invoca `ssh_exec(serverId, command)` y recibe stdout/stderr

#### Scenario: IA no puede ver claves
- **WHEN** la IA intenta acceder a la clave SSH de un servidor
- **THEN** el sistema no expone el campo `encryptedKey` en ningún contexto accesible a la IA

### Requirement: Listar servidores disponibles para la IA
El Concierge SHALL recibir en su contexto la lista de servidores del árbol
(solo nombre, IP, status) para poder referenciarlos.

#### Scenario: Contexto del Concierge incluye servidores
- **WHEN** se construye el system prompt del Concierge
- **THEN** se incluye lista de servidores con id, name, ip, status (sin clave)
