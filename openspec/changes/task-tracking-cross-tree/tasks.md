# Task Tracking Cross-Tree — Tareas

## 1. System Prompt — Ari como orquestador de tareas

- [ ] 1.1 Añadir sección "ORQUESTACIÓN DE TAREAS" en hermesBridge.ts
- [ ] 1.2 Instrucciones para registrar comentarios en `obsidian/comentarios.md`
- [ ] 1.3 Instrucciones para clasificar comentarios (IA vs humano)
- [ ] 1.4 Instrucciones para crear tareas Kanban vía `hermes kanban create`
- [ ] 1.5 Formato de notificación al grupo con lista de tareas creadas

## 2. Comentarios — Archivo y logging

- [ ] 2.1 Formato del archivo `obsidian/comentarios.md` (timestamp, autor, contenido, estado)
- [ ] 2.2 Lazy-init: crear `obsidian/comentarios.md` si no existe
- [ ] 2.3 Ari del padre escribe entradas al detectar mensajes accionables

## 3. Pipeline de fases — Factibilidad → Desarrollo

- [ ] 3.1 Ari crea DOS tareas Kanban secuenciales para tareas humanas
- [ ] 3.2 Fase 1: "Factibilidad: <título>" con --assignee human-worker
- [ ] 3.3 Fase 2: "Desarrollo: <título>" con --parent <id-fase-1> y preferencia mismo humano
- [ ] 3.4 Notificación de preferencia al grupo ("@usuario tiene prioridad")

## 4. Revisión periódica cada 3 horas

- [ ] 4.1 Cron job que despierte a Ari cada 3 horas (09:00-21:00)
- [ ] 4.2 Ari revisa `obsidian/comentarios.md` buscando entradas sin procesar
- [ ] 4.3 Clasifica y crea tareas para entradas nuevas
- [ ] 4.4 Notifica al grupo: "📋 Tareas creadas: ... | Tareas pendientes: ..."
- [ ] 4.5 Silencio si no hay comentarios nuevos

## 5. Integración y tests

- [ ] 5.1 Verificar que human-worker funciona con ExternalTask en TrustMaker
- [ ] 5.2 Test E2E: comentario → clasificación → tarea Kanban → notificación
- [ ] 5.3 Test pipeline factibilidad → desarrollo con mismo usuario
