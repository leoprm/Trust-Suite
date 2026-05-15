## ADDED Requirements

### Requirement: Registro de servidor externo
Un miembro de un árbol SHALL poder registrar un servidor externo proporcionando
IP, puerto SSH, usuario y clave privada SSH. La clave se encripta inmediatamente
con AES-256 antes de persistir en base de datos.

#### Scenario: Registro exitoso de servidor
- **WHEN** un miembro envía IP, puerto, usuario y clave SSH válida
- **THEN** el servidor se registra con la clave encriptada y status `pending_verification`

#### Scenario: Clave SSH inválida
- **WHEN** la clave SSH no es válida (no se puede parsear como clave privada)
- **THEN** se devuelve error 400 con mensaje "Clave SSH inválida"

### Requirement: Listar servidores del árbol
Un miembro SHALL poder listar los servidores registrados en su árbol, sin ver
las claves SSH (solo metadatos: IP, status, último health check).

#### Scenario: Listar servidores
- **WHEN** un miembro solicita GET /api/trees/:id/servers
- **THEN** se devuelve lista de servidores con IP, puerto, status, lastCheck, sin clave

### Requirement: Eliminar servidor
Un administrador del árbol SHALL poder eliminar un servidor registrado, lo que
también elimina su clave encriptada de la base de datos.

#### Scenario: Eliminación exitosa
- **WHEN** un admin elimina un servidor
- **THEN** el registro y su clave encriptada se eliminan permanentemente
