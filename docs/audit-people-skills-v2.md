# Audit Trust Suite → Trust Lite v2: People & Skills

**Auditor:** analyst-2 (kanban task t_ed1412ca)
**Fecha:** 2026-05-12
**Alcance:** Evaluar features del dominio People & Skills para su migración a Trust Lite v2

---

## Tabla de decisiones

| # | Feature | Decisión | Justificación |
|---|---------|----------|---------------|
| 1 | **Auth** (JWT, register/login, guest-join) | **QUEDA** | Suficiente para v2. JWT simple con guest-join cubre IAs + humanos. OAuth/social login añadiría complejidad innecesaria. El sistema actual (7d tokens, bcrypt, cross-token para SSO) es robusto y ligero. |
| 2 | **User profile / TreeMember** | **QUEDA** | El modelo ya soporta IAs (isAI, aiProfile, aiProvider, aiModel, aiOwnerId). La distinción humano vs IA es nativa. TreeMember con skills JSON, xp, level cubre exactamente lo que v2 necesita. Sin cambios requeridos. |
| 3 | **XP + niveles** | **QUEDA** | Fórmula simple (xp/50 + 1) es meritocrática y directa. IAs ganan XP completando tasks → suben de nivel. El boost por endorsements añade capa social ligera. Perfecto para v2 "paperclip meritocrático". |
| 4 | **Skill XP / percentiles** (UserSkillXP, cachedPercentile) | **QUEDA** | Esencial para v2. Separa XP general (niveles) de skill XP (especialización). cachedPercentile permite escalar sin recalcular en cada request. La tabla UserSkillXP con completedTasks + accumulatedPoints es la base del sistema de skills entrenables. |
| 5 | **Expert Endorsements** (avales entre miembros) | **ARCHIVAR** | Conceptual: en un sistema de IAs, los avales entre agentes son redundantes. El XP por tarea completada ya certifica competencia. Penalizaciones (ban 3 meses, perder skill) son drama innecesario. Archivar (no borrar): puede reactivarse si se añaden humanos que avalan IAs. |
| 6 | **Skill Influence System** (votación ponderada) | **ELIMINAR** | Trust Lite v2 no tiene gobernanza compleja ni votación de necesidades. Este sistema (green/golden influence, ponderación de votos) existe solo para el pipeline de gobernanza que v2 no hereda. IAs no votan ideas, solo completan tareas. Eliminar reduce ~500 líneas y simplifica el modelo. |
| 7 | **Career Path Network** (grafo + Dijkstra) | **QUEDA** | Altísimo valor para v2. Las IAs podrán visualizar rutas de crecimiento entre skills, encontrar el camino más corto para adquirir nuevas especialidades. Alineado con "entrenable": la IA planifica su propio desarrollo. Implementación robusta (co-ocurrencia + transiciones temporales, 3 modos de ruta, Dijkstra multi-source). |
| 8 | **Golden Tickets** (7-task streak) | **ARCHIVAR** | Gamificación atractiva pero compleja. Para v2 paperclip meritocrático, XP + niveles ya motiva suficientemente. Los tickets son una "economía paralela" (ganar, gastar, renovar) que v2 no necesita. Archivar como módulo opcional futuro: si se reactiva, simplificar a 1 ticket (no 3). |
| 9 | **Privacy Settings** (GDPR, visibilidad) | **QUEDA** | Necesario incluso en open source. Las IAs necesitan control de visibilidad entre árboles. GDPR/deletion requerido si hay humanos. Simplificar para v2: solo TREE_ONLY y PUBLIC (quitar TRUST_NETWORK y granularidad excesiva). |

---

## Resumen de rescate de código

| Destino | Features | % Código | Archivos clave |
|---------|----------|----------|----------------|
| **QUEDA** | Auth, User/TreeMember, XP+Niveles, SkillXP/Percentiles, Career Path, Privacy | ~70% | authController, userController, taskController (XP), eliteCalculator, careerPathService, careerPathController, privacy utils, User/TreeMember/UserSkillXP models |
| **ARCHIVAR** | Expert Endorsements, Golden Tickets | ~15% | expertEndorsementService/Controller, goldenTicketEngine |
| **ELIMINAR** | Skill Influence System | ~15% | skillInfluenceService, skillInfluenceCron, scoring.ts (parcial) |

**~70% del código del dominio People & Skills se rescata directamente para Trust Lite v2.**

### Lo que cambia
1. **Eliminar:** SkillInfluence model, servicio, cron y toda referencia a influencia ponderada en votos
2. **Archivar (código existe pero se desactiva):** Endpoints de endorsements, golden ticket engine, campos goldenTickets y avalBanHasta en TreeMember
3. **Simplificar Privacy:** Reducir de 4 niveles a 2 (TREE_ONLY, PUBLIC)
4. **Mantener intacto:** Auth, XP/niveles, UserSkillXP/percentiles, Career Path Network completo

### Archivos backend del dominio (referencia)

```
backend/src/
├── controllers/
│   ├── authController.ts          (272 loc) — QUEDA
│   ├── userController.ts          (717 loc) — QUEDA (parcial: quitar referencias a goldenTickets, avales)
│   ├── taskController.ts          (1275 loc) — QUEDA (XP logic, skill proposal; quitar endorsement boost)
│   ├── careerPathController.ts    (450 loc) — QUEDA
│   ├── expertEndorsementController.ts (103 loc) — ARCHIVAR
│   └── privacySettingsController.ts — QUEDA (simplificar)
├── services/
│   ├── careerPathService.ts       (687 loc) — QUEDA
│   ├── expertEndorsementService.ts (264 loc) — ARCHIVAR
│   └── skillInfluenceService.ts   (242 loc) — ELIMINAR
├── utils/
│   ├── goldenTicketEngine.ts      (191 loc) — ARCHIVAR
│   ├── eliteCalculator.ts         (165 loc) — QUEDA
│   ├── privacy.ts                 (108 loc) — QUEDA (simplificar)
│   └── scoring.ts                 (111 loc) — ELIMINAR (lógica de branch points para gobernanza)
├── middleware/
│   └── authMiddleware.ts          (188 loc) — QUEDA
├── cron/
│   ├── skillInfluenceCron.ts      — ELIMINAR
│   └── careerPathGraphCron.ts     — QUEDA
└── routes/
    ├── careerPathRoutes.ts        (24 loc) — QUEDA
    └── expertEndorsementRoutes.ts — ARCHIVAR
```
