# Tasks: Sandbox SQL Isolation

## Phase 1 — Hardening (técnico, sin dependencias)

- [ ] **Q1:** Crear `scripts/setup-sandbox-db-user.sql` — usuario MySQL `trust_sandbox_ro` con SELECT-only grants sobre todas las tablas de `trust_web`. También crear `scripts/isolate-sandbox.sh` — script idempotente que bloquea 127.0.0.1:3306 y ::1:3306 vía iptables para outbound del usuario `trustmaker`.
- [ ] **Q2:** Agregar `sandboxController.querySql` — nuevo handler en `src/controllers/sandboxController.ts`. Parsear SQL entrante, rechazar no-SELECT, inyectar `WHERE treeId = :treeId`, ejecutar con credenciales `trust_sandbox_ro`, retornar `{ rows, count }`. Rate-limit: 10/min/árbol (en memoria, SimpleRateLimiter).
- [ ] **Q3:** Agregar ruta `POST /api/trees/:treeId/sandbox/query` en `src/routes/sandboxRoutes.ts` apuntando a `querySql`.

## Phase 2 — System prompt + startup

- [ ] **Q4:** Actualizar `buildTreeSystemPrompt()` en `src/bot/hermesBridge.ts`. Agregar prohibición explícita de MySQL directo y documentar el endpoint `/sandbox/query` como única vía. Incluir advertencia de seguridad cross-tree.
- [ ] **Q5:** Modificar `src/index.ts` — ejecutar `scripts/isolate-sandbox.sh` durante el startup del backend (después de que Prisma se conecta, antes de listen). Loguear resultado.

## Phase 3 — Verificación

- [ ] **Q6:** Integration test — verificar que `mysql` desde terminal del agente es rechazado (connection refused), y que `POST /sandbox/query` solo devuelve datos del treeId autenticado.
