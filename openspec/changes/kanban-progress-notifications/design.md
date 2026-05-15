# Diseño: Notificaciones de Progreso Kanban

## Arquitectura

```
┌──────────────────────────────────────────────┐
│  Usuario pregunta "¿cómo van las tareas?"     │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│  messages.ts — detectNaturalStatusQuery()    │
│  Detecta: "cómo vas", "cómo va", "progreso",  │
│  "cómo vamos", "/status"                     │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│  kanbanBridge.ts — getTasksForChat(chatId)    │
│  Busca en el mapping qué task_ids pertenecen  │
│  a este chat (creados desde este chat)        │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│  execSync("hermes kanban list") → filtrar     │
│  Formatear: ✓ ● ◻ ⊘ con nombres cortos       │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│  Responder al usuario con resumen             │
└──────────────────────────────────────────────┘
```

## Watchdog mejorado

```
cron cada 2:30 min
  ▼
checkAllActiveTasks()
  ▼
¿Hubo cambios de estado?
  ├─ NO  → skip
  └─ SÍ  → agrupar por chat_id
           ▼
           Para cada chat con cambios:
           ┌─────────────────────────────────┐
           │  tasks = getTasksForChat(chatId) │
           │  statuses = hermes kanban list   │
           │  filtrar solo tasks del chat     │
           │  formatear resumen agregado      │
           │  enviar a Telegram               │
           └─────────────────────────────────┘
```

## Rate limiting

```ts
const lastNotification = new Map<number, number>(); // chatId → timestamp
if (Date.now() - (lastNotification.get(chatId) || 0) < 60_000) return; // skip
```

## Archivos modificados

- `backend/src/bot/kanbanWatchdog.ts` — checkAllActiveTasks() mejorado con agregación + rate limit
- `backend/src/bot/messages.ts` — detectNaturalStatusQuery() + handler
- `backend/src/bot/kanbanBridge.ts` — getTasksForChat(chatId)
- `backend/src/bot/types.ts` — ChatTaskMapping type si no existe
