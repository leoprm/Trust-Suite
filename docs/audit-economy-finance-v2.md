# Audit Economy & Finance → Trust Lite v2

**Auditor:** owl-alpha  
**Fecha:** 2026-05-12  
**Contexto:** Trust Lite v2 = paperclip meritocrático + open source + entrenable. Solo XP, niveles y puntos de necesidad. Monetización: suscripción mensual por hosted + API de IAs. Sin economía interna compleja.

---

## Tabla de decisiones

| # | Feature | Decisión | Justificación |
|---|---------|----------|---------------|
| 1 | **Need Points** (1000/mes, congelan al asignar, renovación) | **QUEDA** | Es el core de priorización colectiva. El mecanismo de congelamiento (puntos asignados se restan del pool hasta que la Need se resuelve) es correcto. Se puede simplificar quitando el multiplicador de concentración (>85% → ×2) y el peopleEquivalent, pero la esencia es sólida. |
| 2 | **Sedimentation / Base Needs** (12 meses + relevanceThresholdMet → BASE) | **ARCHIVAR** | Demasiado complejo para v2. Implica 12 meses de maduración, 2 ciclos trimestrales de revisión con threshold 66%, degradación automática, notificaciones. En un modelo meritocrático simple, la antigüedad no debería conferir estatus especial. Si una necesidad es relevante, recibirá puntos frescos. |
| 3 | **Fiat Ledger / Transactions** (INCOME, EXPENSE, INVESTMENT, etc.) | **ELIMINAR** | v2 no tiene economía fiat interna. Modelos a eliminar: `FiatTransaction`, `FiatTemplate`, `FiatCounterpartyType`, `FiatVerificationStatus`, `TransactionType`, `TransactionCategory`, `TreeExpense`. La monetización es externa (suscripción). |
| 4 | **Berries Economy** (population threshold 10000, Staged Ignition) | **ELIMINAR** | Economía paralela compleja con reducción mensual 10%, P2P transfers, recompensas por task/audit/level. El schema existe (`BerryConfig`, `BerryTransaction`, `BerryMonthlyCycle`) pero el código backend no lo implementa. Para v2: fuera. |
| 5 | **Trust Wallet** (wallet unificado fiat+berries+suscripciones) | **REEMPLAZAR** | El wallet actual maneja CLP (depósitos/retiros con aprobación admin, P2P transfers, locked balance). Para v2 solo se necesita: estado de suscripción (active/inactive/grace). Nada de balances monetarios. Modelo `UserWallet` se reemplaza por un campo `subscriptionTier` + `subscriptionExpiresAt` en User. |
| 6 | **TrustCore Fee Protocol** (fee dinámico en P2P) | **ELIMINAR** | Calcula fee dinámico basado en volumen mensual CLP y usuarios activos para transacciones P2P. Sin economía fiat interna ni P2P, no aplica. Modelos: `TrustCoreConfig`, `GlobalFeeConfig`, `FeeDistribution`, `feeEngine.ts`, `feeRecalculation.ts`. |
| 7 | **Escrow Trust-less** (graduated release, quorum 60%) | **ELIMINAR** | Escrow de pagos entre miembros con liberación por satisfacción (tiers 0-100%) y quorum ≥60%. Sin economía interna, no hay pagos que poner en escrow. Modelos: `MemberPayment` (PLEDGED→RELEASED), `escrowService.ts`, `releaseCron.ts`, `disputeService.ts`. |
| 8 | **Payment providers** (Khipu, Mercado Pago) | **QUEDA (como requisito nuevo)** | No están implementados en el código actual — solo existe el slot `WalletTransaction.providerTxId/providerPayload`. Para v2 hosted se necesita integración real con un provider de pagos chilenos (Khipu es buena opción) para cobrar suscripciones. Pero esto es capa de infraestructura, no de lógica de negocio del Tree. |
| 9 | **Billing / Subscription** (modelo actual: suscripción por árbol) | **REFORMULAR** | El modelo actual ata la suscripción al árbol (`Tree.financingMode=SUBSCRIPCION`, `TreeMember.subscriptionStatus`). Para v2 la suscripción es por acceso a la plataforma + IAs, no por membresía a un árbol. La máquina de estados ACTIVE→GRACE→SUSPENDED es útil pero debe estar a nivel usuario, no a nivel TreeMember. `subscriptionService.ts` es rescatable como base. |

---

## Resumen de eliminaciones

### Modelos de schema a eliminar completamente

| Modelo | Razón |
|--------|-------|
| `FiatTransaction` | Sin economía fiat interna |
| `FiatTemplate` | Sin transacciones fiat |
| `TreeExpense` | Sin tracking de gastos |
| `BerryConfig` | Sin economía de berries |
| `BerryTransaction` | Sin economía de berries |
| `BerryMonthlyCycle` | Sin economía de berries |
| `TrustCoreConfig` | Sin fee protocol |
| `GlobalFeeConfig` | Sin fee protocol |
| `FeeDistribution` | Sin fee protocol |
| `UserWallet` | Reemplazado por subscription tier en User |
| `WalletTransaction` | Sin wallet |
| `MemberPayment` | Sin escrow |
| `TreeTreasury` | Sin escrow |
| `PromiseP2P` | Sin economía P2P |

### Servicios a eliminar

- `src/services/baseNeedService.ts` (archivar lógica, no eliminar código — puede volver)
- `src/services/escrowService.ts`
- `src/services/disputeService.ts`
- `src/services/subscriptionService.ts` (reformular)
- `src/utils/feeEngine.ts`
- `src/utils/economicEngine.ts` (simplificar — solo XP pool)
- `src/cron/feeRecalculation.ts`
- `src/cron/releaseCron.ts`
- `src/cron/baseNeedReviewCron.ts`
- `src/cron/billingCron.ts`
- `src/cron/subscriptionCron.ts`

### Enums a eliminar

`TransactionType`, `TransactionCategory`, `FiatPeriodicity`, `FiatVerificationStatus`, `FiatCounterpartyType`, `PaymentStatus`, `WalletTransactionType`, `WalletTransactionStatus`, `WalletCurrency`, `BerryTransactionType`, `BerryCycleStatus`, `CurrencyType`, `PromiseStatus`

---

## ¿Qué necesita v2 en economía que NO existe actualmente?

1. **Suscripción a nivel plataforma (no por árbol):**
   - Modelo `Subscription` o campo en `User`: `subscriptionTier` (FREE, PRO, ENTERPRISE), `subscriptionExpiresAt`, `subscriptionStatus` (ACTIVE, GRACE, CANCELLED)
   - Planes con límites de uso de IAs (tokens/mes, requests/día)
   - Precios en CLP/USD

2. **Integración real con payment provider (Khipu):**
   - Webhook de pago confirmado → activar suscripción
   - Webhook de pago rechazado/fallido
   - Generación de URL de pago
   - No existe nada de esto hoy — solo el slot `providerTxId`

3. **API de IAs — tracking de uso para billing:**
   - Contador de tokens consumidos por usuario/árbol
   - Rate limiting por plan (Free: 100 req/día, Pro: 1000 req/día, etc.)
   - Endpoint de métricas de consumo

4. **Sistema de facturación:**
   - Generación de boletas/facturas (para Chile: boleta electrónica SII)
   - Historial de pagos
   - Exportación de recibos

5. **Freemium / Trial:**
   - Período de prueba gratuito (ej: 14 días)
   - Degradación automática a FREE al expirar

6. **XP & Levels simplificados:**
   - Actualmente XP viene de completar tareas con fórmula `xpPool × (0.20 + (diff-1) × 0.11) × bonusMultiplier`
   - Para v2: mantener el motor de XP pero simplificar la distribución del budget (actualmente 1000 fijo distribuido por peso ponderado de ramas)

---

## Observaciones del código real

- `economicEngine.ts` ya está etiquetado como "Trust Lite" (línea 7) — los devs ya pensaban en simplificar
- `monthlyNeedPointsService.ts` es limpio y bien documentado — rescatable tal cual
- `subscriptionService.ts` tiene buena máquina de estados pero acoplada a `TreeMember` — requiere refactor
- El `walletController.ts` tiene 1392 líneas con rate limiting, admin approval flow, P2P — es el componente más pesado a eliminar
- No hay referencias a Khipu ni MercadoPago en TODO el código — confirmado con search
- `BerryConfig.minMembersForBerries = 10000` es el "Staged Ignition" — las berries solo se activan al llegar a 10K miembros. Nunca se implementó la lógica de activación.
