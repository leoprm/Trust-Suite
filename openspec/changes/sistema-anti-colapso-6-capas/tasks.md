# Tareas: Sistema Anti-Colapso

> **Workspace:** `/home/leo/Documentos/TrustMaker/backend/`
> **Asignatario:** `backend-eng`
> **Regla:** Trabaja EXCLUSIVAMENTE en `/home/leo/Documentos/TrustMaker/backend/`. NO uses Trust Suite.

---

## T1: Rate-limit por usuario
- [ ] Crear `src/bot/rateLimiter.ts` con Map en memoria
- [ ] 3 msg/60s → cooldown 5 min
- [ ] Integrar en `index.ts` antes del semáforo typing
- [ ] Mensaje: "⏳ Estás enviando muchos mensajes. Espera 5 minutos."

## T2: Reactivar votación + threshold >20
- [ ] Agregar `voteThreshold` Int @default(20) a Tree en schema.prisma
- [ ] Migración: `npx prisma db push`
- [ ] Reactivar handler `handleKanbanVote` (líneas 1773-1874) — ya existe, verificar que compile
- [ ] Reactivar bloque `kanban_vote:` (líneas 2011-2023) — ya existe, verificar que compile
- [ ] Verificar TreeMember count antes de proponer: si > voteThreshold → forzar votación; si no → directo

## T3: Semáforo typing + cola FIFO
- [ ] Crear `src/bot/messageQueue.ts` con clase MessageQueue
- [ ] Estado idle/typing, cola máx 5
- [ ] Integrar en `hermesBridge.ts`: antes de enviar a Ari, verificar estado
- [ ] Al recibir respuesta de Ari → `dequeue()`
- [ ] Cola llena → "Ari está saturada, intenta en unos minutos"

## T4: Prioridad admin en cola
- [ ] En `messageQueue.ts`, detectar `role === 'ADMIN'` → unshift al frente
- [ ] Admin nunca es rechazado (salta cola llena)
- [ ] Depende de T3

## T5: Anti-DDoS — límite, salida, 3 strikes
- [ ] Agregar a Tree: `maxMembers` Int @default(200), `leaveAttempts` Int @default(0), `blockedUntil` DateTime?
- [ ] Migración
- [ ] Cron cada 10 min: verifica árboles con miembros > maxMembers por >1h
- [ ] Fase 1: `leaveChat()`, standby, leaveAttempts++, notificar admin
- [ ] Fase 2: al recibir invitación, si > maxMembers → rechazar, leaveAttempts++
- [ ] Fase 3: leaveAttempts >= 3 → blockedUntil = now + 3 meses
- [ ] Notificar admin en cada fase

## T6: Modo pausa + /reset
- [ ] Agregar `paused` Boolean @default(false) a Tree
- [ ] Migración
- [ ] `/pause` → solo admin, `paused = true`
- [ ] `/unpause` → solo admin, `paused = false`
- [ ] Mensajes durante pausa: "🔕 Ari está en pausa."
- [ ] `/reset` → limpia cola, idle, solo admin
