# Especificación: Defensa Anti-Colapso

## Capa 1: Rate-limit por usuario
- `Map<userId, {count, windowStart, cooldownUntil}>` en `src/bot/rateLimiter.ts`
- 3 mensajes permitidos por ventana de 60s
- Excedido → cooldown 5 min, mensaje "⏳ Estás enviando muchos mensajes. Espera 5 minutos."
- El rate-limit se aplica ANTES de llegar al semáforo typing

## Capa 2: Votación grupal
- Reactivar `handleKanbanVote` existente (líneas 1773-1874 de index.ts)
- Reactivar bloque `kanban_vote:` en callback_query unificado (líneas 2011-2023)
- Nuevo campo: `Tree.voteThreshold` (int, default 20)
- Si `treeMemberCount > voteThreshold` → las propuestas requieren votación
- Si `<= voteThreshold` → ejecución directa (comportamiento actual)

## Capa 3: Semáforo typing + cola
- `src/bot/messageQueue.ts`: clase `MessageQueue`
- Estado: `idle | typing`
- Cola FIFO, máximo 5 mensajes
- `enqueue(msg)` → si idle, procesa directo; si typing, encola
- `dequeue()` → llamado cuando Ari termina de responder
- Cola llena → mensaje "Ari está saturada, intenta en unos minutos"

## Capa 4: Prioridad admin
- En `MessageQueue.enqueue()`, si `msg.from.role === 'ADMIN'` → `unshift` al frente
- Admin NUNCA es rechazado (salta aunque la cola esté llena)

## Capa 5: Anti-DDoS
- Nuevo campo: `Tree.maxMembers` (int, default 200)
- Nuevo campo: `Tree.leaveAttempts` (int, default 0)
- Nuevo campo: `Tree.blockedUntil` (DateTime?)
- Fase 1: miembros > maxMembers por >1h → `bot.telegram.leaveChat(groupId)`, árbol → `standby`, `leaveAttempts++`
- Fase 2: Re-invitan, sigue > maxMembers → rechaza, `leaveAttempts++`
- Fase 3: `leaveAttempts >= 3` → `blockedUntil = now + 3 months`. Cualquier intento de invitar resulta en salida inmediata.
- Notificación al admin en cada fase

## Capa 6: Modo pausa + /reset
- Nuevo campo: `Tree.paused` (bool, default false)
- `/pause` → `paused = true`, mensajes entrantes reciben "🔕 Ari está en pausa."
- `/unpause` → `paused = false`
- `/reset` → limpia cola, estado a idle
- Solo admin puede usar estos comandos
