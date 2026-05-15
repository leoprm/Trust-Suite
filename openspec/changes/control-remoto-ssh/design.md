# Diseño: Control Remoto vía SSH

## Contexto

Trust Maker v4 es chat-first. Los miembros interactúan vía Telegram. Esta fase
agrega la capacidad de administrar servidores externos vía SSH sin que los
usuarios instalen nada manualmente.

## Objetivos

- **Sí**: CRUD de servidores con clave SSH encriptada
- **Sí**: Ejecución de comandos SSH desde el Concierge
- **Sí**: La IA nunca ve las claves (solo recibe resultados)
- **No**: SFTP / transferencia de archivos (fase futura)
- **No**: Soporte para Windows Server (solo Linux por ahora)

## Decisiones

### 1. Encriptación: AES-256-GCM con clave maestra por árbol

**Alternativas consideradas:**
- Clave maestra global: más simple pero menos aislada. Si se compromete, todos los árboles expuestos.
- Clave por servidor: máxima seguridad pero el usuario tendría que gestionar otra clave.

**Decisión:** AES-256-GCM con clave derivada de `JWT_SECRET + treeId`. La clave
maestra se deriva al vuelo, nunca se persiste. Las claves SSH individuales se
encriptan con esta clave maestra.

### 2. Transporte SSH: librería ssh2 (Node.js)

**Alternativas consideradas:**
- Child process `ssh` nativo: simple pero sin control de timeout, escape de shell.
- Librería ssh2: control fino, timeout, streaming, sin depender del CLI.

**Decisión:** `ssh2` npm package. Conexiones con timeout de 30s, sin shell
interactivo (exec mode).

### 3. Rate limiting: 10 comandos/minuto/servidor

**Justificación:** Previene abuso si la IA entra en bucle. Suficiente para
operaciones de instalación/configuración.

### 4. La IA no ve claves: patrón "handle, no credentials"

**Implementación:**
1. El system prompt incluye `ssh_exec(serverId, command)` como tool
2. El Concierge controller recibe `tool_calls` con serverId y command
3. El controller llama al `SshGateway` que desencripta y ejecuta
4. Solo el resultado (stdout/stderr/exitCode) vuelve a la IA
5. Las claves nunca entran al contexto del modelo

### 5. Health checks: CRON cada 15 minutos

Usando el scheduler existente de Trust Maker. `echo ok` vía SSH. 3 fallos
consecutivos → `unreachable`.

## Riesgos

- **Compromiso de JWT_SECRET**: Si el JWT_SECRET se filtra, todas las claves SSH
  del árbol son descifrables. Mitigación: rotación periódica + aislamiento del .env.
- **Abuso de SSH por la IA**: La IA podría ejecutar comandos destructivos.
  Mitigación: lista blanca de comandos permitidos (fase futura).

## Plan de migración

Nuevo modelo `ManagedServer` + migración Prisma. No afecta modelos existentes.
Rollback: eliminar tabla.

## Preguntas abiertas

- ¿Lista blanca de comandos desde el día 1 o confiamos en la IA?
- ¿Notificar al usuario cuando el health check falla?
