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
Cron: 0 9 1 * * (día 1 de cada mes, 9 AM)
Job: generate-monthly-report
```

**Qué hace el job:**
1. Verifica `SELECT COUNT(*) FROM Tree WHERE parentId = <self.treeId>`
2. Si hay hijos → crea tareas Kanban `branch-job` para cada hijo inmediato (paralelo, vía `--parent` a la tarea propia)
3. Espera a que todos los hijos completen (dependencias Kanban)
4. Lee los informes del vault propio (depositados por los hijos)
5. Genera informe propio agregando los de los hijos
6. Si tiene padre → publica el informe en el vault del padre vía `POST /api/trees/:parentId/vault/report`
7. Si es raíz → el informe final queda en su propio vault

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
