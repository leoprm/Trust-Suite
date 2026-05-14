# Aislamiento por Árbol — Propuesta

## Problema
Cada comunidad (árbol) generará sus propias aplicaciones (frontends, scripts, agentes). Si todo comparte el mismo filesystem y puertos, habrá colisiones, fugas de seguridad, y consumo descontrolado de recursos.

## Solución (Fase 1 — Ligera)
Aislamiento por directorio: cada árbol tiene su workspace en `/home/leo/trees/{treeId}/`. Las apps corren en el mismo proceso Node.js pero con contexto aislado por árbol. Sin Docker, sin virtualización.

### Características
- **Directorio por árbol:** `/home/leo/trees/{treeId}/` con subdirectorios `apps/`, `data/`, `logs/`
- **Puertos dinámicos:** asignados al crear el sandbox, rango 4100-4999, almacenados en DB
- **Sandbox service:** `TreeSandbox` en `backend/src/services/treeSandbox.ts` — crear, destruir, listar, health check
- **API endpoints:** CRUD de sandboxes bajo `/api/trees/:id/sandbox`
- **DB schema:** tabla `TreeSandbox` con `treeId`, `port`, `status`, `createdAt`

### Capacidad de crecimiento a Docker (Fase 2)
La interfaz `TreeSandbox` abstrae la implementación: hoy usa directorios, mañana Docker. Los consumers (API routes, bot) no cambian.

## No incluido en Fase 1
- Containerización real (Docker)
- Rate limiting por árbol
- Cuotas de disco/CPU
- Balanceo de carga
