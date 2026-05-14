# Tareas — Aislamiento por Árbol

> Las tareas van de 30-60 min cada una. Cada checkbox se convierte en un Kanban task.

## Fase 1: Infraestructura

- [ ] **T1: Agregar modelo TreeSandbox a Prisma**
  - Agregar modelo `TreeSandbox` en `backend/prisma/schema.prisma`
  - Campos: id, treeId (unique), port (unique), status, timestamps
  - Relación con Tree (onDelete: Cascade)
  - Ejecutar `npx prisma migrate dev --name add_tree_sandbox`

- [ ] **T2: Crear servicio TreeSandbox (filesystem + puertos)**
  - Crear `backend/src/services/treeSandbox.ts`
  - `create(treeId)`: crear dirs, asignar puerto, guardar en DB
  - `destroy(treeId)`: borrar dirs, liberar puerto, borrar de DB
  - `get(treeId)`: consultar DB
  - `list()`: listar todos
  - `health(treeId)`: GET a localhost:{port}/health
  - Pool de puertos: 4100-4999, buscar menor libre

- [ ] **T3: Crear rutas API para sandbox**
  - Crear `backend/src/routes/sandboxRoutes.ts`
  - `POST /api/trees/:id/sandbox` — crear (JWT requerido)
  - `GET /api/trees/:id/sandbox` — obtener estado
  - `DELETE /api/trees/:id/sandbox` — destruir (JWT requerido)
  - `GET /api/trees/:id/sandbox/health` — health check
  - Registrar rutas en `backend/src/index.ts`

## Fase 2: Integración

- [ ] **T4: Auto-crear sandbox al crear árbol**
  - En `bot/index.ts` (handler `my_chat_member`): llamar `TreeSandbox.create()` después de crear árbol
  - En `treeRoutes.ts` (POST /api/trees): llamar `TreeSandbox.create()` al crear árbol vía API
  - Solo si `admissionPolicy !== 'CLOSED'`

- [ ] **T5: Auto-destruir sandbox al eliminar árbol**
  - Agregar hook o middleware en delete de árbol para llamar `TreeSandbox.destroy()`
  - Si falla destroy, loguear warning (no bloquear el delete del árbol)

## Fase 3: Verificación

- [ ] **T6: Tests de integración**
  - Crear árbol → verificar sandbox creado
  - GET sandbox → verificar puerto y path
  - DELETE sandbox → verificar directorio eliminado
  - Crear 2 árboles → verificar puertos diferentes
  - Eliminar árbol → verificar sandbox destruido (cascade)
  - Puerto 4100 ya tomado → asigna 4101

- [ ] **T7: Documentación y commit**
  - Actualizar README con sección "Aislamiento por Árbol"
  - Commit final con todos los cambios
  - Push a `trust-maker`
