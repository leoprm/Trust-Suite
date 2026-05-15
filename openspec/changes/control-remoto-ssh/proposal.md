# Propuesta: Control Remoto vía SSH (Fase 3)

## ¿Por qué?

Trust Maker necesita ejecutar software en los servidores de las comunidades sin
requerir que los miembros instalen nada manualmente. El usuario solo comparte
su clave SSH y la IA hace todo el trabajo de instalación y configuración.

## ¿Qué cambia?

- **Nuevo**: Modelo `ManagedServer` — servidores externos administrados por Trust Maker
- **Nuevo**: Encriptación AES-256 de claves SSH en base de datos
- **Nuevo**: Servicio `SshGateway` — ejecuta comandos SSH sin exponer claves a la IA
- **Nuevo**: Endpoints CRUD para gestionar servidores (`/api/servers`)
- **Nuevo**: Integración con Concierge — la IA puede ordenar `conectar a servidor X`
- **Nuevo**: Health checks y monitoreo básico de servidores conectados

## Capacidades

1. **server-management** — CRUD de servidores con clave SSH encriptada
2. **ssh-gateway** — Ejecución segura de comandos (clave se desencripta solo en memoria)
3. **concierge-ssh-integration** — La IA puede ejecutar comandos sin ver las claves
4. **server-health** — Health checks periódicos y status de servidores

## Impacto

- **Backend**: Nuevos modelos Prisma, servicios, controladores, rutas
- **Seguridad**: Nuevo módulo de encriptación AES-256 para claves SSH
- **Concierge**: Nuevo tool en system prompt para `ssh_exec`
- **DB**: Migración con tabla `ManagedServer`
- **Frontend**: No aplica (chat-first v4)
