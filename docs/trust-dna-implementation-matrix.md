# Trust DNA — Matriz de Implementación

> Cruce de protocolos del DNA original vs features implementadas en el codebase Trust Suite
> **Generado:** 2026-05-09
> **Fuentes:** trust-dna-by-domain.md (204 protocolos) × codebase-feature-map.md (57 features)

---

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ IMPLEMENTADO | Existe en el codebase con feature equivalente funcional |
| ⚠️ ADAPTADO/PARCIAL | Existe pero simplificado o con diferencias significativas |
| ❌ NO IMPLEMENTADO | No hay rastro en el codebase |

---

## 1. Governance — Gobernanza, Votación, Democracia

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Axioma | Transparencia | ✅ IMPLEMENTADO | EventLog, AuditController, auditorías de gobernanza |  |
| 2 | Axioma | Autonomía | ✅ IMPLEMENTADO | Trees con GovernanceModel, JoinPolicy, exportabilidad vía exportService |  |
| 3 | Axioma | Adaptabilidad | ✅ IMPLEMENTADO | Pipeline Needs→Ideas→Branches permite evolución por votación |  |
| 4 | Principio | La autoridad no se compra | ✅ IMPLEMENTADO | Fiat no otorga XP/Level/votos. Separación estricta en modelos |  |
| 5 | Principio | El dinero externo no contamina la gobernanza interna | ✅ IMPLEMENTADO | Reglas explícitas: fiat externo no afecta gobernanza |  |
| 6 | Principio | La comunidad vota antes de financiar | ✅ IMPLEMENTADO | Pipeline Needs→Ideas con votación ponderada previa a Branch |  |
| 7 | Principio | No oligarquías permanentes | ⚠️ ADAPTADO/PARCIAL | XP decay + rotación. Límites de mandato no completamente forzados | Límites automáticos de mandato y bloqueo de acumulación |
| 8 | Principio | Expertise informa, no reemplaza, a la democracia | ✅ IMPLEMENTADO | SkillInfluence ponderado 20-80%, votos democráticos mantienen peso |  |
| 9 | Regla | Votación anónima, segura, verificable e intransferible | ⚠️ ADAPTADO/PARCIAL | Votación con JWT auth. Anonimato en evaluaciones externas | Anonimato completo y verificabilidad criptográfica en todas las votaciones |
| 10 | Regla | Puntos de Necesidad | ✅ IMPLEMENTADO | NeedFunding con weeklyNeedPoints, assignPointsToNeed |  |
| 11 | Regla | Voto informado | ⚠️ ADAPTADO/PARCIAL | Interfaz de votación existe. Educación pre-voto no implementada | Knowledge Capsules y quizzes pre-votación |
| 12 | Regla | Líderes seleccionados por desempeño + recomendación sistémica + voto del equipo | ⚠️ ADAPTADO/PARCIAL | TreeMember con power/role. Sin selección algorítmica de líderes | Pipeline de selección de liderazgo con mérito demostrable |
| 13 | Regla | Límites de mandato y rotación obligatoria | ❌ NO IMPLEMENTADO | — | Sistema automático de límites de mandato y rotación |
| 14 | Protocolo | Expertos Verdes (60%) | ✅ IMPLEMENTADO | SkillInfluence con greenInfluence, SkillProposal, SkillEndorsement |  |
| 15 | Protocolo | Expertos Dorados (40%) | ✅ IMPLEMENTADO | SkillInfluence con goldenInfluence, Elite system via goldenTicketEngine |  |
| 16 | Regla | Influencia gremial entre 20% y 80% | ✅ IMPLEMENTADO | SkillInfluence.finalInfluence acotado |  |
| 17 | Mecanismo | F-UEC (Field-Weighted Expert Coefficient) | ⚠️ ADAPTADO/PARCIAL | SkillInfluence calcula pesos por skillTag y treeId | USF y SEW no implementados |
| 18 | Mecanismo | PEE (Peso/Efecto de Expertise) | ✅ IMPLEMENTADO | SkillInfluenceService.getInfluenceWeight |  |
| 19 | Mecanismo | CUF (Criterio de Uso Funcional) | ❌ NO IMPLEMENTADO | — | Evaluación funcional de necesidades implementadas |
| 20 | Mecanismo | Protocolo de Integridad Democrática | ⚠️ ADAPTADO/PARCIAL | Bonos de participación y XP por votar existen | Informed Voting con métricas de calidad de decisión |
| 21 | Mecanismo | Protocolo de la Cumbre | ⚠️ ADAPTADO/PARCIAL | XP decay implementado. Zona de Muerte no explícita | Zona de Muerte para niveles altos que fuerce rotación |
| 22 | Estructura | Tree | ✅ IMPLEMENTADO | Tree model completo con CRUD, membresía, admisión |  |
| 23 | Estructura | Branch | ✅ IMPLEMENTADO | Branch model con 8 fases, BranchType, BranchMember |  |
| 24 | Estructura | Trunk | ⚠️ ADAPTADO/PARCIAL | TreeMember.role puede ser Trunk. Sin modelo separado | Modelo Trunk explícito con funciones de coordinación |
| 25 | Estructura | Turtle | ❌ NO IMPLEMENTADO | — | Capa federada multi-Tree con recursos compartidos |
| 26 | Estructura | Servicios Públicos (Sustained Need / Sustenance Branch) | ⚠️ ADAPTADO/PARCIAL | Fase MAINTENANCE existe pero es manual | Automatización de Sustained Needs como servicios públicos |
| 27 | Mecanismo | Propuesta Delta | ❌ NO IMPLEMENTADO | — | Pipeline de mejoras incrementales a servicios públicos |
| 28 | Mecanismo | Propuesta Omega | ❌ NO IMPLEMENTADO | — | Pipeline de cambios fundamentales a servicios públicos |
| 29 | Mecanismo | Cláusula de Extinción | ❌ NO IMPLEMENTADO | — | Retiro de apoyo y cierre de servicios obsoletos |
| 30 | Protocolo | Ciclo de Trabajo de 8 Fases | ✅ IMPLEMENTADO | BranchPhase enum con 8 fases. PhaseDeliverable por fase |  |
| 31 | Protocolo | BOS (Branch Operating System) | ⚠️ ADAPTADO/PARCIAL | Task system + DifficultyVote. Media Recortada y Calificación Descentralizada parcial | Media Recortada Asimétrica completa |
| 32 | Protocolo | El Escudo | ✅ IMPLEMENTADO | Modo operativo estándar con gobernanza democrática |  |
| 33 | Protocolo | La Lanza | ⚠️ ADAPTADO/PARCIAL | Crisis mode existe (toggleCrisisMode). Sin salvaguardas de normalización | Salvaguardas contra normalización del poder excepcional |
| 34 | Protocolo | Dynamic Equilibrium / Functional Accountability (#1) | ⚠️ ADAPTADO/PARCIAL | Votación con NeedPoints, quorum (60%), relevance thresholds y timeouts (14d/30d). Parcial: Curva Consenso-Intensidad y b | Simplificado respecto al diseño original |
| 35 | Protocolo | Field-Weighted Expert-Informed Democracy (#3) | ⚠️ ADAPTADO/PARCIAL | SkillInfluence con recálculo diario implementa ponderación experta. F-UEC completo con USF y SEW no implementado. | Simplificado respecto al diseño original |
| 36 | Protocolo | Democratic Integrity / Vote Quality (#4) | ⚠️ ADAPTADO/PARCIAL | Bonos de participación e XP por votar existen. Informed Voting con Knowledge Capsules y quizzes no implementado. | Simplificado respecto al diseño original |
| 37 | Protocolo | Accountability to Reality / Praxis Score (#6) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 38 | Protocolo | Rival Schools of Accreditation (#7) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 39 | Protocolo | Sunset Clause — Experts (#8) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 40 | Protocolo | Public Utility (#9) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 41 | Protocolo | Satisfaction Index (#15) | ⚠️ ADAPTADO/PARCIAL | SatisfactionRating y encuestas por entregables. Curva logarítmica de credibilidad y ranking relativo no implementados. | Simplificado respecto al diseño original |
| 42 | Protocolo | Proto-Turtle (#28) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 43 | Protocolo | Sunset Charter / Founder Obsolescence (#29) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 44 | Protocolo | Layered Oracle (#38) | ⚠️ ADAPTADO/PARCIAL | Verificación en 2 etapas: SatisfaccionEvaluador + SatisfactionRating. Proof of Delivery vs Proof of Quality. | Simplificado respecto al diseño original |
| 45 | Protocolo | Systemic Resilience and Diplomacy (#45) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 46 | Protocolo | Divisive Issue (#47) | ⚠️ ADAPTADO/PARCIAL | Votación con supermayorías graduadas (66.7%→60%→55%) a lo largo de 10 años para temas divisivos. | Simplificado respecto al diseño original |
| 47 | Protocolo | Systemic Variance / Chi Index (#50) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 48 | Protocolo | Human Priority (#56) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 49 | Protocolo | Succession (#58) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 50 | Protocolo | Rapid Response (#60) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 51 | Protocolo | Thawing Winter (#70) | ⚠️ ADAPTADO/PARCIAL | Gate poblacional (minMembersForBerries, default 10000) que bloquea generación de Berries en micro-árboles. | Simplificado respecto al diseño original |
| 52 | Protocolo | Jurisdictional Diversity (#73) | ⚠️ ADAPTADO/PARCIAL | Evaluadores externos seleccionados por Fisher-Yates determinístico para diversidad jurisdiccional. | Simplificado respecto al diseño original |
| 53 | Protocolo | Managed Secession (#75) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 54 | Protocolo | Sovereign Immunity and Censure (#76) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 55 | Protocolo | Germination and Grafting (#78) | ⚠️ ADAPTADO/PARCIAL | Tree templates (PlantillaArbol) + invitación para creación asistida. Heritage Seeds y Grafting automático no implementad | Simplificado respecto al diseño original |
| 56 | Protocolo | Arborist (#79) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 57 | Protocolo | Trinity Dashboard (#89) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 58 | Protocolo | Decentralized Auditing (#92) | ✅ IMPLEMENTADO | Audit pool con selección Fisher-Yates determinístico + Auditoria model. Curva logarítmica de credibilidad. |  |
| 59 | Protocolo | Launch / Cellular Mitosis (#95) | ⚠️ ADAPTADO/PARCIAL | Tree creation flow con Sandbox/Live. Concentration Threshold y Genesis Event no completamente implementados. | Simplificado respecto al diseño original |
| 60 | Protocolo | Threshold Inheritance (#96) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 61 | Protocolo | Protocol Guardians (#100) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 62 | Protocolo | Tree/Root/Trunk/Branch Structure (#102) | ✅ IMPLEMENTADO | Estructura organizativa completa: Tree, Branch con BranchType (NORMAL, HASHTAG, AUTOSUSTENTO, EXTERNAL_CONTRACT). |  |
| 63 | Protocolo | 8-Phase Pipeline (#103) | ✅ IMPLEMENTADO | BranchPhase enum: INVESTIGATION, DEVELOPMENT, PRODUCTION, DISTRIBUTION, MAINTENANCE, RECYCLING. Flujo completo con deliv |  |
| 64 | Protocolo | SkillInfluence (#107) | ✅ IMPLEMENTADO | Recálculo diario de pesos de expertos por campo para votación ponderada. |  |
| 65 | Protocolo | Voting System (#108) | ✅ IMPLEMENTADO | NeedFunding, IdeaLike con weight (influencia × concentración), BranchNeedVote, TaskVote. |  |
| 66 | Protocolo | Podium Promotion (#109) | ✅ IMPLEMENTADO | Promoción de ideas top (top 3, >50%) a Branch. |  |
| 67 | Protocolo | EventLog (#110) | ✅ IMPLEMENTADO | Registro completo de acciones del sistema con EventSeverity y EventSource. |  |

**Subtotal 1. Governance:** 67 protocolos — ✅ 23 (34%) | ⚠️ 21 (31%) | ❌ 23 (34%)

---

## 2. Economics — Fiat, Berries, XP, Incentivos

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Axioma | Eficiencia | ✅ IMPLEMENTADO | 8 fases del ciclo garantizan validación antes de consumir recursos |  |
| 2 | Protocolo | Fiat — Ledger Externo | ✅ IMPLEMENTADO | FiatTransaction model completo, 10 endpoints, economicEngine |  |
| 3 | Regla | Fiat no otorga XP, nivel, votos ni autoridad | ✅ IMPLEMENTADO | Separación estricta en modelos: Fiat ≠ XP ≠ poder |  |
| 4 | Regla | Fiat no compra Berries directamente | ✅ IMPLEMENTADO | BerryConfig con minMembersForBerries. Sin puente fiat→berries |  |
| 5 | Regla | Presupuestos fiat explícitos, justificados y auditables | ✅ IMPLEMENTADO | FiatTransaction con verificationStatus, receipt upload, certification |  |
| 6 | Protocolo | Closed-Loop Fiat Exchange (#33) | ✅ IMPLEMENTADO | Solo se puede gastar fiat ganado previamente del exterior. Ciclo cerrado: el fiat entra por ventas/servicios externos y  |  |
| 7 | Protocolo | Berries — Moneda Interna | ✅ IMPLEMENTADO | BerryConfig, BerryTransaction, berryFlowService, berriesEngine |  |
| 8 | Regla | Berries no son activo financiero | ✅ IMPLEMENTADO | Diseño anti-especulación con vencimiento a 12 meses, gasto FIFO |  |
| 9 | Regla | Emisión ligada a nivel y participación | ✅ IMPLEMENTADO | berryFlowService.applyMonthlyBerryFlow usa level y participación |  |
| 10 | Regla | Gasto FIFO por vencimiento | ⚠️ ADAPTADO/PARCIAL | BERRIES_DECAY_RATE y oxidación existen. FIFO explícito no implementado | Algoritmo FIFO por vencimiento en transacciones |
| 11 | Protocolo | XP — Reputación Verificable | ✅ IMPLEMENTADO | UserSkillXP, xp, level en TreeMember. XP por tareas y auditorías |  |
| 12 | Regla | XP determina Nivel del usuario | ✅ IMPLEMENTADO | Level escalado con XP en TreeMember y servicios |  |
| 13 | Mecanismo | Decaimiento temporal del XP inactivo | ✅ IMPLEMENTADO | xpDecay.ts cron semanal con decaimiento por inactividad |  |
| 14 | Mecanismo | Zonas de dificultad creciente | ✅ IMPLEMENTADO | DifficultyVote 1-10. Elite system con dificultad 6-10 |  |
| 15 | Regla | La antigüedad sola no garantiza poder permanente | ✅ IMPLEMENTADO | XP decay + rotación previenen acumulación por antigüedad |  |
| 16 | Protocolo | Trace — Identidad Verificable (aspecto económico) | ✅ IMPLEMENTADO | SkillMigration, exportService. Portabilidad de skills entre Trees |  |
| 17 | Principio | La competencia es universal; el estatus es local | ✅ IMPLEMENTADO | Skills portables vía Trace. XP/Nivel locales al Tree |  |
| 18 | Protocolo | Nutrients | ❌ NO IMPLEMENTADO | — | Intercambio económico inter-Tree y recursos federados |
| 19 | Protocolo | Modos Económicos del Tree | ⚠️ ADAPTADO/PARCIAL | EconomyMode enum y updateEconomyMode existen. Sin transiciones graduales | 5 modos graduales con requirements de madurez |
| 20 | Regla | TRUST_FULL requiere madurez comunitaria comprobada | ❌ NO IMPLEMENTADO | — | Verificación de madurez comunitaria para TRUST_FULL |
| 21 | Protocolo | Ramas de Autosustento | ✅ IMPLEMENTADO | AutosustentoIdea + AutosustentoBranch + SustainabilityCycle completos |  |
| 22 | Regla | Split de sostenibilidad debe sumar 100% | ✅ IMPLEMENTADO | SustainabilitySplit con validación de suma 100% |  |
| 23 | Regla | Solo miembros del Tree pueden proponer Ramas de Autosustento | ✅ IMPLEMENTADO | Validación de membresía en autosustento controllers |  |
| 24 | Regla | Transacciones fiat en ramas de autosustento no generan XP, nivel, votos ni autoridad | ✅ IMPLEMENTADO | Separación fiat/XP en el diseño del modelo |  |
| 25 | Protocolo | Necesidades Externas / Puntos de Alcance | ✅ IMPLEMENTADO | ExternalNeed + ScopePreference + SolutionProposal completos |  |
| 26 | Regla | Clientes externos no usan Puntos de Necesidad internos | ✅ IMPLEMENTADO | Separación ExternalNeed (ScopePreference) vs Need (NeedFunding) |  |
| 27 | Protocolo | The Summit (#2) | ✅ IMPLEMENTADO | Decaimiento de XP implementado en xpDecay.ts. Zona de Muerte para niveles altos no explícitamente modelada. |  |
| 28 | Protocolo | Operational Margin (#19) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 29 | Protocolo | Cognitive Frontier (#20) | ⚠️ ADAPTADO/PARCIAL | DifficultyFactor y DifficultyVote existen. Frontier Multiplier (Fm) y Chronicity Factor no implementados. | Simplificado respecto al diseño original |
| 30 | Protocolo | Blind Effort Estimation / BEE (#21) | ⚠️ ADAPTADO/PARCIAL | TaskVote con requiredHours y difficulty. Panel ciego de 3-5 expertos externos con Z-Score no implementado. | Simplificado respecto al diseño original |
| 31 | Protocolo | Escape Valve (#22) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 32 | Protocolo | Predictive Valuation / Sword Mode (#23) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 33 | Protocolo | Intellectual Genesis Funding / IGFP (#24) | ⚠️ ADAPTADO/PARCIAL | Fases Idea e Investigation en pipeline con funding vía NeedFunding. Creative Safe Harbor no implementado. | Simplificado respecto al diseño original |
| 34 | Protocolo | Retroactive Inheritance (#25) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 35 | Protocolo | Unified Exchange (#26) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 36 | Protocolo | Mycelium (#27) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 37 | Protocolo | Federated Treasury (#34) | ⚠️ ADAPTADO/PARCIAL | AssetFund model (FIAT/PROPERTY). Tree tiene presupuestoTotal. Separación Tree Treasury + Turtle Resilience Fund parcial. | Simplificado respecto al diseño original |
| 38 | Protocolo | Fiat Exchange — Dynamic Fee (#44) | ⚠️ ADAPTADO/PARCIAL | FiatTransaction gestiona conversiones. Dynamic Risk-Adjusted Fee como mecanismo automático no implementado. | Simplificado respecto al diseño original |
| 39 | Protocolo | Cultural Synapsis (#51) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 40 | Protocolo | Van Gogh Wager (#52) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 41 | Protocolo | Impact-First (#55) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 42 | Protocolo | Symbiotic Branch (#57) | ⚠️ ADAPTADO/PARCIAL | BranchNeedVote + Strategic Alliance en BranchType (EXTERNAL_CONTRACT). Framework completo de alianzas no implementado. | Simplificado respecto al diseño original |
| 43 | Protocolo | B2B Marketplace / XP Spot Market (#59) | ⚠️ ADAPTADO/PARCIAL | BranchOsLedger + BerryFlow modelan transacciones entre ramas. XP Spot Market completo no implementado. | Simplificado respecto al diseño original |
| 44 | Protocolo | Siege Breaker (#61) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 45 | Protocolo | Prometheus (#62) | ⚠️ ADAPTADO/PARCIAL | AutosustentoIdea + AutosustentoBranch implementan ideas independientes de Needs. Disruption Index y Maslow Engine no. | Simplificado respecto al diseño original |
| 46 | Protocolo | Da Vinci Wager (#63) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 47 | Protocolo | Satisfaction-to-XP Bridge (#64) | ⚠️ ADAPTADO/PARCIAL | SatisfactionRating + PhaseDeliverable conectan satisfacción con XP. Fórmula con Penalty Floor (60%) y Excellence Bonus ( | Simplificado respecto al diseño original |
| 48 | Protocolo | Metabolic Sedimentation (#71) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 49 | Protocolo | Isomorphic Valuation (#81) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 50 | Protocolo | Systemic Credit (#93) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 51 | Protocolo | Staged Ignition (#97) | ⚠️ ADAPTADO/PARCIAL | minMembersForBerries (default 10000) implementa gate poblacional. Phase Ratio y Demographic Factor no implementados. | Simplificado respecto al diseño original |
| 52 | Protocolo | Circuit Breaker (#98) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 53 | Protocolo | Systemic Insurance & Accountability (#99) | ⚠️ ADAPTADO/PARCIAL | EventLog + sistema de auditoría. Resilience Fund para fallos catastróficos no completamente implementado. | Simplificado respecto al diseño original |
| 54 | Protocolo | Effort Consensus (#101) | ✅ IMPLEMENTADO | DifficultyVote model con votes 1-10, DifficultyVoteLike. Consenso comunitario para estimación de esfuerzo. |  |
| 55 | Protocolo | Berries Currency (#104) | ✅ IMPLEMENTADO | bayasBalance en TreeMember, BerryConfig, BerryTransaction, BerryMonthlyCycle, berryFlowService.ts. |  |

**Subtotal 2. Economics:** 55 protocolos — ✅ 25 (45%) | ⚠️ 13 (24%) | ❌ 17 (31%)

---

## 3. Identity — Identidad, Reputación, Privacidad

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Principio | La contribución verificable es la fuente legítima de reputación | ✅ IMPLEMENTADO | XP por tareas con evidencia + auditoría. Badges por skills verificables |  |
| 2 | Principio | Privacidad personal, transparencia sistémica | ✅ IMPLEMENTADO | PrivacySettings + EventLog público. Procesos auditables, datos privados |  |
| 3 | Protocolo | Trace — Sistema educativo/reputacional portable | ✅ IMPLEMENTADO | TraceProfile, SkillStarChart, exportService, visibleForRecruitment |  |
| 4 | Protocolo | Privacidad y Datos | ✅ IMPLEMENTADO | PrivacySettings con granularidad. Derecho al olvido. FileSecurity |  |
| 5 | Regla | Consentimiento granular y revocable | ⚠️ ADAPTADO/PARCIAL | PrivacySettings con toggles granulares. Sin JIT Consent | Consentimiento Just-In-Time y revocación por dato específico |
| 6 | Regla | Derecho al olvido | ✅ IMPLEMENTADO | GDPR: POST /api/users/me/request-deletion con anonimización |  |
| 7 | Regla | Etiqueta nutricional de datos | ❌ NO IMPLEMENTADO | — | UI de Data Nutrition Labels explicando datos solicitados |
| 8 | Regla | Privacidad diferencial para datos agregados | ⚠️ ADAPTADO/PARCIAL | aggregateMetrics toggle en PrivacySettings. Sin DP real | Implementación de Differential Privacy real en queries agregadas |
| 9 | Regla | Desanonimización solo bajo causa probable matemática y proceso definido | ❌ NO IMPLEMENTADO | — | Protocolo formal de desanonimización con thresholds matemáticos |
| 10 | Protocolo | Capas de Visibilidad de Evidencia | ✅ IMPLEMENTADO | 6 visibility levels en fileSecurity.ts: PUBLIC a PRIVATE |  |
| 11 | Protocolo | Desvanecimiento Temporal | ❌ NO IMPLEMENTADO | — | Capa visual de desvanecimiento de eventos antiguos. Filtros 30/90/180d |
| 12 | Protocolo | Trust Insight — Radar de Necesidades | ✅ IMPLEMENTADO | InsightSignal con 51 funciones en insightController. 3 niveles |  |
| 13 | Regla | Trust Insight no vende la brújula central de Trust | ✅ IMPLEMENTADO | Señales agregadas, no datos individuales |  |
| 14 | Protocolo | Explorer Booster | ❌ NO IMPLEMENTADO | — | Incentivo a rutas educativas novedosas |
| 15 | Protocolo | Path Forum | ❌ NO IMPLEMENTADO | — | Foro de metodologías y rutas de aprendizaje |
| 16 | Protocolo | Domestic Badge | ❌ NO IMPLEMENTADO | — | Badge por trabajo de cuidado no remunerado |
| 17 | Protocolo | Hora Dorada | ❌ NO IMPLEMENTADO | — | Ritual cívico diario con diseño anti-adicción |
| 18 | Protocolo | Dynamic Verification (#5) | ⚠️ ADAPTADO/PARCIAL | Skills con tiers (Verde/Dorado/Elite) + ExpertEndorsement. Exámenes IA y peer-review cross-tree no implementados. | Simplificado respecto al diseño original |
| 19 | Protocolo | Persona (#12) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 20 | Protocolo | Phoenix (#14) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 21 | Protocolo | Sovereign Identity (#40) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 22 | Protocolo | Rooting & Tiered Migration (#77) | ⚠️ ADAPTADO/PARCIAL | SkillMigration + migrationController con 3 tiers y pérdida de datos proporcional. | Simplificado respecto al diseño original |
| 23 | Protocolo | Open Passport (#90) | ⚠️ ADAPTADO/PARCIAL | Trace exportable (exportService.ts, exportController.ts) + publicProfileEnabled. Rosetta Stone y Headhunter Toll no impl | Simplificado respecto al diseño original |
| 24 | Protocolo | XP/Trace System (#105) | ✅ IMPLEMENTADO | xp, level, skills en TreeMember. Badges, niveles, XP decay, skill percentiles. |  |
| 25 | Protocolo | Skill Tiers — Verde/Dorado/Elite (#106) | ✅ IMPLEMENTADO | SkillProposal, SkillEndorsement models. Sistema completo de tiers de habilidades. |  |

**Subtotal 3. Identity:** 25 protocolos — ✅ 10 (40%) | ⚠️ 5 (20%) | ❌ 10 (40%)

---

## 4. Security — Auditoría, Anti-Fraude, Defensa

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Protocolo | Auditoría Probabilística (BOS) | ⚠️ ADAPTADO/PARCIAL | Auditoria model + civicAudit existen. Sin 20% probabilístico | Selección probabilística del 20% de tareas para auditoría |
| 2 | Protocolo | Media Recortada Asimétrica (BOS) | ❌ NO IMPLEMENTADO | — | Algoritmo de media recortada que descarta outliers bajos |
| 3 | Protocolo | Calificación de Dificultad Descentralizada (BOS) | ✅ IMPLEMENTADO | DifficultyVote + DifficultyVoteLike con autoexclusión del ejecutor |  |
| 4 | Invariante | Toda acción sensible deja EventLog | ✅ IMPLEMENTADO | EventLog en 28/35 controllers con severidad y metadata |  |
| 5 | Protocolo | Layered Privacy / Contextual Veil (#13) | ⚠️ ADAPTADO/PARCIAL | PrivacySettings con VisibilityLevel (PRIVATE, TREE_ONLY, TRUST_NETWORK, PUBLIC). 3 capas criptográficas no implementadas | Simplificado respecto al diseño original |
| 6 | Protocolo | Temporal Fog (#16) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 7 | Protocolo | Dynamic Redemption / Ghost Auditing (#17) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 8 | Protocolo | Master Key (#31) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 9 | Protocolo | Data Privacy / Granular Consent (#36) | ⚠️ ADAPTADO/PARCIAL | PrivacySettings con granularidad (traceProfileVisibility, taskHistoryVisibility, evidenceVisibility, etc.). JIT Consent  | Simplificado respecto al diseño original |
| 10 | Protocolo | Differential Privacy / DPAA (#37) | ⚠️ ADAPTADO/PARCIAL | corruptionCheck.ts implementa detección de anomalías. 4 niveles de visibilidad. Triggers específicos (Ouroboros, Price A | Simplificado respecto al diseño original |
| 11 | Protocolo | Sybil Immune System (#39) | ⚠️ ADAPTADO/PARCIAL | TokenInvitacion, MemberStatus (UNVERIFIED→VERIFIED), Web of Trust via endorsements. 3 capas completas no implementadas. | Simplificado respecto al diseño original |
| 12 | Protocolo | Economic Sentinel (#72) | ⚠️ ADAPTADO/PARCIAL | corruptionCheck.ts implementa detección de anomalías económicas. Sentinel AI completo no implementado. | Simplificado respecto al diseño original |
| 13 | Protocolo | Audit Tourism (#74) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 14 | Protocolo | Passive Defense (#88) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 15 | Protocolo | Trust Seal (#91) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |

**Subtotal 4. Security:** 15 protocolos — ✅ 2 (13%) | ⚠️ 6 (40%) | ❌ 7 (47%)

---

## 5. Social — Comunidad, Cultura, Bienestar

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Principio | Necesidades antes que deseos | ✅ IMPLEMENTADO | Pipeline de Necesidades con thresholds. Priorización comunitaria |  |
| 2 | Estructura | External Agent | ✅ IMPLEMENTADO | ExternalAgent model en externalNeedController |  |
| 3 | Protocolo | Sandbox | ⚠️ ADAPTADO/PARCIAL | Tree creation sin economía activa inicial. Sin SandboxMode explícito | Modo Sandbox explícito para nuevas comunidades |
| 4 | Protocolo | Evento Génesis | ❌ NO IMPLEMENTADO | — | Transición oficial proto-Tree a Tree con todas las capacidades |
| 5 | Protocolo | Wellness (#10) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 6 | Protocolo | Seasonal Rhythms / The Festival (#11) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 7 | Protocolo | Living Story (#41) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 8 | Protocolo | Tutorial / Adventurer's Call (#42) | ⚠️ ADAPTADO/PARCIAL | Sistema is_onboarded en User. Tutorial gamificado completo no implementado. | Simplificado respecto al diseño original |
| 9 | Protocolo | Trace Specialization (#43) | ⚠️ ADAPTADO/PARCIAL | Skills con niveles (Verde/Dorado/Elite) + seekingWork, visibleForRecruitment. Interfaz Class Hall no implementada. | Simplificado respecto al diseño original |
| 10 | Protocolo | Temporal Fade (#46) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 11 | Protocolo | Redemption Clause (#48) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 12 | Protocolo | Resonance (#49) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 13 | Protocolo | Social Equivalence (#53) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 14 | Protocolo | First Contact (#69) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 15 | Protocolo | Ethos Resonance (#86) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |

**Subtotal 5. Social:** 15 protocolos — ✅ 2 (13%) | ⚠️ 3 (20%) | ❌ 10 (67%)

---

## 6. Legal — Contratos, Propiedad Intelectual, Jurisdicciones

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Protocolo | Dispute Resolution and Arbitration (#35) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 2 | Protocolo | Restorative Sanction (#54) | ⚠️ ADAPTADO/PARCIAL | strikesEconomicos en TreeMember + bans. Sistema completo multi-nivel no implementado. | Simplificado respecto al diseño original |
| 3 | Protocolo | Principle of Legal Mitosis (#80) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 4 | Protocolo | Federated Network (#82) | ⚠️ ADAPTADO/PARCIAL | Tree model con GovernanceModel (DICTATORSHIP/DEMOCRACY), JoinPolicy, TreeVisibility. Estructura Fundación+Cooperativa no | Simplificado respecto al diseño original |
| 5 | Protocolo | Liability Firewall (#83) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 6 | Protocolo | Restorative Justice (#84) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 7 | Protocolo | Intellectual Property (#85) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |

**Subtotal 6. Legal:** 7 protocolos — ✅ 0 (0%) | ⚠️ 2 (29%) | ❌ 5 (71%)

---

## 7. Resource — Materiales, Activos Físicos, Ecología

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Principio | Mantenimiento y reciclaje son fases de primera clase | ✅ IMPLEMENTADO | MAINTENANCE y RECYCLING en BranchPhase enum |  |
| 2 | Estructura | Root | ❌ NO IMPLEMENTADO | — | Unidad de recursos con gestión de materias primas |
| 3 | Protocolo | Thawing Winter (constitución) | ⚠️ ADAPTADO/PARCIAL | minMembersForBerries implementa gate. Sin gatillos de crisis | Salvaguardia económica automatizada completa |
| 4 | Protocolo | Fénix (constitución) | ❌ NO IMPLEMENTADO | — | Sistema de recuperación y reinicio ante fallo sistémico |
| 5 | Protocolo | Dynamic Resource Mandate (#18) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 6 | Protocolo | Terra (#65) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 7 | Protocolo | Gaia (#66) | ⚠️ ADAPTADO/PARCIAL | SustainabilityCycle + SustainabilitySplit implementan tracking ecológico básico. Eco Evaluator, Ecological Warden, Ecolo | Simplificado respecto al diseño original |
| 8 | Protocolo | Aegis (#67) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 9 | Protocolo | Asset Integration (#68) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |

**Subtotal 7. Resource:** 9 protocolos — ✅ 1 (11%) | ⚠️ 2 (22%) | ❌ 6 (67%)

---

## 8. Technical — Infraestructura, AI, Código

| # | Tipo | Protocolo | Estado | Qué tiene actualmente | Qué falta |
|---|------|-----------|--------|----------------------|-----------|
| 1 | Protocolo | Sucesión (constitución) | ❌ NO IMPLEMENTADO | — | Replicación de soluciones probadas sin monopolios |
| 2 | Protocolo | Niebla Temporal (constitución) | ❌ NO IMPLEMENTADO | — | Desincronización de feedback privado e impacto público |
| 3 | Protocolo | PDAA (constitución) | ⚠️ ADAPTADO/PARCIAL | corruptionCheck.ts + privacy settings. Sin DP algorítmica | Privacidad diferencial algorítmica completa |
| 4 | Protocolo | Centinela Económico (constitución) | ✅ IMPLEMENTADO | corruptionCheck.ts cron diario con detección de anomalías |  |
| 5 | Invariante | Branch OS ejecuta trabajo; no es herramienta de control jerárquico | ✅ IMPLEMENTADO | Diseño de Branch OS como herramienta de trabajo, no control |  |
| 6 | Invariante | Módulos avanzados se activan por madurez, no por entusiasmo | ⚠️ ADAPTADO/PARCIAL | EconomyMode escalonado. Sin gate de madurez para todos los features | Gates de madurez comunitaria para features avanzados |
| 7 | Protocolo | Trust Suite — Implementación práctica | ✅ IMPLEMENTADO | 5 PWAs con ciclo mínimo completo implementado |  |
| 8 | Protocolo | Asimov (#30) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 9 | Protocolo | Oracle Swarm (#32) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 10 | Protocolo | Technical Assurance (#87) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |
| 11 | Protocolo | Zenith (#94) | ❌ NO IMPLEMENTADO | — | No existe en el codebase |

**Subtotal 8. Technical:** 11 protocolos — ✅ 3 (27%) | ⚠️ 2 (18%) | ❌ 6 (55%)

---

## 📊 Resumen Numérico

| Estado | Cantidad | Porcentaje |
|---|---|---|
| ✅ IMPLEMENTADO | 66 | 32.4% |
| ⚠️ ADAPTADO/PARCIAL | 54 | 26.5% |
| ❌ NO IMPLEMENTADO | 84 | 41.2% |
| **TOTAL** | **204** | **100%** |

### Por Dominio

| Dominio | Total | ✅ Implementado | ⚠️ Adaptado | ❌ No Implementado |
|---|---|---|---|---|
| 1. Governance | 67 | 23 | 21 | 23 |
| 2. Economics | 55 | 25 | 13 | 17 |
| 3. Identity | 25 | 10 | 5 | 10 |
| 4. Security | 15 | 2 | 6 | 7 |
| 5. Social | 15 | 2 | 3 | 10 |
| 6. Legal | 7 | 0 | 2 | 5 |
| 7. Resource | 9 | 1 | 2 | 6 |
| 8. Technical | 11 | 3 | 2 | 6 |

---

*Matriz generada cruzando trust-dna-by-domain.md (204 protocolos extraídos de TRUST-DNA.md + trust-dna-protocols-analysis.md) contra codebase-feature-map.md (57 features en ~310 endpoints).*