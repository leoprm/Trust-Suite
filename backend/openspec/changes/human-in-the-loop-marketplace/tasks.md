# Human-in-the-Loop Kanban Bridge — Tasks v2

## H1: Schema + Migración

- [ ] Agregar campos `availableForHire`, `hourlyRate`, `currency`, `location`, `telegramUsername` al modelo User en Prisma
- [ ] Crear modelo `ExternalTask` + enum `ExternalTaskStatus`
- [ ] Ejecutar migración (`npx prisma db push`)
- [ ] Verificar columnas en MySQL

## H2: CRUD Endpoints ExternalTask

- [ ] `src/controllers/externalTaskController.ts` + `src/routes/externalTasks.ts`
- [ ] POST `/api/external-tasks` — crear (body: treeId, title, description, skills, budget, kanbanTaskId?, kanbanBoard?)
- [ ] GET `/api/external-tasks/available` — listar OPEN, filtrar por skills
- [ ] GET `/api/external-tasks/my` — tareas del worker autenticado
- [ ] POST `/api/external-tasks/:id/claim` — OPEN→CLAIMED, setea workerId
- [ ] POST `/api/external-tasks/:id/deliver` — multipart, guarda en sandbox, CLAIMED→DELIVERED
- [ ] POST `/api/external-tasks/:id/approve` — verifica miembro/Ari, DELIVERED→APPROVED
- [ ] POST `/api/external-tasks/:id/reject` — verifica miembro/Ari, DELIVERED→REJECTED
- [ ] Wire en `src/index.ts`

## H3: Bot — Comandos worker

- [ ] Handler `/trabajar` — onboarding: skills, rate, moneda, ubicación
- [ ] Handler `/perfil` — editar perfil worker, opción dejar de trabajar
- [ ] Handler `/tareas` — inline keyboard con ExternalTasks OPEN matching skills
- [ ] Callback handlers: `external_claim:<id>`, `external_deliver:<id>`
- [ ] i18n strings `hilt.*` en `locales/es.json` y `locales/en.json`

## H4: Webhook — ExternalTask → Kanban completion

- [ ] Endpoint `POST /api/hooks/external-task-completed`
- [ ] Body: `{ externalTaskId, status, kanbanTaskId, kanbanBoard }`
- [ ] Si APPROVED: ejecutar `hermes kanban complete <kanbanTaskId>`
- [ ] Si REJECTED: ejecutar `hermes kanban block <kanbanTaskId> "rejected"`
- [ ] Validar API key interna (no requiere auth de usuario)

## H5: Ari orquestador — verificación automática

- [ ] System prompt de Ari (hermesBridge.ts): rol de orquestador Human-in-the-Loop
- [ ] Ari monitorea ExternalTasks DELIVERED, evalúa evidencia automáticamente
- [ ] Ari llama POST approve o POST reject
- [ ] Si duda, escala a miembros del árbol con mensaje en grupo
- [ ] Timeout: 48h sin reclamar → Ari notifica al árbol

## H6: Kanban Dispatcher — perfil human-worker

- [ ] Modificar dispatcher de Kanban (en Hermes Agent) para reconocer perfil `human-worker`
- [ ] En vez de spawn: POST `/api/external-tasks` con `kanbanTaskId` y `kanbanBoard`
- [ ] Marcar tarea Kanban como `running`
- [ ] No spawnear proceso — esperar webhook
- [ ] Correlación: guardar `kanbanTaskId` en ExternalTask

## H7: Integración final + test E2E

- [ ] Notificaciones push a workers cuando nueva ExternalTask matchea sus skills
- [ ] Escrow básico (registro de transacción al aprobar)
- [ ] Test E2E completo:
  - Crear tarea Kanban con assignee=human-worker
  - Dispatcher crea ExternalTask
  - Worker reclama, ejecuta, entrega
  - Ari aprueba automáticamente
  - Webhook completa tarea Kanban
  - Tarea dependiente en pipeline se desbloquea
