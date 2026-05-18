# Human-in-the-Loop Kanban Bridge — Diseño Técnico v2

## Arquitectura

```
┌─────────────────────────────────────────────┐
│              Kanban Dispatcher              │
│                                             │
│  task.assignee === "human-worker"           │
│    → NO spawn process                       │
│    → POST /api/external-tasks (create)      │
│    → task status = "running"                │
│    → guarda correlation: task.id ↔ ext.id   │
│                                             │
│  Espera webhook:                            │
│    POST /api/hooks/external-task-completed  │
│    → mark Kanban task "done"                │
│    → pipeline avanza                        │
└─────────────────────────────────────────────┘
         │                          ▲
         ▼                          │
┌─────────────────┐    ┌──────────────────────┐
│  ExternalTask    │    │  Ari (orquestador)   │
│  (TrustMaker)    │    │                      │
│                  │    │  Monitorea entregas  │
│  OPEN            │    │  Verifica evidencia  │
│  → CLAIMED       │    │  Auto-approve/reject │
│  → DELIVERED     │    │  → llama webhook     │
│  → APPROVED      │────│                      │
└─────────────────┘    └──────────────────────┘
```

## Schema

### User (campos nuevos)
```prisma
availableForHire Boolean  @default(false)
hourlyRate       Int?
currency         String?  @default("CLP")
location         String?
telegramUsername String?  // para notificaciones
```

### ExternalTask (modelo nuevo)
```prisma
model ExternalTask {
  id              String   @id @default(uuid())
  kanbanTaskId    String?  // correlación con tarea Kanban
  kanbanBoard     String?  // slug del board de Kanban
  treeId          String
  createdBy       String   // userId o "ari"
  title           String
  description     String   @db.Text
  skills          String   // JSON array
  budget          Int      // centavos
  currency        String   @default("CLP")
  workerId        String?
  status          ExternalTaskStatus @default(OPEN)
  deliverableUrl  String?
  approvedBy      String?  // userId que aprobó (o "ari")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum ExternalTaskStatus {
  OPEN
  CLAIMED
  DELIVERED
  APPROVED
  REJECTED
}
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/external-tasks` | Crear (desde Kanban o bot) |
| GET | `/api/external-tasks/available` | Listar OPEN para workers |
| GET | `/api/external-tasks/my` | Mis tareas reclamadas |
| POST | `/api/external-tasks/:id/claim` | Reclamar |
| POST | `/api/external-tasks/:id/deliver` | Entregar evidencia (multipart) |
| POST | `/api/external-tasks/:id/approve` | Aprobar (miembro o Ari) |
| POST | `/api/external-tasks/:id/reject` | Rechazar |
| POST | `/api/hooks/external-task-completed` | Webhook: aprueba → completa tarea Kanban |

## Kanban Bridge (Hermes Agent → dispatcher)

El dispatcher de Kanban (en Hermes Agent) debe reconocer el perfil `human-worker`:

```python
# Lógica del dispatcher (pseudocódigo)
if task.assignee == "human-worker":
    # Crear ExternalTask en TrustMaker
    ext_task = POST /api/external-tasks {
        kanbanTaskId: task.id,
        kanbanBoard: board_slug,
        treeId: task.tree_id,  # del metadata de la tarea
        title: task.title,
        description: task.body,
        skills: task.skills,
        budget: task.budget
    }
    task.status = "running"  # Kanban
    # NO spawn process — esperar webhook
```

La tarea Kanban queda en `running` hasta que el webhook la marca `done`.

## Ari orquestador

Ari monitorea ExternalTasks en estado DELIVERED y decide:

```
DELIVERED → evalúa evidencia
  ├── OK → POST approve → webhook → Kanban done
  └── NO → POST reject + feedback → worker corrige
```

Reglas:
- Solo Ari puede auto-approve (no miembros)
- Si hay duda, escala a miembros del árbol
- Timeout: 48h sin reclamar → notificar al árbol

## Bot commands

| Comando | Descripción |
|---------|-------------|
| `/trabajar` | Onboarding worker: skills, rate, moneda, ubicación |
| `/perfil` | Editar perfil worker |
| `/tareas` | Lista de ExternalTasks OPEN matching skills |
| Callbacks | claim, deliver, approve, reject inline |

## Webhook → Kanban

```typescript
POST /api/hooks/external-task-completed
Body: { externalTaskId, status: APPROVED|REJECTED, kanbanTaskId, kanbanBoard }

→ Si APPROVED: hermes kanban complete <kanbanTaskId>
→ Si REJECTED: hermes kanban block <kanbanTaskId> "Rechazado por Ari/miembros"
```
