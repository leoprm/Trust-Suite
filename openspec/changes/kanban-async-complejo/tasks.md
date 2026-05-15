# Tareas: Kanban Async para Consultas Complejas

## 1. Detector de Complejidad

- [ ] 1.1 Crear `complexityDetector.ts` — heurísticas (ssh, instalar, >300 chars)
- [ ] 1.2 Integrar en `messages.ts` — ruteo: simple→concierge, complejo→kanban

## 2. Kanban Bridge

- [ ] 2.1 Crear `kanbanBridge.ts` — `createKanbanTask(message, treeId, chatId)` vía child_process.exec
- [ ] 2.2 Parsear task ID del stdout de `hermes kanban create`
- [ ] 2.3 Fallback a concierge si falla la creación

## 3. Watchdog de Progreso

- [ ] 3.1 Agregar tabla `BotKanbanTask` al schema (id, kanbanTaskId, chatId, status, lastNotifiedAt)
- [ ] 3.2 Crear cron job cada 2:30 min que itera tareas activas
- [ ] 3.3 Notificar cambio de estado (running→"sigue trabajando", blocked→"bloqueada: razón")
- [ ] 3.4 Auto-limpiar cuando la tarea llega a done/archived

## 4. Notificación de Completado

- [ ] 4.1 Al detectar done, enviar mensaje final con resultado
- [ ] 4.2 Incluir tiempo total transcurrido en la notificación final

## 5. Integración y Test

- [ ] 5.1 Integrar el flujo completo en `messages.ts` + `index.ts`
- [ ] 5.2 Test: consulta simple → respuesta en línea
- [ ] 5.3 Test: consulta compleja → tarea Kanban + watchdog + notificación final
