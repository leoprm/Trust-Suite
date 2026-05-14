# Plan de Implementación

Cada tarea es independiente y verificable (~2h máx).

## Fase 1: Tasks + Presupuesto (depende de: nada)

- [ ] T1: Schema Task + migración Prisma
- [ ] T2: CRUD endpoints /api/tasks (crear, listar, asignar, cambiar estado)
- [ ] T3: TaskRouter extendido a humanos (skills query + asignación)
- [ ] T4: Comandos del bot: /creatask, /mistasks, /asignartask

## Fase 2: Skills por Trabajo (depende de: Fase 1)

- [ ] T5: Extender User.skills (JSON) + User.totalXp en schema
- [ ] T6: Skill inference al verificar task (keyword → categoría)
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

## Fase 7: Árboles Privados (depende de: nada)

- [ ] T21: Cambiar default admissionPolicy a CLOSED en bot/index.ts (auto-creación)
- [ ] T22: Filtrar handleTreeListQuery: solo OPEN + trees del usuario
- [ ] T23: Comando /invitar @username para agregar miembros a árboles privados

---

**Total**: 23 tareas, 7 fases. Tiempo estimado: 46 horas de trabajo.
