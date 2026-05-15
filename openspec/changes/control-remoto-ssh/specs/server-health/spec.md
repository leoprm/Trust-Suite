## ADDED Requirements

### Requirement: Health check periódico
El sistema SHALL ejecutar health checks cada 15 minutos en servidores con status
`active`, verificando conectividad SSH básica (comando `echo ok`).

#### Scenario: Health check exitoso
- **WHEN** el health check recibe "ok" en menos de 10 segundos
- **THEN** se actualiza `lastCheck` y `status` se mantiene `active`

#### Scenario: Health check fallido
- **WHEN** el health check falla 3 veces consecutivas
- **THEN** el status cambia a `unreachable`

### Requirement: Endpoint de status
Un miembro SHALL poder consultar el status actual de un servidor.

#### Scenario: Consulta de status
- **WHEN** se solicita GET /api/servers/:id/status
- **THEN** se devuelve status, lastCheck, uptime (si disponible), y resultado del último health check
