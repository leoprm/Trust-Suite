## ADDED Requirements

### Requirement: Ejecutar comando vía SSH
El sistema SHALL poder ejecutar un comando en un servidor registrado. La clave
SSH se desencripta de la base de datos SOLO en memoria durante la conexión, y
se destruye inmediatamente después. La IA nunca accede al contenido de la clave.

#### Scenario: Ejecución exitosa
- **WHEN** se solicita ejecutar un comando en un servidor con status `active`
- **THEN** se desencripta la clave en memoria, se conecta vía SSH, se ejecuta el comando, y se devuelve stdout/stderr/exitCode

#### Scenario: Servidor inalcanzable
- **WHEN** el servidor no responde en 30 segundos
- **THEN** se devuelve error de conexión y se marca `lastCheck` con fail

### Requirement: Encriptación AES-256 de claves
Las claves SSH SHALL almacenarse encriptadas con AES-256-GCM usando una clave
maestra del árbol (derivada de JWT_SECRET + treeId). La clave maestra nunca se
expone a la IA ni a los endpoints públicos.

#### Scenario: Clave encriptada en reposo
- **WHEN** se inspecciona la base de datos
- **THEN** el campo `encryptedKey` contiene datos cifrados ilegibles

#### Scenario: Desencriptación solo en memoria
- **WHEN** se necesita la clave para una conexión SSH
- **THEN** se desencripta, se usa, y se limpia de memoria inmediatamente (sin logs, sin retorno a la IA)

### Requirement: Timeout y rate limiting
Las conexiones SSH SHALL tener timeout de 30 segundos y rate limit de 10
comandos por minuto por servidor.

#### Scenario: Timeout
- **WHEN** un comando SSH excede 30 segundos
- **THEN** se aborta la conexión y se devuelve error de timeout

#### Scenario: Rate limit
- **WHEN** se exceden 10 comandos en 1 minuto para un mismo servidor
- **THEN** se devuelve error 429
