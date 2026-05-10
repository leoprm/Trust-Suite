# Trust Suite — Codebase Feature Map (Auditoría Fresca)

> **Auditado:** 2026-05-09  
> **Codebase:** `/home/leo/Documentos/Trust Suite/`  
> **Archivos inspeccionados:** 40 controllers, 41 routes, 19 services, 8 cron jobs, 11 utils, 19 pages, 52 components, 3 stores, 1 Prisma schema (66 modelos, 66 enums), App.tsx, index.ts  
> **Criterio de completitud:** ✅ = endpoints + lógica + frontend + modelos completos. ⚠️ = parcial (schema existe pero implementación incompleta o viceversa).

---

## 1. GOVERNANCE — Gobernanza descentralizada

### 1.1 Trees (Árboles — Unidades de gobernanza)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Crear árbol | `controllers/treeController.ts` → `createTree` | `POST /api/trees` |
| Listar mis árboles | `controllers/treeController.ts` → `getMyTrees` | `GET /api/trees` |
| Listar árboles globales | `controllers/treeController.ts` → `getGlobalTrees` | `GET /api/trees/global` |
| Obtener árbol | `controllers/treeController.ts` → `getTree` | `GET /api/trees/:id` |
| Miembros del árbol | `controllers/treeController.ts` → `getTreeMembers` | `GET /api/trees/:id/members` |
| Invitar miembro | `controllers/treeController.ts` → `inviteMember` | `POST /api/trees/:id/invite` |
| Token de invitado | `controllers/treeController.ts` → `generateGuestToken` | `POST /api/trees/:id/guest-token` |
| Consumir token | `controllers/treeController.ts` → `consumeGuestToken` | `POST /api/trees/consume-guest-token` |
| Unirse a árbol | `controllers/treeController.ts` → `joinTree` | `POST /api/trees/join` |
| Salir del árbol | `controllers/treeController.ts` → `leaveTree` | `DELETE /api/trees/:id/leave` |
| Remover miembro | `controllers/treeController.ts` → `removeMember` | `DELETE /api/trees/:treeId/members/:userId` |
| Actualizar poder | `controllers/treeController.ts` → `updateMemberPower` | `PATCH /api/trees/:id/members/:userId/power` |
| Modo crisis | `controllers/treeController.ts` → `toggleCrisisMode` | `POST /api/trees/:id/crisis` |
| Broadcast crisis | `controllers/treeController.ts` → `broadcastCrisisSignal` | `POST /api/trees/:id/crisis/broadcast` |

**Frontend:** `pages/TreeDetail.tsx`, `pages/TreeNetwork.tsx`, `pages/MyTreesList.tsx`, `pages/CreateTree.tsx`, `components/TreeSidebar.tsx`, `components/ArbolViews.tsx`  
**Modelos:** `Tree`, `TreeMember`, `TreeRelation`  
**Admisión:** `AdmissionPolicy` enum (OPEN | INVITE_ONLY), `JoinPolicy` enum  

### 1.2 Needs → Ideas → Branches (Pipeline de gobernanza)
**Estado:** ✅ Completo (A+B+C+D: thresholds + weighted voting + podium + timeouts)

| Endpoint | Archivos | Método |
|---|---|---|
| Crear necesidad | `controllers/needController.ts` → `createNeed` | `POST /api/needs` |
| Listar necesidades | `controllers/needController.ts` → `getNeeds` | `GET /api/needs` |
| Actualizar necesidad | `controllers/needController.ts` → `updateNeed` | `PATCH /api/needs/:id` |
| Eliminar necesidad | `controllers/needController.ts` → `deleteNeed` | `DELETE /api/needs/:id` |
| Asignar puntos | `controllers/needController.ts` → `assignPointsToNeed` | `POST /api/needs/:id/fund` |
| Propuestas hashtag | `controllers/needController.ts` → `getHashtagProposals` | `GET /api/needs/hashtag-proposals` |
| Crear idea | `controllers/ideaController.ts` → `createIdea` | `POST /api/ideas` |
| Listar ideas | `controllers/ideaController.ts` → `getIdeasForNeed` | `GET /api/ideas/need/:needId` |
| Votar idea (like ponderado) | `controllers/ideaController.ts` → `toggleLikeIdea` | `POST /api/ideas/:id/like` |
| Fondear idea con bayas | `controllers/ideaController.ts` → `fundIdeaWithBayas` | `POST /api/ideas/:id/fund` |

**Thresholds (Pipeline A):**
- `relevanceThresholdMet` (10% tree points o 200 people equivalent)
- `quorumMet` (60% funders voted)
- `totalPeopleEquivalent` (×2 si >85% concentración)

**Weighted voting (Pipeline B):**
- `IdeaLike.weight` = influence(skill) × concentration(>85%)
- `likesCount` = suma ponderada de `IdeaLike.weight`

**Podium model (Pipeline C):**
- Top 3 ideas, promueve si #1 > 50% del total del podio
- Requiere `relevanceThresholdMet` AND `quorumMet`

**Timeouts (Pipeline D):**
- `quorumTimeoutCron.ts` — daily 03:00 UTC
- 14 días: notifica no-votantes
- 30 días: fuerza quorum

**Frontend:** `pages/NewNeed.tsx`, `components/NecesidadViews.tsx`, `components/IdeasPanel.tsx`, `components/IdeaModal.tsx`  
**Modelos:** `Need`, `NeedTree`, `NeedFunding`, `Idea`, `IdeaLike`, `Branch`, `BranchMember`, `BranchNeedVote`  
**Referencia:** `references/need-pipeline.md`  

### 1.3 Branches (Ramas — Unidades de ejecución)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Listar ramas | `controllers/branchController.ts` → `getBranches` | `GET /api/branches` |
| Cambiar fase | `controllers/branchController.ts` → `updateBranchPhase` | `PATCH /api/branches/:id/phase` |
| Unirse a fase | `controllers/branchController.ts` → `joinBranchPhase` | `POST /api/branches/:id/phases/:phase/join` |
| Tareas de rama | `controllers/branchController.ts` → `getBranchTasks` | `GET /api/branches/:id/tasks` |
| Crear rama hashtag | `controllers/branchController.ts` → `createHashtagBranch` | `POST /api/branches/hashtag` |
| Buscar hashtags | `controllers/branchController.ts` → `searchHashtagBranches` | `GET /api/branches/hashtags` |
| Votar en rama | `controllers/branchController.ts` → `voteBranchNeed` | `POST /api/branches/:id/vote` |
| Inyectar bayas | `controllers/branchController.ts` → `injectBerries` | `POST /api/branches/:id/inject-berries` |
| Eliminar rama | `controllers/branchController.ts` → `deleteBranch` | `DELETE /api/branches/:id` |

**Frontend:** `components/RamaViews.tsx`, `components/BranchModal.tsx`, `components/HashtagGovernanceModal.tsx`  
**Modelos:** `Branch`, `BranchMember`, `BranchPhase` enum, `BranchType` enum (NORMAL | HASHTAG)  
**Regla:** Ramas NORMAL solo por pipeline de gobernanza. Ramas HASHTAG directas por admin o propuestas por miembros.

### 1.4 Expert Endorsements (Avales entre pares)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Crear aval | `controllers/expertEndorsementController.ts` → `createEndorsementHandler` | `POST /api/expert-endorsements` |
| Resolver aval | `controllers/expertEndorsementController.ts` → `resolveEndorsementHandler` | `POST /api/expert-endorsements/:id/resolve` |
| Listar avales | `controllers/expertEndorsementController.ts` → `getEndorsementsHandler` | `GET /api/expert-endorsements` |
| Boost status | `controllers/expertEndorsementController.ts` → `getEndorsementBoostHandler` | `GET /api/expert-endorsements/boost` |

**Servicio:** `services/expertEndorsementService.ts`  
**Frontend:** `components/ExpertEndorsementPanel.tsx`, `components/SkillEndorsementPanel.tsx`  
**Modelo:** `ExpertEndorsement` (endorserId, endorsedId, expertise, status, boostApplied)  
**XP Boost:** +5% por aval, máximo 15%  

### 1.5 Autosustento (Sostenibilidad económica de ramas)
**Estado:** ✅ Completo

**Autosustento Ideas:**
| Endpoint | Método |
|---|---|
| Listar ideas | `GET /api/trees/:treeId/autosustento-ideas` |
| Crear idea | `POST /api/trees/:treeId/autosustento-ideas` |
| Obtener idea | `GET /api/autosustento-ideas/:ideaId` |
| Actualizar idea | `PATCH /api/autosustento-ideas/:ideaId` |
| Someter a revisión | `POST /api/autosustento-ideas/:ideaId/submit-review` |
| Aprobar idea | `POST /api/autosustento-ideas/:ideaId/approve` |
| Rechazar idea | `POST /api/autosustento-ideas/:ideaId/reject` |
| Archivar idea | `POST /api/autosustento-ideas/:ideaId/archive` |
| Convertir a rama | `POST /api/autosustento-ideas/:ideaId/convert-to-branch` |
| Apoyar | `POST /api/autosustento-ideas/:ideaId/support` |
| Remover apoyo | `DELETE /api/autosustento-ideas/:ideaId/support/:supportType` |
| Resumen apoyos | `GET /api/autosustento-ideas/:ideaId/support-summary` |

**Autosustento Branches:**
| Endpoint | Método |
|---|---|
| Listar ramas autosustento | `GET /api/trees/:treeId/autosustento-branches` |
| Crear rama | `POST /api/trees/:treeId/autosustento-branches` |
| Obtener rama | `GET /api/autosustento-branches/:branchId` |
| Config | `PATCH /api/autosustento-branches/:branchId/config` |
| Sustainability split | `PUT /api/autosustento-branches/:branchId/sustainability-split` |
| Someter revisión | `POST /api/autosustento-branches/:branchId/submit-review` |
| Aprobar | `POST /api/autosustento-branches/:branchId/approve` |
| Activar | `POST /api/autosustento-branches/:branchId/activate` |
| Pausar | `POST /api/autosustento-branches/:branchId/pause` |
| Cerrar | `POST /api/autosustento-branches/:branchId/close` |
| Rechazar | `POST /api/autosustento-branches/:branchId/reject` |
| Resumen financiero | `GET /api/autosustento-branches/:branchId/financial-summary` |

**Controllers:** `autosustentoIdeaController.ts` (12 funciones), `autosustentoBranchController.ts` (12 funciones)  
**Services:** `autosustentoIdeaService.ts`, `autosustentoBranchService.ts`, `sustainabilitySurplusService.ts`  
**Frontend:** `components/AutosustentoPanel.tsx`, `components/AutosustentoIdeasPanel.tsx`  
**Modelos:** `AutosustentoIdea`, `AutosustentoIdeaSupport`, `AutosustentoBranchConfig`, `SustainabilitySplit`  

### 1.6 Sustainability Cycles (Ciclos de sostenibilidad)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Calcular ciclo | `POST /api/autosustento-branches/:branchId/sustainability-cycles/calculate` |
| Listar ciclos | `GET /api/autosustento-branches/:branchId/sustainability-cycles` |
| Resumen | `GET /api/autosustento-branches/:branchId/sustainability-summary` |
| Obtener ciclo | `GET /api/sustainability-cycles/:cycleId` |
| Actualizar | `PATCH /api/sustainability-cycles/:cycleId` |
| Aprobar | `POST /api/sustainability-cycles/:cycleId/approve` |
| Bloquear | `POST /api/sustainability-cycles/:cycleId/lock` |
| Eliminar | `DELETE /api/sustainability-cycles/:cycleId` |
| Asignaciones | `POST /api/sustainability-cycles/:cycleId/allocations` |

**Controller:** `sustainabilityCycleController.ts` (9 funciones)  
**Service:** `sustainabilitySurplusService.ts`  
**Frontend:** `components/SustainabilityCyclePanel.tsx`  
**Modelos:** `SustainabilityCycle`, `SustainabilityAllocation`  

### 1.7 Golden Tickets & Elite System
**Estado:** ✅ Completo

**Controllers involucrados:** `taskController.ts` → `checkEliteForTask`, `calculateConsensusDifficulty`  
**Utils:** `utils/goldenTicketEngine.ts` (evaluateGoldenStreak, useGoldenTicket, getTicketStatus), `utils/eliteCalculator.ts` (computeSkillTier, canAssumeTask)  
**Modelos:** `UserSkillXP`, `DifficultyVote`, `DifficultyVoteLike`  
**Frontend:** `components/EstrellaDificultad.tsx`, `components/DifficultyVoteModal.tsx`  
**Regla:** 7 tareas consecutivas (dif 6-8, ≥80% auditoría) → Golden Ticket. Acceso a tareas críticas (dif 9-10). NO otorgan influencia en gobernanza.

### 1.8 Skill Influence System
**Estado:** ✅ Completo

**Cron:** `cron/skillInfluenceCron.ts` — daily 02:00 UTC + initial run on startup  
**Service:** `services/skillInfluenceService.ts` (calculateSkillInfluence, getInfluenceWeight, getTreeInfluences)  
**Modelo:** `SkillInfluence` (treeId, skillTag, greenAvgDifficulty, goldenAvgDifficulty, greenInfluence, goldenInfluence, finalInfluence)  
**Fórmula:** `influence = 20 + (avgDiff - 3) / 7 × 60`  
**Referencia:** `references/skill-influence-system.md`  

---

## 2. ECONOMICS — Sistema económico

### 2.1 Fiat Ledger (Contabilidad financiera)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Agregar transacción | `controllers/fiatController.ts` → `addTransaction` | `POST /api/fiat/transactions` |
| Transacciones del árbol | `controllers/fiatController.ts` → `getTransactions` | `GET /api/fiat/tree/:treeId` |
| Resumen financiero | `controllers/fiatController.ts` → `getFinancialSummary` | `GET /api/fiat/summary/:treeId` |
| Ledger summary | `controllers/fiatController.ts` → `getFiatLedgerSummaryController` | `GET /api/fiat/ledger-summary/:treeId` |
| EBITDA | `controllers/fiatController.ts` → `getEBITDA` | `GET /api/fiat/ebitda/:treeId` |
| Transacciones globales | `controllers/fiatController.ts` → `getGlobalTransactions` | `GET /api/fiat/global/transactions` |
| Resumen global | `controllers/fiatController.ts` → `getGlobalFinancialSummary` | `GET /api/fiat/global/summary` |
| Actualizar transacción | `controllers/fiatController.ts` → `updateTransaction` | `PUT /api/fiat/transactions/:id` |
| Eliminar transacción | `controllers/fiatController.ts` → `deleteTransaction` | `DELETE /api/fiat/transactions/:id` |
| Modo economía | `controllers/fiatController.ts` → `updateEconomyMode` | `PATCH /api/trees/:treeId/economy-mode` |

**Service:** `services/fiatLedgerService.ts`  
**Utils:** `utils/economicEngine.ts` (redistributeTreeBudget, calculateXpFromDifficulty), `utils/accountingTriggers.ts` (recordAutoTransaction, getTreeEBITDA)  
**Frontend:** `components/FinancialDashboard.tsx`, `components/TransactionModal.tsx`, `components/LedgerFiatPanel.tsx`  
**Modelo:** `FiatTransaction` (type, category, amount, verificationStatus, counterpartyType, periodicity)  
**Enums:** `TransactionType` (11 values), `TransactionCategory` (10 values), `FiatVerificationStatus` (6 values), `FiatCounterpartyType`, `FiatPeriodicity`, `CurrencyType`  

### 2.2 Branch OS Ledger (Contabilidad por rama)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Listar transacciones | `GET /api/trees/:treeId/ledger/fiat` |
| Crear transacción | `POST /api/trees/:treeId/ledger/fiat/transactions` |
| Resumen árbol | `GET /api/trees/:treeId/ledger/fiat/summary` |
| Resumen rama | `GET /api/branches/:branchId/ledger/fiat/summary` |
| Obtener transacción | `GET /api/ledger/fiat/transactions/:transactionId` |
| Actualizar | `PATCH /api/ledger/fiat/transactions/:transactionId` |
| Adjuntar recibo | `POST /api/ledger/fiat/transactions/:transactionId/receipt` |
| Certificar | `POST /api/ledger/fiat/transactions/:transactionId/certify` |

**Controller:** `branchOsLedgerController.ts` (8 funciones)  
**Service:** `branchOsLedgerService.ts`  

### 2.3 Fiat Templates (Plantillas de transacción)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Obtener plantillas | `GET /api/fiat/templates/:treeId` |
| Eliminar plantilla | `DELETE /api/fiat/templates/:id` |

**Controller:** `fiatTemplateController.ts`  
**Modelo:** `FiatTemplate`  

### 2.4 Berries Economy (Economía de bayas)
**Estado:** ✅ Completo (adaptado con threshold poblacional)

| Endpoint | Método |
|---|---|
| Config de bayas | `GET /api/trees/:treeId/berries/config` |
| Actualizar config | `PUT /api/trees/:treeId/berries/config` |
| Mi balance | `GET /api/trees/:treeId/berries/me` |
| Preview flujo mensual | `GET /api/trees/:treeId/berries/me/monthly-flow-preview` |
| Mis transacciones | `GET /api/trees/:treeId/berries/me/transactions` |
| Resumen del árbol | `GET /api/trees/:treeId/berries/summary` |
| Aplicar flujo mensual | `POST /api/trees/:treeId/berries/apply-monthly-flow` |

**Controller:** `berryFlowController.ts` (7 funciones)  
**Service:** `berryFlowService.ts` (getFederationMemberCount, applyMonthlyBerryFlowForTree/User, addBerryReward)  
**Utils:** `utils/berriesEngine.ts` (BERRIES_DECAY_RATE, BERRIES_CYCLE_HOURS, isBerriesUnlocked, calculateOxidation, syncBerriesBalance)  
**Frontend:** `components/BerryWalletPanel.tsx`  
**Modelos:** `BerryConfig`, `BerryTransaction`, `BerryMonthlyCycle`  
**Threshold:** `minMembersForBerries` (default 10000) — bloquea generación en micro-árboles. Federación vía `TreeRelation` bidireccional.

### 2.5 P2P Promises (Promesas entre pares)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Crear promesa | `POST /api/p2p/pledge` |
| Pago enviado | `POST /api/p2p/:id/payment-sent` |
| Pago recibido | `POST /api/p2p/:id/payment-received` |
| Cancelar promesa | `POST /api/p2p/:id/cancel` |
| Disputa / verificar strike | `POST /api/p2p/:id/dispute/verify-strike` |

**Controller:** `p2pPromiseController.ts` (5 funciones)  
**Modelo:** `PromiseP2P`  

### 2.6 Asset Funds (Fondos de activos)
**Estado:** ⚠️ Parcial — Solo POST, sin GET/UPDATE/DELETE

| Endpoint | Método |
|---|---|
| Agregar fondo | `POST /api/assets` |

**Controller:** `assetController.ts` (1 función: addAssetFund)  
**Modelo:** `AssetFund`, `AssetType` enum  

### 2.7 Bonus Pools (Bonos por desempeño)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Listar bonos | `GET /api/bonus` |
| Crear bono | `POST /api/bonus` |
| Votar bono | `POST /api/bonus/:id/vote` |
| Eliminar bono | `DELETE /api/bonus/:id` |

**Controller:** `bonusController.ts` (6 funciones, incluyendo recalculateBonusPercentages, getBonusMultiplierForTags)  
**Modelos:** `BonusPool`, `BonusVote`  

### 2.8 Cron: Economía mensual
**Archivo:** `cron/monthlyEconomy.ts`  
**Schedule:** Mensual  
**Función:** `startMonthlyJob`  

---

## 3. IDENTITY — Identidad y perfiles

### 3.1 Auth (Autenticación)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Registro | `controllers/authController.ts` → `register` | `POST /api/auth/register` |
| Login (email o username) | `controllers/authController.ts` → `login` | `POST /api/auth/login` |
| Perfil actual | `controllers/authController.ts` → `getMe` | `GET /api/auth/me` |
| Guest join | `controllers/authController.ts` → `guestJoin` | `POST /api/auth/guest-join` |
| Session token (cross-PWA) | `controllers/authController.ts` → `getSessionToken` | `GET /api/auth/session-token` |
| Cross-login (cross-PWA) | `controllers/authController.ts` → `crossLogin` | `POST /api/auth/cross-login` |

**Middleware:** `middleware/authMiddleware.ts` (authenticateJWT, optionalAuth, requireAdmin)  
**Frontend:** `pages/Login.tsx`, `pages/GuestJoin.tsx`, `store/authStore.ts`  

### 3.2 User Profiles (Perfiles de usuario)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Mi perfil | `controllers/userController.ts` → `getProfile` | `GET /api/users/profile` |
| Perfil público por código | `controllers/userController.ts` → `getPublicProfile` | `GET /api/users/public/:code` |
| Skill star chart | `controllers/userController.ts` → `getSkillStar` | `GET /api/users/skill-star` |
| Subir foto de perfil | `controllers/userController.ts` → `uploadProfilePic` | `POST /api/users/profile-pic` |
| Actualizar perfil público | `controllers/userController.ts` → `updatePublicProfile` | `PUT /api/users/public-profile` |
| Buscar usuarios | `controllers/userController.ts` → `searchUsers` | `GET /api/users/search` |
| Listar todos (admin) | `controllers/userController.ts` → `getAllUsers` | `GET /api/users` |
| Crear (admin) | `controllers/userController.ts` → `createUser` | `POST /api/users` |
| Actualizar (admin) | `controllers/userController.ts` → `updateUser` | `PUT /api/users/:id` |
| Eliminar (admin) | `controllers/userController.ts` → `deleteUser` | `DELETE /api/users/:id` |
| Derecho al olvido (GDPR) | `controllers/userController.ts` → `requestDataDeletion` | `POST /api/users/me/request-deletion` |

**Frontend:** `pages/TraceProfile.tsx`, `pages/PublicProfile.tsx`, `components/ProfilePage.tsx`, `components/SkillStarChart.tsx`  
**Modelo:** `User` (username, email, sharingCode, profilePic, publicProfileEnabled, visibleForRecruitment, seekingWork)  

### 3.3 Cross-PWA SSO (Single Sign-On entre PWAs)
**Estado:** ✅ Completo

**Backend:** `authController.ts` (getSessionToken → JWT 15min, crossLogin → JWT 7d)  
**Frontend:** `components/AppSwitcher.tsx`, `store/authStore.ts` → `crossLogin()`  
**App.tsx:** Intercepción de `?token` antes del redirect (lazy initializer `useState`)  
**Referencia:** `references/cross-pwa-sso.md`  

### 3.4 Contacts (Red de contactos)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Listar contactos | `GET /api/users/contacts` |
| Agregar contacto | `POST /api/users/contacts` |
| Listar contactos (legacy) | `GET /api/contacts` |
| Agregar (legacy) | `POST /api/contacts/add` |
| Generar token conexión | `POST /api/contacts/token` |
| Conectar vía token | `POST /api/contacts/connect` |
| Remover contacto | `DELETE /api/contacts/:id` |

**Controller:** `contactController.ts` (5 funciones), `userController.ts` → getContacts, addContact  
**Frontend:** `pages/ConnectPerson.tsx`, `components/MisPersonas.tsx`  
**Modelos:** `UserContact`, `ConnectionToken`  

---

## 4. SECURITY — Seguridad y privacidad

### 4.1 Auth Middleware
**Estado:** ✅ Completo

**Archivo:** `middleware/authMiddleware.ts`  
**Funciones:** `authenticateJWT` (Bearer token, JWT verify, `req.user = { id, role, isGuest }`), `optionalAuth`, `requireAdmin`  

### 4.2 Privacy Settings (Configuración de privacidad)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Obtener mis settings | `GET /api/privacy-settings/me` |
| Actualizar settings | `PUT /api/privacy-settings/me` |

**Controller:** `privacySettingsController.ts` (2 funciones)  
**Utils:** `utils/privacy.ts` (VISIBILITY_LEVELS, DEFAULT_PRIVACY_SETTINGS, canViewUserPrivacyLevel, redactTaskEvidenceFields)  
**Frontend:** `components/PrivacySettingsPanel.tsx` (5 niveles + talent search toggle + métricas agregadas + exportar perfil + derecho al olvido)  
**Ruta:** `/privacy` en los 4 PWAs (App.tsx)  
**Modelo:** `PrivacySettings` (traceProfileVisibility, taskHistoryVisibility, evidenceVisibility, showInTalentSearch, aggregateMetrics)  

### 4.3 Evidence File Security
**Estado:** ✅ Completo

**Archivo:** `utils/fileSecurity.ts`  
**Constantes:** `UPLOAD_ROOT`, `ALLOWED_UPLOAD_TYPES`, `BLOCKED_EXTENSIONS`  
**Funciones:** `ensureUploadRoot`, `sanitizeOriginalName`, `validateUploadFile`, `buildEvidenceStoragePath`, `resolveStoragePath`, `calculateSha256`, `verifyFileChecksum`, `canAccessEvidenceFile` (6 visibility levels), `toSafeEvidenceMetadata`  

**Visibility levels:** PUBLIC, TRUST_NETWORK, TREE_ONLY, TASK_PARTICIPANTS, PRIVATE (default desde May 2026), PUBLIC_METADATA  

**Endpoints:**
| Endpoint | Método |
|---|---|
| Metadata de evidencia | `GET /api/evidence/:evidenceId/metadata` |
| Verificar checksum | `POST /api/evidence/:evidenceId/verify-checksum` |
| Eliminar evidencia | `DELETE /api/evidence/:evidenceId` |
| Servir archivo | `GET /api/files/:fileId` |

**Controllers:** `fileController.ts` (4 funciones), `uploadController.ts` (uploadTaskEvidence, uploadEvidence)  
**Modelo:** `EvidenceFile`  

### 4.4 GDPR — Derecho al olvido
**Estado:** ✅ Completo

**Endpoint:** `POST /api/users/me/request-deletion`  
**Controller:** `userController.ts` → `requestDataDeletion`  
**Comportamiento:** Anonimiza cuenta (username → `deleted_<hex>`, email → `<rand>@deleted.trust`, limpia password, is_guest=true, privacy a PRIVATE)  
**Frontend:** `components/PrivacySettingsPanel.tsx` — botón "Derecho al olvido" con diálogo de confirmación  

### 4.5 Event Logging (Audit trail)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Mis eventos | `GET /api/event-logs/me` |
| Eventos del árbol | `GET /api/event-logs/tree/:treeId` |
| Eventos de entidad | `GET /api/event-logs/entity/:entityType/:entityId` |

**Controller:** `eventLogController.ts` (3 funciones)  
**Service:** `eventLogService.ts` (sanitizeForEventLog, getRequestContext, getRequestMetadata, logEvent)  
**Modelo:** `EventLog` (action, entityType, entityId, actorId, treeId, beforeJson, afterJson, metadataJson, severity, source)  
**Convención:** `ENTITY_ACTION` en SCREAMING_SNAKE_CASE (ej. `TASK_COMPLETED`, `EXPERT_ENDORSEMENT_CREATED`)  
**Cobertura:** 28/35 controllers tienen EventLog (May 2026)  

### 4.6 CORS + Security Headers
**Estado:** ✅ Completo

**Archivo:** `config/cors.ts` + `index.ts`  
**Headers:** X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, X-Permitted-Cross-Domain-Policies: none  
**Producción:** Strict-Transport-Security, CORS guard con exit(1) si sin orígenes explícitos  
**Dev:** LAN auto-allow (192.168.x.x, 10.x.x.x, 172.16-31.x.x), sin Origin → permitido  

### 4.7 Civic Audits (Auditoría cívica)
**Estado:** ✅ Completo

**Endpoint:** `POST /api/tasks/:id/civic-audit`  
**Controller:** `taskController.ts` → `submitCivicAudit`  
**Frontend:** `components/CivicAuditModal.tsx`  

### 4.8 Corruption Check (Cron anti-corrupción)
**Archivo:** `cron/corruptionCheck.ts`  
**Schedule:** Daily 03:00 UTC  
**Función:** `startCorruptionCheckCron`  

---

## 5. SOCIAL — Capa social y colaboración

### 5.1 Tree Membership (Membresía en árboles)
**Estado:** ✅ Completo

(Ver sección 1.1 — todos los endpoints de membresía están ahí)

**Modelo:** `TreeMember` (userId, treeId, status, role, xp, level, skills, weeklyNeedPoints, avalBanHasta)  

### 5.2 People & Network (Red social)
**Estado:** ✅ Completo

**Frontend:** `pages/People.tsx` (listado de personas en el árbol), `pages/TreeNetwork.tsx` (grafo de red)  
**Endpoint:** `GET /api/trees/network` → `treeController.getNetworkGraph`  

### 5.3 Notifications (Notificaciones)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Listar notificaciones | `GET /api/notifications` |
| No leídas | `GET /api/notifications/unread-count` |
| Marcar leída | `PATCH /api/notifications/:id/read` |
| Marcar todas leídas | `PATCH /api/notifications/read-all` |

**Controller:** `notificationController.ts` (5 funciones)  
**Frontend:** `components/NotificationCenter.tsx`  
**Modelo:** `Notification`  

### 5.4 Satisfaction Ratings (Satisfacción)
**Modelos:** `SatisfactionRating`, `SatisfaccionEvaluador`  

### 5.5 Feeds (Actividad social)
**Frontend:** `components/Feed.tsx`, `components/GlobalTaskFeed.tsx`, `components/BranchFeed.tsx`  
**Dashboard.tsx:** Integra Feed y BranchFeed en desktop  

---

## 6. LEGAL — Cumplimiento y auditoría

### 6.1 Audit Trail (EventLog)
(Ver sección 4.5)

### 6.2 Audits (Auditorías de gobernanza)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Auditoría de promoción | `GET /api/audits/promotion/:needId` |
| Auditoría de influencia | `GET /api/audits/influence/:treeId` |
| Auditoría de quorum | `GET /api/audits/quorum/:needId` |
| Auditoría de concentración | `GET /api/audits/concentration/:needId` |

**Controller:** `auditController.ts` (4 funciones)  
**Frontend:** `components/AuditPanel.tsx`  

### 6.3 GDPR Compliance
(Ver sección 4.4)

### 6.4 Task Audits (Auditoría de tareas)
**Endpoint:** `POST /api/tasks/:id/audit`  
**Controller:** `taskController.ts` → `submitAudit`  
**Modelo:** `Auditoria`  

### 6.5 Evidence Verification (Verificación de evidencia)
(Ver sección 4.3 — `verifyEvidenceChecksum`)

### 6.6 Data Export (Exportación de datos)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Exportar mi perfil | `GET /api/exports/me/profile` |
| Exportar árbol (JSON) | `GET /api/exports/tree/:treeId` |
| Exportar árbol (PDF) | `GET /api/exports/tree/:treeId/pdf` |

**Controller:** `exportController.ts` (3 funciones)  
**Services:** `services/exportService.ts` (sanitizeUserForExport, sanitizeEvidenceForExport, sanitizeEventLogForExport, canExportTree), `services/pdfExportService.ts` (generateTreePdf — PDF A4 con portada, resumen financiero, tabla de transacciones, roster de miembros)  
**Frontend:** `pages/TreeDetail.tsx` (botón Exportar Tree, solo visible para admin/creador), `lib/downloadExport.ts`  
**Rate-limit:** PDF 5/min por usuario  

---

## 7. RESOURCE — Recursos, tareas y talento

### 7.1 Tasks (Tareas)
**Estado:** ✅ Completo

| Endpoint | Archivos | Método |
|---|---|---|
| Tareas pendientes | `controllers/taskController.ts` → `getPendingTasks` | `GET /api/tasks/pending` |
| Crear tarea | `controllers/taskController.ts` → `createTask` | `POST /api/tasks` |
| Tarea express | `controllers/taskController.ts` → `createExpressTask` | `POST /api/tasks/express` |
| Asignar tarea | `controllers/taskController.ts` → `assignTask` | `POST /api/tasks/:id/assign` |
| Completar tarea | `controllers/taskController.ts` → `completeTask` | `POST /api/tasks/:id/complete` |
| Subir evidencia | `controllers/taskController.ts` → `approveTaskEvidence` | `POST /api/tasks/:id/evidence` |
| Aprobar evidencia | `controllers/taskController.ts` → `approveTaskEvidence` | `PUT /api/tasks/:id/approve-evidence` |
| Voto de dificultad | `controllers/taskController.ts` → `submitDifficultyVote` | `POST /api/tasks/:id/difficulty-vote` |
| Like en voto | `controllers/taskController.ts` → `toggleDifficultyVoteLike` | `POST /api/tasks/difficulty-votes/:voteId/like` |
| Elite check | `controllers/taskController.ts` → `checkEliteForTask` | `GET /api/tasks/:id/elite-check` |
| Auditoría | `controllers/taskController.ts` → `submitAudit` | `POST /api/tasks/:id/audit` |
| Auditoría cívica | `controllers/taskController.ts` → `submitCivicAudit` | `POST /api/tasks/:id/civic-audit` |

**Frontend:** `components/TaskComponents.tsx`, `components/TareaViews.tsx`, `components/TaskCompletionModal.tsx`, `components/ExpressTaskModal.tsx`, `components/PendingEvidenceList.tsx`  
**Modelos:** `Task`, `TaskTag`, `TaskVote`, `TaskQuestion`, `DifficultyVote`, `DifficultyVoteLike`  
**Utils:** `utils/consensusEngine.ts` (calculateConsensusValue), `utils/scoring.ts` (calculateBranchPointsForUser, calculateTaskPoints), `utils/resourceEngine.ts` (calculateStabilityIndex, resolveResourceAllocation)  

### 7.2 Deliverables (Entregables por fase)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Obtener entregable | `GET /api/deliverables/branches/:branchId/phases/:phase` |
| Entregar | `POST /api/deliverables/branches/:branchId/phases/:phase` |
| Calificar | `POST /api/deliverables/:id/rate` |
| Completar | `POST /api/deliverables/:id/complete` |

**Controller:** `deliverableController.ts` (4 funciones)  
**Modelo:** `PhaseDeliverable`  

### 7.3 Discovery (Descubrimiento de recursos)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Hashtags sugeridos | `GET /api/discovery/hashtags` |
| Buscar proveedores | `GET /api/discovery/providers` |
| Crear tarea request | `POST /api/discovery/request` |

**Controller:** `discoveryController.ts` (3 funciones)  

### 7.4 Skill XP & Percentiles
**Estado:** ✅ Completo

**Cron:** `cron/skillPercentile.ts` — hourly :15  
**Modelo:** `UserSkillXP` (compound unique: userId_skillTag_treeId)  

### 7.5 Skill Migration (Migración entre árboles)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Iniciar migración | `POST /api/migration/initiate` |
| Registrar tarea prueba | `POST /api/migration/:id/record-task` |
| Mis migraciones | `GET /api/migration/my` |
| Status externo | `GET /api/migration/foreign-status/:userId` |
| Tratados | `GET /api/migration/treaties` |
| Pretexto | `GET /api/migration/pretext/:migrationId` |

**Controller:** `migrationController.ts` (7 funciones)  
**Modelos:** `SkillMigration`, `TrustTreaty`  

### 7.6 Skill Proposals & Endorsements (Propuestas de skills)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Proponer skill | `POST /api/skills/propose` |
| Endosar propuesta | `POST /api/skills/endorse` |
| Registrar trial | `POST /api/skills/record-trial` |
| Listar propuestas | `GET /api/skills/proposals` |
| Mis propuestas | `GET /api/skills/my-proposals` |
| Info de fase | `GET /api/skills/phase` |

**Controller:** `skillController.ts` (6 funciones)  
**Modelos:** `SkillProposal`, `SkillEndorsement`  
**Utils:** `utils/genesisPhase.ts` (MIN_ESPECIALISTAS_PARETO, countSpecialists, getHashtagPhase, getRequiredEndorsements)  

### 7.7 Recruitment (Reclutamiento / Talent Hunter)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Buscar especialistas | `GET /api/recruitment/search` |
| Estado de acceso | `GET /api/recruitment/access-status` |
| Filtros | `GET /api/recruitment/filters` |
| Comprar pase | `POST /api/recruitment/purchase-pass` |
| Enviar invitación | `POST /api/recruitment/invite` |
| Mis invitaciones | `GET /api/recruitment/invitations` |
| Responder invitación | `POST /api/recruitment/invitations/:id/respond` |

**Controller:** `recruitmentController.ts` (7 funciones)  
**Frontend:** `pages/TalentHunter.tsx`  
**Modelos:** `SearchPass`, `InterviewInvitation`  

### 7.8 Cron: XP Decay & Material Fallback
- `cron/xpDecay.ts` → Sundays 00:30 UTC  
- `cron/materialFallback.ts` → periódico  
- `cron/weeklyResolution.ts` → Sundays 00:30 UTC  

---

## 8. TECHNICAL — Infraestructura técnica

### 8.1 Public Landing Metrics
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Métricas públicas | `GET /api/public/metrics` |

**Controller:** `publicController.ts` (1 función)  
**Cache:** 5 minutos in-memory, sin auth  
**Métricas:** totalTrees, totalMembers, totalFiatVolume, avgSatisfaction, topTrees  

### 8.2 Business Metrics
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Tasa de conversión | `GET /api/metrics/conversion-rate` |
| Engagement | `GET /api/metrics/engagement` |
| Actividad | `GET /api/metrics/activity` |
| Top skills | `GET /api/metrics/top-skills` |
| Distribución XP | `GET /api/metrics/xp-distribution` |

**Controller:** `metricsController.ts` (5 funciones)  

### 8.3 Map / Geo Discovery
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Descubrir árboles | `GET /api/geo/discovery` |
| Densidad de hotspots | `GET /api/geo/density` |
| Conectar árboles | `POST /api/geo/peering/connect` |

**Controllers:** `mapController.ts` (discoverTrees, getHotspotDensity), `peeringController.ts` (connectTrees)  

### 8.4 Tree Templates (Plantillas de árbol)
**Estado:** ✅ Completo

| Endpoint | Método |
|---|---|
| Listar plantillas | `GET /api/plantillas` |
| Crear plantilla | `POST /api/plantillas` |
| Eliminar plantilla | `DELETE /api/plantillas/:id` |

**Controller:** `plantillaArbolController.ts` (3 funciones)  
**Modelo:** `PlantillaArbol`  

### 8.5 Health Check
**Endpoint:** `GET /api/ping`  
**Route:** `pingRoutes.ts`  

### 8.6 Admin Dashboard (CRUD masivo)
**Estado:** ✅ Completo

**Endpoints:** CRUD completo de Users, Trees, Needs, Branches, Deliverables bajo `/api/admin`  
**Controller:** `adminController.ts` (18 funciones)  
**Frontend:** `pages/AdminDashboard.tsx` (solo Trust Lite)  

### 8.7 Alerta Zonal
**Modelo:** `AlertaZonal` — alertas geo-referenciadas  

### 8.8 Frontend Infrastructure

**Multi-flavor PWA system:**
| Flavor | Puerto | Ruta principal | Descripción |
|---|---|---|---|
| trust-lite | 5173 | `/` → Dashboard | Plataforma principal de gobernanza |
| branch-os | 5174 | `/` → BranchOSDashboard | Gestión operativa de ramas |
| trace-lite | 5175 | `/` → TraceProfile | Identidad y reputación |
| trust-insight | 5176 | `/` → TrustInsightDashboard | Radar cross-tree |
| trust-landing | 5177 | `/` → LandingPage | Landing pública corporativa |

**Archivos clave:** `App.tsx` (flavor-gated routing), `config/appConfig.ts` (isTrustLite, isBranchOS, isTraceLite, isTrustInsight, isTrustLanding), `vite.config.ts` (proxy /api → localhost:3000)  

**Componentes de infraestructura:**
- `MobileShell.tsx` — Shell PWA móvil (position:fixed; inset:0; metaballs bg; UtilityDrawer)
- `MetaballsBackground.tsx` — Fondo animado
- `UtilityDrawer.tsx` — Panel slide-up con matrix (Crear/Hacer/Medir)
- `MainLayout.tsx` — Layout desktop (header + sidebar + Outlet)
- `PWAInstallPrompt.tsx` — Captura evento beforeinstallprompt
- `OnboardingTour.tsx` — Tour guiado
- `QRScanner.tsx` — Escáner QR
- `Toast.tsx` — Notificaciones toast
- `OptimizedText.tsx` — Texto optimizado para renderizado
- `InvitationModal.tsx` — Modal de invitación
- `RegistroInvitadoModal.tsx` — Modal de registro invitado
- `GenericVoteModal.tsx` — Modal de votación genérica
- `TreePlaceholder.tsx` — Placeholder para secciones vacías

**Stores (Zustand):**
- `authStore.ts` — user, token, isAuthenticated, login, logout, fetchUser, crossLogin
- `matrixStore.ts` — entidadActiva, accionActiva (MobileShell matrix)
- `treeStore.ts` — Estado global de árboles

**Páginas por flavor:**
| Página | Trust Lite | Branch OS | Trace Lite | Trust Insight | Trust Landing |
|---|---|---|---|---|---|
| Dashboard | ✅ | — | — | — | — |
| BranchOSDashboard | — | ✅ | — | — | — |
| TraceProfile | — | — | ✅ | — | — |
| TrustInsightDashboard | — | — | — | ✅ | — |
| LandingPage | — | — | — | — | ✅ |
| TreeDetail | ✅ | — | — | — | — |
| TreeNetwork | ✅ | — | — | — | — |
| MyTreesList | ✅ | — | — | — | — |
| CreateTree | ✅ | — | — | — | — |
| NewNeed | ✅ | — | — | — | — |
| People | ✅ | — | — | — | — |
| AdminDashboard | ✅ | — | — | — | — |
| TalentHunter | — | — | ✅ | — | — |
| PublicProfile | — | — | ✅ | — | — |
| PrivacyPage | ✅ | ✅ | ✅ | ✅ | — |
| Login | ✅ | ✅ | ✅ | ✅ | — |
| GuestJoin | ✅ | ✅ | ✅ | ✅ | — |
| ConnectPerson | ✅ | ✅ | ✅ | ✅ | — |

---

## 9. EXTERNAL NEEDS & CANDIDATES — Necesidades externas y candidatos

### 9.1 External Needs (Necesidades externas)
**Estado:** ✅ Completo

**Controller:** `externalNeedController.ts` (33 funciones) — el controller más grande del sistema  
**Services:** `externalNeedService.ts`, `scopePreferenceService.ts`, `solutionProposalService.ts`  
**Modelos:** `ExternalNeed`, `ExternalAgent`, `ScopePreference`, `SolutionProposal`, `BudgetLine`  
**Frontend:** `components/ExternalNeedsPanel.tsx`  

**Endpoints clave:**
- CRUD de necesidades externas (7 endpoints)
- Agentes externos (3 endpoints)
- Scope preferences (5 endpoints)
- Solution proposals (16 endpoints: CRUD, submit, review, approve-tree, approve-client, select, reject, archive, budget lines)
- Budget lines (3 endpoints)
- Budget summary (1 endpoint)

### 9.2 External Candidates (Candidatos externos)
**Estado:** ✅ Completo — pipeline de 7 estados (APPLIED→VALIDATED)

| Endpoint | Método |
|---|---|
| Aplicar | `POST /api/external-candidates` |
| Listar | `GET /api/external-candidates` |
| Obtener | `GET /api/external-candidates/:id` |
| Revisar | `POST /api/external-candidates/:id/review` |
| Asignar evaluadores | `POST /api/external-candidates/:id/assign-evaluators` |
| Promover | `POST /api/external-candidates/:id/promote` |
| Iniciar prueba | `POST /api/external-candidates/:id/start-test` |
| Entregar prueba | `POST /api/external-candidates/:id/submit-test` |
| Completar prueba | `POST /api/external-candidates/:id/complete-test` |
| Rechazar | `POST /api/external-candidates/:id/reject` |
| Ver evaluación | `GET /api/external-candidates/:id/evaluation` |
| Mis evaluaciones | `GET /api/external-candidates/mine` |
| Evaluar | `POST /api/external-candidates/:id/evaluate` |

**Controller:** `externalCandidateController.ts` (13 funciones)  
**Service:** `externalCandidateService.ts` (matchEvaluators — multi-tree, Fisher-Yates, tree-diversity-aware; anonymizeCandidate; getMyEvaluations; submitEvaluation; getEvaluationStats)  
**Frontend:** `components/ExternalCandidatePanel.tsx` (admin: pipeline, per-evaluator tree badges), `components/EvaluatorDashboard.tsx` (evaluador: anónimo C-XXXX, votación)  
**Modelo:** `ExternalCandidate` (skills JSON, status enum APPLIED→VALIDATED 7 estados, evaluatorIds JSON, evaluatorMode, evaluatorVotes JSON, auditLevel)  
**Referencias:** `references/evaluator-matching.md`, `references/anonymized-evaluations.md`  

---

## 10. INSIGHT SIGNALS — Radar cross-tree

### 10.1 Insight Signals (Señales de insight)
**Estado:** ✅ Completo

**Controller:** `insightController.ts` (51 funciones) — el segundo controller más grande  
**Services:** `insightService.ts`, `insightInternalSearchService.ts`, `insightOpeningService.ts`, `insightCorporateReferralService.ts`  
**Modelos:** `InsightSignal`, `InsightInternalMatch`, `InsightExternalOpening`, `InsightExternalApplication`, `InsightCorporateReferral`  
**Frontend:** `components/InsightPanel.tsx`, `components/ExternalOpeningPanel.tsx`  

**Pipeline de insight:**
1. Crear señal → Activar → Internal Search (matching interno)
2. Si no hay match interno → Escalate to External People (openings externas)
3. Si no hay externos → Escalate to Corporate (referidos corporativos)
4. Resolver / Cancelar / Archivar

**Endpoints totales:** ~50 endpoints cubriendo:
- CRUD de señales (8 endpoints)
- Internal matches (8 endpoints: CRUD, suggest candidates, select, decline)
- External openings (18 endpoints: CRUD, open, close, pause, cancel, archive, mark enough/not enough, applications CRUD, review flow)
- Corporate referrals (7 endpoints: CRUD, contact, select, reject, cancel)
- Public endpoints (2: getPublicOpening, applyPublicly)

---

## Resumen Estadístico

| Categoría | Features | Endpoints | Estado |
|---|---|---|---|
| **Governance** | 8 | ~70 | ✅ Completo |
| **Economics** | 8 | ~35 | ✅ Completo (AssetFund parcial) |
| **Identity** | 4 | ~25 | ✅ Completo |
| **Security** | 8 | ~15 | ✅ Completo |
| **Social** | 5 | ~10 | ✅ Completo |
| **Legal** | 6 | ~10 | ✅ Completo |
| **Resource** | 7 | ~35 | ✅ Completo |
| **Technical** | 8 | ~15 | ✅ Completo |
| **External Needs** | 2 | ~45 | ✅ Completo |
| **Insight Signals** | 1 | ~50 | ✅ Completo |
| **TOTAL** | **57 features** | **~310 endpoints** | |

**Archivos totales inspeccionados:**
- 40 controllers (backend)
- 41 route files (backend)
- 19 services (backend)
- 8 cron jobs (backend)
- 11 utils (backend)
- 66 modelos Prisma + 66 enums
- 19 pages (frontend)
- 52 components (frontend)
- 3 stores (frontend)
- App.tsx (5 flavors)
- index.ts (38 route mounts)
