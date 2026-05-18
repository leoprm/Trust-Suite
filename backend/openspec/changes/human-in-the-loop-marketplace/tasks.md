# Human-in-the-Loop — Tasks

## H1: Schema + Migración

- [ ] Agregar campos `availableForHire`, `hourlyRate`, `currency`, `location` al modelo User en Prisma
- [ ] Crear modelo `ExternalTask` + enum `ExternalTaskStatus`
- [ ] Ejecutar migración (`npx prisma db push`)
- [ ] Verificar columnas en MySQL

## H2: CRUD Endpoints

- [ ] POST `/api/external-tasks` — crear tarea (valida treeId, budget, skills)
- [ ] GET `/api/external-tasks/available` — listar OPEN, filtrar por skills del worker
- [ ] GET `/api/external-tasks/my` — tareas reclamadas por el worker
- [ ] POST `/api/external-tasks/:id/claim` — reclamar (cambia status a CLAIMED)
- [ ] POST `/api/external-tasks/:id/deliver` — entregar evidencia (multipart, guarda en sandbox)
- [ ] POST `/api/external-tasks/:id/approve` — aprobar (verifica miembro del árbol)
- [ ] POST `/api/external-tasks/:id/reject` — rechazar

## H3: Bot — Comandos worker

- [ ] Handler `/trabajar` — onboarding de worker (skills, rate, ubicación, moneda)
- [ ] Handler `/perfil` — editar perfil de worker
- [ ] Handler `/tareas` — inline keyboard con tareas OPEN matcheadas por skills
- [ ] i18n strings `hilt.*` en `locales/es.json` y `locales/en.json`

## H4: Bot — Notificaciones + flujo

- [ ] Notificación push a workers cuando nueva tarea matchea sus skills
- [ ] Callback handlers para claim/deliver desde inline keyboard
- [ ] Callback handlers para approve/reject (miembros del árbol)
- [ ] Integrar escrow básico: budget reservado al crear, liberado al aprobar

## H5: Ari → TrustManager bridge

- [ ] System prompt de Ari: instrucción para detectar tareas externalizables
- [ ] Endpoint interno `POST /api/external-tasks/recommend` (Ari sugiere, TrustManager publica)
- [ ] TrustManager recibe recomendación y publica al marketplace
- [ ] Test end-to-end: Ari detecta → recomienda → TrustManager publica → worker reclama → aprueban
