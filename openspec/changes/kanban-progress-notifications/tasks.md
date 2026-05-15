# Tareas: Notificaciones de Progreso Kanban

## 1. Watchdog con resumen agregado

- [ ] 1.1 Modificar `kanbanWatchdog.ts` — `notifyProgress()`: agrupa tareas por chat_id, consulta estado de TODAS las tareas del chat, formatea resumen
- [ ] 1.2 Agregar rate limiting: máximo 1 notificación por minuto por chat_id
- [ ] 1.3 Formato del resumen: "📊 Progreso: ✓ X/Y tareas | ● corriendo: T1, T2 | ◻ pendientes: T3 | ⊘ bloqueadas: T4"

## 2. Handler de consulta /status

- [ ] 2.1 `detectNaturalStatusQuery()` en messages.ts — detecta "cómo vas", "cómo va", "cómo vamos", "progreso", "cómo van las tareas", "/status"
- [ ] 2.2 `handleStatusQuery(ctx)` — usa kanbanBridge.getTasksForChat() → execSync("hermes kanban list") → filtrar → formatear → responder
- [ ] 2.3 Auto-claim: al crear tareas Kanban, ejecutar `hermes kanban claim <id>` y guardar mapping en el bridge

## 3. Tests + Verificación

- [ ] 3.1 Test: consulta natural "cómo van las tareas" → respuesta formateada con ✓ ● ◻
- [ ] 3.2 Test: watchdog notifica resumen agregado (no solo tarea individual)
- [ ] 3.3 Test: rate limiting — solo 1 notificación por minuto
- [ ] 3.4 Test: auto-claim al crear tareas Kanban
