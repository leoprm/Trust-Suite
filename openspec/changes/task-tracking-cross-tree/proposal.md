# Task Tracking Cross-Tree — Propuesta

## Why

El árbol padre necesita visibilidad y capacidad de acción sobre los comentarios y necesidades que surgen en sus subárboles. Hoy no hay un mecanismo para convertir comentarios del grupo en tareas accionables con tracking y accountability. Esto genera pérdida de oportunidades y falta de seguimiento.

## What Changes

- **BREAKING**: Ninguno. Feature nueva, sin cambios a APIs existentes.
- Ari del árbol padre escribe comentarios del grupo en `obsidian/comentarios.md` con timestamp, autor y contenido.
- Ari revisa periódicamente (cada 3h) los comentarios y los clasifica en: accionables por IA vs requieren humano.
- Las tareas accionables se crean como tareas Kanban usando los perfiles `backend-eng` (IA) o `human-worker` (humano).
- Las tareas humanas se convierten en ExternalTask en TrustMaker, visibles para los miembros del árbol.
- Pipeline de fases: factibilidad → desarrollo, con preferencia al mismo humano en fase 2.
- Ari notifica al grupo la lista de tareas creadas y su estado.

## Capabilities

1. **comment-logging**: Ari registra comentarios del grupo en vault del padre
2. **task-classification**: Ari clasifica comentarios en IA vs humano
3. **kanban-creation**: Ari crea tareas Kanban desde comentarios clasificados
4. **human-task-flow**: Tareas human-worker → ExternalTask en TrustMaker
5. **phase-pipeline**: Factibilidad → Desarrollo con preferencia de asignación
6. **periodic-review**: Revisión cada 3h + notificación al grupo

## Impact

- **hermesBridge.ts**: Nuevas instrucciones para Ari (revisión, clasificación, creación Kanban)
- **Cron**: Job cada 3h que gatilla la revisión de comentarios
- **Kanban**: Nuevo uso del perfil `human-worker` para tareas cross-tree
- **Vault**: Archivo `obsidian/comentarios.md` en vault del padre
