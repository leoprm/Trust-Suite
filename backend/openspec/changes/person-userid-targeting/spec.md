# person:<userId> — Targeted Human Task Assignment

> **Status:** draft → kanban
> **Created:** 2026-05-20
> **Repo:** TrustMaker backend + Hermes Agent dispatcher

## Goal

Permitir que el perfil Kanban `person` acepte un sufijo `:<userId>` para asignar tareas a individuos específicos dentro de un árbol, en vez de publicarlas como tareas abiertas.

## Motivation

Actualmente `person` (antes `human-worker`) publica tareas como `ExternalTask` con `workerId = null` — cualquier miembro del árbol puede tomarlas. Con `person:<userId>`, la tarea se asigna DIRECTAMENTE a una persona concreta:

- Permite evaluar desempeño individual
- Especializa el uso del Kanban (distintas personas para distintos tipos de tareas)
- Habilita reportes mensuales targeteados a individuos específicos
- Sin sufijo (`person` a secas) mantiene el comportamiento actual: tarea abierta

## Architecture

```
Kanban task: assignee = "person:123456789"
     │
     ▼
Dispatcher (kanban_db.py)
  - Detecta "person" en el assignee
  - Parsear sufijo ":<userId>" → extrae userId
  - POST /api/external-tasks con "assignedUserId" en el payload
     │
     ▼
TrustMaker (externalTaskController.ts)
  - Recibe assignedUserId en el body
  - Valida que el userId sea miembro del árbol
  - Crea ExternalTask con workerId = assignedUserId
  - Notifica por DM a la persona asignada
```

## Spec

### Dispatcher (`hermes_cli/kanban_db.py`)

- En `_dispatch_to_trustmaker()`, antes de construir el payload, parsear `task.assignee`:
  - Si es `"person"` (sin sufijo) → `assignedUserId = null` (comportamiento actual)
  - Si es `"person:<userId>"` → extraer `userId`, `assignedUserId = userId`
- Agregar `"assignedUserId"` al payload JSON

### TrustMaker (`externalTaskController.ts`)

- Recibir `assignedUserId` del body (opcional, string | null)
- Si `assignedUserId` está presente:
  - Validar que el usuario existe en el árbol (`treeMember` con status ACTIVE)
  - Si no es miembro → 400 error
- Setear `workerId = assignedUserId` al crear el ExternalTask
- Notificar al usuario asignado por DM (usando el sistema de notificaciones existente)

### Comportamiento sin sufijo

`person` (sin `:<userId>`) mantiene comportamiento actual: `workerId = null`, tarea abierta para cualquier miembro.

## Tasks

### HW-1: Dispatcher parsea `person:<userId>`
**Files:** `hermes_cli/kanban_db.py`
- Parsear `task.assignee` para detectar sufijo `:<userId>`
- Extraer userId y pasarlo como `assignedUserId` en el payload
- Sin sufijo → `assignedUserId = null`

### HW-2: TrustMaker recibe y asigna `assignedUserId`
**Files:** `src/controllers/externalTaskController.ts`
- Recibir `assignedUserId` del body
- Validar membresía del usuario en el árbol
- Setear `workerId` al crear ExternalTask

### HW-3: Notificación DM a la persona asignada
**Files:** `src/controllers/externalTaskController.ts`
- Cuando `workerId` se setea en creación, notificar por DM al usuario
- Usar el sistema de notificaciones existente (`notifyWorkers`)
- Incluir título, descripción, y presupuesto de la tarea
