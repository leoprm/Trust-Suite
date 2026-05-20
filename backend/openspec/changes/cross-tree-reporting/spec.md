# Cross-Tree Reporting (Bottom-Up)

## Status
**Stage:** Specification  
**Created:** 2026-05-20  
**Author:** Leo + Hermes  

## Summary

Sistema de reportes mensuales/trimestrales generados bottom-up desde las hojas hacia el árbol raíz. Cada árbol produce un informe de su actividad; si tiene subárboles, agrega los informes de sus hijos antes de generar el propio. El resultado final se deposita en el vault del árbol base (raíz) para visibilidad global. La orquestación se apoya en Kanban + perfiles `branch-job`.

## Architecture

### Profiles (Kanban)

| Profile | Role | Dispatcher behavior |
|---|---|---|
| `human-worker` | Tareas para humanos del árbol | Existe. Despacha vía `_dispatch_to_trustmaker()` → POST `/api/external-tasks` en TrustMaker |
| `branch-job` | Tareas para la Ari de un subárbol | **NUEVO.** Mismo mecanismo de dispatch que `human-worker`, pero semántica explícita de "esto va a un agente, no a un humano" |

Ambos perfiles son necesarios y coexisten. El dispatcher debe reconocer `branch-job` igual que `human-worker`.

### Cron Job (por árbol)

Cada árbol que **no es subárbol** (raíz o independiente) tiene un cron mensual:

```
Cron: 0 9 1-7 * 1 (primer lunes de cada mes, 9 AM)
Job: generate-monthly-report
```

**Qué hace el job (flujo completo por árbol):**

**Fase 1 — Recopilar informes de hijos (subárboles):**
1. Verifica `SELECT COUNT(*) FROM Tree WHERE parentId = <self.treeId>`
2. Si hay hijos → crea tareas Kanban `branch-job` para cada hijo inmediato (paralelo, vía `--parent` a la tarea propia)
3. Espera a que todos los hijos completen (dependencias Kanban)
4. Los informes de los hijos se depositan en el vault vía `POST /api/trees/:treeId/vault/report`

**Fase 2 — Recopilar informes de personas (internos):**
5. Verifica `SELECT * FROM TreeMember WHERE treeId = <self.treeId>` — lista de personas en el árbol
6. Revisa el vault: `ls <SANDBOX>/<treeId>/reports/personas/<mes>.md` — ¿quién ya entregó?
7. Para cada persona que **falta** → crea tarea Kanban `human-worker` con notificación a Telegram:
   - Título: `Falta informe mensual de <nombre> para <treeName>`
   - La tarea llega vía `_dispatch_to_trustmaker()` → notifica al humano por Telegram
   - El humano entrega su informe (mecanismo a definir: ¿responder al bot? ¿formulario?)
8. Espera a que todos los `human-worker` completen

**Plazo de 24 horas para human-worker:**
Cada tarea `human-worker` tiene un deadline de 24h desde su creación. Si el humano no completa su informe en ese plazo:
- La Ari cancela la tarea (o la completa con `metadata: {status: "missed"}`)
- En el informe unificado, esa persona aparece como **"Fulanito: informe no entregado"**
- La Ari NO espera indefinidamente — tras 24h, sigue con los informes que tenga

**Fase 3 — Agregación (Ari):**
9. Con TODOS los informes reunidos (hijos + personas internas) en el vault, Ari genera el informe unificado
10. El informe se guarda en `<SANDBOX>/<treeId>/reports/<mes>.md` (carpeta específica, lista para Kanban)

**Fase 4 — Entrega hacia arriba:**
11. Completa la tarea Kanban (`kanban_complete`)
12. Si tiene padre → la dependencia Kanban automáticamente desbloquea la tarea del padre (el padre ve que este hijo ya terminó)
13. Si NO tiene padre (raíz) → no gatilla nada más. El informe final queda en su vault.

**Subárboles:** Al crearse un árbol y marcarse como subárbol (`parentId != null`):
- El cron se **desactiva** (no se elimina)
- La tarea `generate-report` queda como plantilla latente
- Solo se ejecuta cuando el padre la gatilla vía `branch-job`

### Flujo Bottom-Up (por capas)

```
Capa 0 (raíz):    [Raíz]          ← cron dispara, crea branch-jobs para hijos
Capa 1:          [Hijo A] [Hijo B] ← reciben branch-job, verifican si tienen hijos
Capa 2:       [Nieto A1] [Nieto A2] ← hojas: generan informe, publican en vault del padre
Capa 1:       [Hijo A] [Hijo B]    ← agregan informes de hijos, publican en vault del padre
Capa 0:    [Raíz]                  ← agrega todo, informe final en vault propio
```

Kanban maneja la secuencialidad por capas vía dependencias `--parent`. Las hojas se ejecutan primero (sin dependencias), los padres esperan.

### Publicación de Informes (endpoint)

**Nuevo endpoint:** `POST /api/trees/:treeId/vault/report`

```json
{
  "treeId": "<id del árbol que publica>",
  "reportDate": "2026-05",
  "content": "markdown del informe",
  "childrenReports": ["<id1>", "<id2>"]  // opcional, IDs de informes hijos ya en el vault
}
```

**Reglas de sandbox:**
- La Ari del hijo **no puede** escribir directamente en el sandbox del padre
- Usa el endpoint para que el backend deposite el archivo en `<SANDBOX_BASE>/<parentTreeId>/reports/`
- Esto mantiene el aislamiento: el hijo no accede al filesystem del padre, solo invoca un endpoint controlado

### Control desde Telegram

El admin del árbol puede gatillar reportes manualmente:

```
/informe              → pide informe a todos los hijos inmediatos (default)
/informe <treeId>    → pide informe a un hijo específico
/informe todas       → pide informe a todos los hijos inmediatos
```

**Restricciones:**
- Solo admins del árbol pueden usar estos comandos
- **No** se puede pedir informe al padre (solo hacia abajo)
- El comando crea tareas `branch-job` en Kanban para los hijos solicitados

## Tasks

### XR-1: Perfil `branch-job` en dispatcher Kanban
**Archivo:** `hermes_cli/kanban_db.py` (~línea 3982-4007)
- Agregar reconocimiento de `assignee="branch-job"` junto a `human-worker`
- Mismo dispatch: `_dispatch_to_trustmaker()` → POST `/api/external-tasks`
- Sin cambios en TrustMaker (el endpoint ya existe)

### XR-2: Cron job `generate-monthly-report`
**Archivo:** skill o job definition en Hermes
- Crear el cron job template que verifica hijos → crea branch-jobs → agrega → publica
- El cron se crea al crear un árbol (no subárbol)
- Al crear un subárbol, el cron se desactiva (pero se conserva)

### XR-3: Endpoint `POST /api/trees/:treeId/vault/report`
**Archivo:** `src/controllers/` (nuevo o extender sandboxController)
- Recibe JSON con treeId, reportDate, content, childrenReports
- Deposita el archivo en `<SANDBOX_BASE>/<parentTreeId>/reports/<date>.md`
- Validar que el árbol que publica ES hijo del árbol destino

### XR-4: Comandos Telegram `/informe`
**Archivo:** `src/bot/` (handler de comandos)
- `/informe` → branch-jobs para todos los hijos
- `/informe <treeId>` → branch-job para un hijo específico
- Solo admins, solo hacia abajo (no al padre)
- Validar que el treeId es hijo del árbol del admin

### XR-5: Lógica de agregación en el job
**Archivo:** skill del cron job
- Leer informes del vault propio
- Generar markdown agregado
- Publicar hacia arriba si tiene padre

## Dependencies

```
XR-1 (branch-job profile) → required by XR-2, XR-4
XR-3 (endpoint) → required by XR-2
XR-2 (cron job) → depends on XR-1, XR-3
XR-4 (telegram) → depends on XR-1
XR-5 (aggregation) → depends on XR-2, XR-3
```

## Open Questions

- ¿Formato del informe? ¿Markdown con secciones estándar (tareas completadas, decisiones, tiempo)?
- ¿El informe incluye métricas cuantitativas o solo narrativa?
- ¿Frecuencia configurable por árbol? (mensual vs trimestral)
- ¿Notificación al admin cuando el informe global está listo?
