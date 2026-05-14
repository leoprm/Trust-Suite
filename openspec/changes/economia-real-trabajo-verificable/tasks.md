# Plan de Implementación

Cada tarea es independiente y verificable (~2h máx).

## Fase 1: Tasks + Presupuesto (depende de: nada)

- [ ] T1: Schema Task + migración Prisma
- [ ] T2: CRUD endpoints /api/tasks (crear, listar, asignar, cambiar estado)
- [ ] T3: TaskRouter extendido a humanos (skills query + asignación)
- [ ] T4: Crear task vía conversación natural con @TrustMakerBot (lenguaje natural, no comandos rígidos)

## Fase 2: Skills por Trabajo (depende de: Fase 1)

- [ ] T5: Extender User.skills (JSON) + User.totalXp en schema
- [ ] T6: Al verificar task, matchear con skills existentes del usuario. Si calza → XP a esa skill. Si no → crear nueva skill. Evitar listas interminables.
- [ ] T7: XP assignment (10-50 XP según complejidad)
- [ ] T8: GET /api/users/:id/skills + /api/users/:id/xp

## Fase 3: Evidencias (depende de: Fase 1)

- [ ] T9: Endpoint POST /api/tasks/:id/evidence (multipart, guardar archivo)
- [ ] T10: Bot acepta fotos/documentos en Telegram y las reenvía al endpoint
- [ ] T11: GET /api/tasks/:id/evidence — descargar evidencia

## Fase 4: Disputas (depende de: Fase 3)

- [ ] T12: Endpoint POST /api/tasks/:id/dispute + schema fields
- [ ] T13: Votación de disputa en grupo de Telegram (24h, quórum 30%)
- [ ] T14: Resolución automática al cumplirse plazo

## Fase 5: Cuota Mensual (depende de: Fase 1)

- [ ] T15: Campo TreeMember.monthlyFee + paymentStatus en schema
- [ ] T16: Cron job día 1 del mes: calcular y persistir cuota
- [ ] T17: Notificación de cuota vía bot (DM o grupo)

## Fase 6: Gate de Pago (depende de: Fase 5)

- [ ] T18: Middleware de pago en bot/index.ts (GRACE → DELINQUENT → BLOCKED)
- [ ] T19: Comando /pagar — genera link de pago Paddle/Stripe
- [ ] T20: Webhook de pago → actualizar paymentStatus a ACTIVE

> **Fase 7 (Árboles Privados) ya está en progreso → t_18294caf**

---

**Total**: 20 tareas, 6 fases. ~40 horas de trabajo.
