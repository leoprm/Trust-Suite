# Audit Trust Suite → Trust Lite v2: Core Governance

> **Auditor:** analyst (kanban task t_2fe7e7ba)  
> **Fecha:** 2026-05-12  
> **Alcance:** backend/src/ ~5,300 LOC en dominio Core Governance  
> **Referencias:** TRUST-DNA.md, career-path-network.md, schema.prisma, controllers + services + utils + routes

---

## Tabla de decisiones

| # | Feature | Decisión | Justificación |
|---|---------|----------|---------------|
| 1 | **Trees** (CRUD, members, invites, admissionPolicy, visibility) | **QUEDA** | El modelo de Tree como workspace personal/equipo con miembros, invites y visibilidad es directamente reutilizable. Se elimina AI_COUNCIL (modo especial que fuerza PUBLIC + INVITE_ONLY + NO_ECONOMY) y campos geo-territoriales (country, city, latitude, longitude) que v2 no necesita. |
| 2 | **Needs → Ideas → Branches → Tasks** (pipeline gobernanza) | **SIMPLIFICAR** | Necesidad base y Tasks se rescatan. Ideas y el pipeline de votación comunitaria (BranchNeedVote, consensusEngine) se archivan. Trust Lite v2 no tiene gobernanza democrática — el admin crea ramas hashtag directamente. Las Needs se simplifican a: título, descripción, puntos asignados, status básico (ACTIVE→IN_PROGRESS→RESOLVED). Se eliminan: Ideas, quorum, relevance thresholds, base need sedimentation, importance voting. |
| 3 | **Ramas hashtag** (creación directa por admin) | **QUEDA** | Es la forma nativa de organizar IAs por especialidad en v2. `POST /api/branches/hashtag` con `#nombre`, `isHashtag: true`, `type: HASHTAG`. Simple, directo, sin burocracia. El admin crea `#backend`, `#frontend`, `#design` y las IAs trabajan dentro de ellas. |
| 4 | **Branches normales** (vía votación) | **ELIMINAR** | Las branches tradicionales requieren: Need → Idea → votación comunitaria (BranchNeedVote) → quorum → creación. Tienen 6 fases (INVESTIGATION→RECYCLING), valorOficial por consenso, timeout de quorum. Trust Lite v2 solo usa ramas hashtag — no hay votación comunitaria ni fases. Se eliminan: consensusEngine.ts, BranchNeedVote, BranchMember.phases, PhaseDeliverable, todo el sistema de fases. |
| 5 | **Tasks + asignación** | **QUEDA (simplificado)** | Tasks son el núcleo de trabajo de IAs. Se conserva: crear task en rama hashtag, status (OPEN/IN_PROGRESS/COMPLETED), asignación, evidencia, XP por completar. Se elimina: difficulty voting (DifficultyVote, IQR outliers, social rescue rule), auditoría cívica probabilística (20%), golden tickets, elite check, deadline/requiredHours, anonymous tasks, voting requerido. |
| 6 | **Motor económico** (1000 pts, distribución por nivel) | **QUEDA** | Motor intacto para v2: presupuesto 1000 puntos fijos, distribución proporcional por `valorOficial × (nivelCreador / 10)`. `monthlyNeedPointsService.ts` (renewAllNeedPoints con 1000 pts/mes) se conserva. `economicEngine.ts` (redistributeTreeBudget + calculateXpFromDifficulty) se conserva con ajustes menores. |
| 7 | **Financing modes** (GRATUITO/FIJA/VARIABLE) | **SIMPLIFICAR** | TreeFinancingMode GRATUITO se conserva. SUBSCRIPCION con billingMode FIXED se conserva para el modelo de suscripción simple de v2. Se archiva: billing proporcional (PROPORTIONAL), cron de facturación mensual, subscriptionService completo (grace periods, suspensiones), subscriptionController, MemberPayment tracking. Las suscripciones en v2 son: árbol gratuito o árbol con monto fijo mensual. |

---

## Resumen: ¿qué % del código actual se rescata?

### Contabilización por archivo

| Archivo | LOC | Rescatado | % | Notas |
|---------|-----|-----------|----|-------|
| `controllers/treeController.ts` | 1,262 | ~750 | 60% | CRUD árbol + miembros + invites. Fuera: AI_COUNCIL, geo, crisis, relaciones |
| `controllers/branchController.ts` | 583 | ~200 | 35% | Solo hashtag CRUD. Fuera: fases, votación, berries injection |
| `controllers/needController.ts` | 449 | ~180 | 40% | CRUD necesidad simplificado. Fuera: pipeline Ideas, thresholds, hashtag proposals |
| `controllers/taskController.ts` | 1,275 | ~500 | 40% | Crear/asignar/completar. Fuera: difficulty votes, civic audit, golden tickets, elite |
| `controllers/financingController.ts` | 346 | ~120 | 35% | Solo GRATUITO + SUBSCRIPCION_FIXED |
| `controllers/subscriptionController.ts` | 242 | 0 | 0% | Se archiva completo |
| `services/monthlyNeedPointsService.ts` | 76 | ~68 | 90% | Casi intacto |
| `services/baseNeedService.ts` | 273 | ~80 | 30% | Solo liberación de puntos |
| `services/subscriptionService.ts` | 257 | 0 | 0% | Se archiva completo |
| `utils/economicEngine.ts` | 192 | ~154 | 80% | Intacto con ajustes menores |
| `utils/consensusEngine.ts` | 85 | 0 | 0% | Eliminado (sin votación normal) |
| Routes (4 archivos) | 116 | ~60 | 52% | Simplificados |
| `cron/billingCron.ts` | 170 | 0 | 0% | Se archiva completo |

**Total dominio Core Governance: ~5,326 LOC**  
**Rescatable: ~2,112 LOC**  
**≈ 40% del código se rescata**

### Lo que se va (60%)

La parte eliminada/archivada corresponde principalmente a:
- **Pipeline Ideas + Branches normales** — todo el sistema de gobernanza democrática con votación multi-fase (~1,500 LOC)
- **Suscripción compleja** — billing proporcional, grace periods, suspensiones, cron de facturación (~670 LOC)
- **AI_COUNCIL** — modo especial con auditoría de IAs, importance scoring, Asimov protocol (~400 LOC)
- **Sistema de dificultad** — voting IQR, social rescue, auditoría cívica probabilística (~300 LOC)
- **Golden tickets + Elite** — mecánicas de gamificación avanzada (~150 LOC)

### Lo que queda (40%)

- **Trees** como workspaces con miembros, invites y visibilidad
- **Needs** simplificadas con puntos de necesidad (1000/mes)
- **Tasks** crear/asignar/completar con evidencia
- **Ramas hashtag** para organizar IAs por especialidad
- **Motor económico** con presupuesto 1000 pts y distribución por nivel
- **Suscripción simple** GRATUITO o monto fijo mensual

---

*Fin del audit.*
