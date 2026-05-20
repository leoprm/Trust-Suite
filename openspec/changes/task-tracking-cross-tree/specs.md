# Task Tracking Cross-Tree — Especificaciones

## Capability: comment-logging

### Requirement: Ari registra comentarios en vault
Ari del árbol padre SHALL registrar mensajes del grupo que contengan decisiones, ideas o requests en `obsidian/comentarios.md`.

#### Scenario: Comentario con request explícito
- **WHEN** un miembro del grupo escribe un mensaje que contiene una solicitud o idea accionable
- **THEN** Ari agrega una entrada en `obsidian/comentarios.md` con: timestamp ISO8601, autor (@username), contenido del mensaje

#### Scenario: Mensaje no accionable
- **WHEN** un miembro escribe un saludo o mensaje social no accionable
- **THEN** Ari NO agrega entrada en comentarios.md

---

## Capability: task-classification

### Requirement: Ari clasifica comentarios
Ari SHALL clasificar cada comentario nuevo como `ia` (ejecutable por agente IA), `humano` (requiere persona), o `ignorar` (no accionable).

#### Scenario: Tarea técnica simple
- **WHEN** el comentario es "necesito un script que calcule X"
- **THEN** Ari clasifica como `ia` y asigna backend-eng

#### Scenario: Tarea que requiere juicio humano
- **WHEN** el comentario es "hay que decidir la estrategia de pricing para Q3"
- **THEN** Ari clasifica como `humano` y asigna human-worker

---

## Capability: kanban-creation

### Requirement: Ari crea tareas Kanban
Ari SHALL crear tareas Kanban usando la CLI `hermes kanban create` con el perfil adecuado.

#### Scenario: Tarea IA simple
- **WHEN** Ari clasifica un comentario como `ia`
- **THEN** crea tarea Kanban con `--assignee backend-eng --workspace dir:/home/leo/Documentos/TrustMaker/backend`

#### Scenario: Tarea humana con fases
- **WHEN** Ari clasifica un comentario como `humano`
- **THEN** crea DOS tareas Kanban secuenciales: factibilidad → desarrollo, con `--assignee human-worker`

---

## Capability: human-task-flow

### Requirement: ExternalTask para humanos
Las tareas human-worker SHALL convertirse en ExternalTask en TrustMaker vía el dispatcher nativo de Kanban.

#### Scenario: Humano toma tarea de factibilidad
- **WHEN** un miembro reclama el ExternalTask
- **THEN** su nombre aparece como asignado en el Kanban y en la notificación al grupo

---

## Capability: phase-pipeline

### Requirement: Pipeline factibilidad → desarrollo
La fase de desarrollo SHALL tener preferencia para la misma persona que hizo factibilidad.

#### Scenario: Misma persona continúa
- **WHEN** la fase de factibilidad se completa como "factible"
- **THEN** la fase de desarrollo se asigna automáticamente a la misma persona

#### Scenario: Persona no disponible
- **WHEN** la fase de desarrollo no es tomada en 24h por la persona original
- **THEN** cualquier otro miembro puede tomarla

---

## Capability: periodic-review

### Requirement: Revisión cada 3 horas
Ari SHALL revisar `obsidian/comentarios.md` cada 3 horas y notificar al grupo las tareas creadas o pendientes.

#### Scenario: Nuevos comentarios detectados
- **WHEN** hay comentarios nuevos desde la última revisión
- **THEN** Ari los clasifica, crea tareas, y notifica al grupo con la lista

#### Scenario: Sin comentarios nuevos
- **WHEN** no hay comentarios nuevos
- **THEN** Ari no notifica (silencio)
