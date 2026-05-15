# Tareas: Control Remoto vía SSH

## 1. Schema + Encriptación

- [ ] 1.1 Agregar modelo `ManagedServer` a Prisma (id, treeId, name, ip, port, username, encryptedKey, status, lastCheck)
- [ ] 1.2 Crear `encryptionService.ts` — `encryptKey(plaintext, treeId)` / `decryptKey(ciphertext, treeId)` con AES-256-GCM
- [ ] 1.3 Migración de base de datos (`npx prisma db push`)

## 2. SSH Gateway

- [ ] 2.1 Instalar `ssh2` y crear `sshGateway.ts` — `execCommand(serverId, command)` que desencripta, conecta, ejecuta, limpia
- [ ] 2.2 Implementar timeout 30s y rate limiting (10/min/servidor)

## 3. CRUD Endpoints

- [ ] 3.1 POST /api/servers — registrar servidor (encripta clave, verifica conectividad inicial)
- [ ] 3.2 GET /api/trees/:id/servers — listar servidores del árbol (sin clave)
- [ ] 3.3 DELETE /api/servers/:id — eliminar servidor y clave
- [ ] 3.4 POST /api/servers/:id/exec — ejecutar comando (solo devuelve resultado, no clave)

## 4. Concierge Integration

- [ ] 4.1 Agregar tool `ssh_exec` al system prompt del Concierge
- [ ] 4.2 Inyectar lista de servidores en el contexto del Concierge
- [ ] 4.3 Manejar `tool_calls` en conciergeController — detectar ssh_exec y rutear a sshGateway

## 5. Health Checks

- [ ] 5.1 Crear job en el scheduler: health check cada 15 minutos
- [ ] 5.2 GET /api/servers/:id/status — endpoint de status individual

## 6. Seed + Verificación

- [ ] 6.1 Agregar servidor de ejemplo al seed demo
- [ ] 6.2 Test end-to-end: registrar servidor → ejecutar comando → verificar resultado
