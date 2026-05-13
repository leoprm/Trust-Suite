# Análisis Comparativo: Proveedores de Pago Globales para Trust Maker

> **Fecha**: Mayo 2026 | **Stack objetivo**: Node.js/Express | **Casos de uso**: Suscripciones (Free/Pro/Cloud), API pay-per-use, BYO API Keys → payouts a usuarios

---

## Tabla Comparativa

| Criterio | Stripe | Paddle | Lemon Squeezy | PayPal | Adyen | dLocal | Razorpay | Mollie | Crypto/Stablecoins |
|---|---|---|---|---|---|---|---|---|---|
| **Comisión base** | 2.9% + $0.30 | 5% + $0.50 | 5% + $0.50 | 3.49% + $0.49 (US) | €0.13 + interchange++ (~2.5–3%) | 3.5–5% (varía x país) | ~2% (India) / 3% (intl) | 1.8% + €0.25 (EU) | 0–1.5% |
| **Sobrecargo intl.** | +1.5% | Incluido | +1.5% | +1.5% | Variable | Incluido en tarifa local | +1% | +1.5% | N/A (global nativo) |
| **Tarifa mensual** | $0 (Billing: $620/mo o 0.7%) | $0 | $0 | $0–$30 | Enterprise (negociado) | Enterprise | $0 | $0 | $0 (hosting propio) |
| **MoR (impuestos)** | ❌ Add-on 3.5% (Managed Payments) | ✅ Completo (270+ jurisdicciones) | ✅ Completo | ❌ No | ❌ No | ✅ En LatAm/África | ❌ No (GST invoices sí) | ❌ No | ❌ No |
| **Suscripciones** | ✅ Stripe Billing (costo extra) | ✅ Incluido | ✅ Incluido | ✅ PayPal Subscriptions | ✅ Tokenización + recurrente | ✅ Tokenización | ✅ Razorpay Subscriptions | ✅ Recurring Payments | ⚠️ Limitado (NOWPayments tiene) |
| **Uso por consumo (meters)** | ✅ Meters API (nativo) | ✅ Pricing models | ✅ Usage Records API | ❌ No nativo | ✅ Vía API | ❌ Limitado | ❌ No nativo | ❌ No | ❌ No nativo |
| **Payouts a usuarios** | ✅ Stripe Connect (mejor-in-clase) | ❌ Solo al seller | ⚠️ Affiliate system (workaround) | ✅ PayPal Payouts API | ✅ Adyen for Platforms | ✅ dLocal for Platforms | ✅ Razorpay Payouts/Route | ⚠️ Split básico | ✅ BTCPay/OpenNode (nativo) |
| **Crypto/stablecoins** | ✅ USDC/USDT (1.5%) | ❌ | ❌ | ✅ PYUSD (no pay-in) | ❌ | ❌ | ❌ | ❌ | ✅ Nativo (BTC, USDC, USDT) |
| **Cobertura (vender a)** | 195 países | 200+ mercados | Todos (no sancionados) | 200+ países | 30+ mercados directos | 40+ LatAm/África/Asia | India + internacional | 15+ países Europa | Global |
| **Cobertura (cobrar en)** | 46+ países | 200+ (30 monedas) | 120+ (bank) / 200+ (PayPal) | 200+ países | 30+ monedas | 40+ países | India + selectos | Europa | Cualquier wallet |
| **LatAm calidad** | ⭐⭐⭐⭐⭐ (Pix, OXXO, etc.) | ⭐⭐⭐⭐ (Pix) | ⭐⭐⭐ (depende PayPal) | ⭐⭐⭐⭐ (bueno) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (nativo, líder) | ⭐ (no enfocado) | ⭐ (no opera) | ⭐⭐⭐ (on/off ramp) |
| **Node.js SDK** | ✅ `stripe` (4M+ semanal) | ✅ `@paddle/paddle-node-sdk` | ✅ `@lemonsqueezy/lemonsqueezy.js` | ✅ `@paypal/checkout-server-sdk` | ✅ `@adyen/api-library` | ⚠️ REST (no SDK oficial npm) | ✅ `razorpay` oficial | ✅ `@mollie/api-client` | ✅ ethers.js/viem, BTCPay Greenfield |
| **Calidad API/DX** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Dificultad integración** | 3/10 | 4/10 | 5/10 | 4/10 | 6/10 | 5/10 | 3/10 | 3/10 | 4–7/10 (varía) |
| **Ideal para** | Plataformas, marketplaces, crypto | SaaS que delega impuestos | Indie SaaS, creadores | Legacy, global simple | Enterprise | LatAm/Africa emergentes | India | Europa | Ethos open-source |

---

## Desglose por Proveedor

### 1. Stripe — El estándar de la industria

**Fortalezas para Trust Maker:**
- **Stripe Connect** es la única solución madura para el caso BYO API Keys → pagar a usuarios. Sin competencia real en esto.
- **Crypto nativo**: USDC/USDT al 1.5%, único MoR que lo ofrece.
- **Meters API**: facturación por uso de APIs de IA, nativo y maduro.
- **Ecosistema masivo**: SDKs, docs, comunidad, 99.999% uptime.
- **Cobertura LatAm sólida**: Pix (Brasil), OXXO (México), y más.

**Debilidades:**
- **No es MoR por defecto**: los impuestos son responsabilidad tuya. Managed Payments (+3.5%) lo resuelve pero con costo.
- **Billing cuesta extra**: $620/mes o 0.7% pay-as-you-go.
- **Complejidad**: más piezas móviles que Paddle o Lemon Squeezy.

**Ficha técnica:**
- Base: 2.9% + $0.30 | Intl: +1.5% | FX: +1%
- Crypto: 1.5% | Disputas: $15
- SDK: `stripe` (npm, 4M+ weekly)
- Docs: docs.stripe.com

---

### 2. Paddle — MoR sin complicaciones

**Fortalezas para Trust Maker:**
- **MoR completo**: Paddle calcula, recauda y remite VAT/GST en 270+ jurisdicciones. Cero liability fiscal para Trust Maker.
- **All-in-one pricing**: 5% + $0.50 cubre TODO (procesamiento, impuestos, fraude, chargebacks, dunning, billing, soporte 24/7).
- **Paddle Retain**: ML-optimized dunning para reducir churn.
- **Buenas docs y SDK Node.js** (`@paddle/paddle-node-sdk`).
- **Sin costos ocultos**: sin monthly fees, sin setup fees.

**Debilidades:**
- **Sin payouts a usuarios**: Paddle solo paga al seller. No hay equivalente a Stripe Connect. El caso BYO API Keys requeriría otro proveedor para los payouts.
- **Sin crypto**: no hay soporte de stablecoins.
- **5% puede ser alto** a escala (Stripe 2.9% + costos extra puede ser más barato arriba de cierto volumen).
- **Custom pricing** solo para >$2M ARR o productos <$10.

**Ficha técnica:**
- Base: 5% + $0.50 (todo incluido)
- MoR: Sí (270+ jurisdicciones)
- SDK: `@paddle/paddle-node-sdk`
- Docs: developer.paddle.com

---

### 3. Lemon Squeezy — Creador-friendly, ahora subsidiaria de Stripe

**Fortalezas para Trust Maker:**
- **MoR completo**: igual que Paddle, manejan impuestos.
- **Affiliate system**: podría adaptarse creativamente para BYO API Keys (no es ideal pero es posible).
- **License key management**: diferenciador para software.
- **Adquirido por Stripe (2024, completado 2025)**: opera como subsidiaria independiente sobre infraestructura Stripe → acceso a los métodos de pago de Stripe manteniendo la capa MoR.
- **Node.js SDK oficial**: `@lemonsqueezy/lemonsqueezy.js` — mejoró desde la adquisición.

**Debilidades:**
- **Sobrecargos**: +1.5% intl, +1.5% PayPal, +0.5% suscripciones → la tarifa efectiva sube rápido.
- **LatAm débil**: depende mucho de PayPal para payouts en la región.
- **Sin payouts a terceros**: el affiliate system es un workaround, no reemplaza Stripe Connect.
- **Incertidumbre de roadmap a largo plazo** como subsidiaria de Stripe.

**Ficha técnica:**
- Base: 5% + $0.50 | +1.5% intl | +1.5% PayPal | +0.5% subs
- MoR: Sí
- SDK: `@lemonsqueezy/lemonsqueezy.js` (oficial Node.js)
- Docs: docs.lemonsqueezy.com

---

### 4. PayPal — Legacy global

**Fortalezas:**
- **Ubicuidad**: 400M+ usuarios activos. Mucha gente ya tiene PayPal.
- **Payouts API**: funcional para pagar usuarios (aunque más limitado que Stripe Connect).
- **Cobertura masiva**: 200+ mercados.

**Debilidades:**
- **API inferior**: la calidad de SDK y docs está por debajo de Stripe/Paddle.
- **Sin MoR**: tú manejas impuestos.
- **Suscripciones limitadas**: PayPal Subscriptions es menos flexible que Stripe Billing.
- **Reputación**: disputes frecuentes, congelación de fondos, UX inconsistente.
- **Sin meters/usage-based billing**.

**Ficha técnica:**
- Base: 3.49% + $0.49 (US) | Intl: +1.5%
- MoR: No
- SDK: `@paypal/checkout-server-sdk`
- Docs: developer.paypal.com

---

### 5. Adyen — Enterprise-grade

**Fortalezas:**
- **Interchange++**: pricing transparente, puede ser más barato a alto volumen.
- **Métodos de pago locales masivos**: Blik, iDEAL, Pix, etc.
- **RevenueProtect**: anti-fraude ML avanzado.
- **Adyen for Platforms**: marketplace payouts.

**Debilidades:**
- **Enterprise solamente**: requiere volumen significativo para onboarding.
- **Sin MoR**: no manejan impuestos.
- **Complejidad alta**: integración 6/10, documentos densos.
- **Overkill para early-stage SaaS**.

**Ficha técnica:**
- Base: €0.13 processing + interchange (0.6–3.95%) + scheme fees
- Efectivo típico: 2.5–3% blended en EU
- MoR: No
- SDK: `@adyen/api-library` (Node.js)
- Docs: docs.adyen.com

---

### 6. dLocal — Rey de mercados emergentes

**Fortalezas:**
- **MoR en LatAm/África**: manejan impuestos locales, compliance, y métodos de pago locales (Pix, OXXO, PSE, etc.).
- **Payouts a usuarios**: dLocal for Platforms.
- **Experiencia local**: conocen cada mercado profundamente.

**Debilidades:**
- **Enterprise sales-driven**: pricing no público, proceso de onboarding.
- **Sin Node.js SDK oficial**: community packages.
- **No cubre EU/US directamente**: necesitarías otro proveedor para esos mercados.
- **Sin crypto**.

**Ficha técnica:**
- Base: 3.5–5% (negociado)
- MoR: Sí (LatAm/África)
- SDK: Community Node.js
- Docs: docs.dlocal.com

---

### 7. Razorpay — India specialist

**Fortalezas:**
- **India nativo**: UPI, RuPay, NetBanking — lo que necesitas para el mercado indio.
- **Razorpay Subscriptions**: sólido para recurring.
- **Node.js SDK oficial**: bien mantenido, buena documentación.
- **Payouts API + Route**: funcional para pagar usuarios en India.

**Debilidades:**
- **India-focus**: limitado fuera de India.
- **Sin MoR**.
- **Sin crypto**.
- **No compite globalmente**: es complemento, no solución principal.

**Ficha técnica:**
- Base: ~2% (India) / 3% (intl)
- MoR: No (GST invoices sí)
- SDK: `razorpay` (npm)
- Docs: razorpay.com/docs

---

### 8. Mollie — Europa simple

**Fortalezas:**
- **Excelente DX**: Node.js SDK oficial, documentación clara, fácil integración.
- **Métodos de pago europeos**: iDEAL, Bancontact, SOFORT, etc.
- **Recurring payments**: soporte nativo.
- **Precios competitivos**: 1.8% + €0.25 para EU cards.

**Debilidades:**
- **Solo Europa**: 15+ países. No sirve para LatAm, Asia, o África.
- **Sin MoR**.
- **Sin payouts avanzados**: splits básicos solamente.
- **Sin crypto**.
- **No es solución global**: complemento regional.

**Ficha técnica:**
- Base: 1.8% + €0.25 (EU) | Intl: +1.5%
- MoR: No
- SDK: `@mollie/api-client`
- Docs: docs.mollie.com

---

### 9. Crypto/Stablecoins — La opción descentralizada

#### BTCPay Server (self-hosted, open-source)
- ⚡ **Alineación total con Trust Maker**: open-source, self-hosted, sin intermediarios.
- 💰 **0% comisión**: solo network fees (Lightning ~0%, on-chain varía).
- 🌍 **Global nativo**: sin restricciones geográficas.
- 📤 **Payouts nativos**: Pull Payments para pagar usuarios.
- ⚠️ **Sin MoR**: tú eres responsable de impuestos, compliance, KYC.
- ⚠️ **Sin fiat settlement**: debes convertir manualmente vía exchange.
- ⚠️ **Sin suscripciones nativas**: debes construir la lógica de recurring.
- 🛠️ **Greenfield API** + `btcpayserver-node-client`.

#### OpenNode (Bitcoin/Lightning)
- 1% on-chain, 0.5% Lightning | Payouts API | Auto-convert a fiat

#### NOWPayments (multi-crypto)
- 0.5% crypto settlement | Recurring payments ✅ | 300+ monedas | Auto-convert a fiat

#### Coinbase Commerce (multi-coin)
- 0% fee (spread en conversión) | USDC nativo | SDK Node.js | Sin recurring nativo

**Trade-off fundamental**: Crypto es filosóficamente perfecto para Trust Maker (open-source, descentralizado, sin permisos). Pero en la práctica: adopción de usuarios limitada, sin manejo de impuestos automatizado, y los usuarios finales raramente pagan con crypto (encuestas consistentemente muestran <2% de preferencia de pago en crypto para SaaS).

---

## Recomendación para Trust Maker

### 🥇 Recomendación principal: **Stripe** + **Paddle** (dual-provider estratégico)

Trust Maker debería implementar **dos proveedores**, no uno solo:

| Caso de uso | Proveedor | Por qué |
|---|---|---|
| **Suscripciones core** (Free/Pro/Cloud) | **Paddle** | MoR → cero liability fiscal. 5% all-in más barato que Stripe + Billing + Tax + Managed Payments para early stage. Setup más simple. |
| **API pay-per-use** (uso de IAs) | **Stripe** | Meters API es el único maduro para usage-based billing. Stripe Connect necesario para payouts. |
| **BYO API Keys → payouts** | **Stripe Connect** | Sin alternativa real. Lemon Squeezy affiliate es un workaround frágil. PayPal Payouts es inferior. |
| **Crypto/stablecoins** | **Stripe Crypto** (USDC/USDT) o **BTCPay** complementario | Stripe Crypto si quieres simplicidad. BTCPay como add-on si el ethos open-source pesa más. |

### Lógica de la recomendación

1. **No existe un solo proveedor que cubra todo.** Stripe es el más cercano, pero requiere add-ons costosos para MoR ($620/mo Billing + 3.5% Managed Payments + Tax → costo total >6% efectivo). Paddle cubre suscripciones perfectamente pero no tiene payouts a usuarios ni crypto.

2. **Paddle para el 80% del revenue** (suscripciones recurrentes), **Stripe Connect para el 20% estratégico** (payouts BYO API Keys + crypto).

3. **Alternativa simplificada: Stripe-only con Managed Payments** si el volumen justifica el costo extra del 3.5% MoR y $620/mo de Billing. Esto unifica todo en una sola integración pero es más caro.

### 🥈 Plan B: Stripe-only (cuando el volumen lo justifique)

Si Trust Maker alcanza escala donde 5% de Paddle > 2.9% + add-ons de Stripe:
- Stripe Payments (2.9% + $0.30)
- Stripe Billing (0.7% pay-as-you-go)
- Stripe Tax ($90/mo o $0.50/transacción)
- Stripe Managed Payments (3.5% add-on para MoR)
- Stripe Connect (para payouts)
- Stripe Crypto (1.5% para stablecoins)

**Punto de crossover**: aproximadamente $50K–100K MRR donde Stripe se vuelve más barato que Paddle 5%.

### 🥉 No recomendados como principal

| Proveedor | Razón |
|---|---|
| **Lemon Squeezy** | SDK Node.js ya existe pero sigue con muchos sobrecargos (+1.5% intl, +1.5% PayPal, +0.5% subs). Incertidumbre como subsidiaria de Stripe. Sin payouts a terceros. |
| **PayPal** | Legacy, API inferior, sin MoR, sin meters, reputación de disputes. Solo como método de pago adicional dentro de Stripe/Paddle. |
| **Adyen** | Enterprise only, overkill para SaaS early/mid-stage. |
| **dLocal** | Excelente para LatAm pero no cubre EU/US. Complemento, no principal. |
| **Razorpay** | Solo India. Complemento. |
| **Mollie** | Solo Europa. Complemento. |
| **Crypto-only** | Hermoso filosóficamente pero inviable como solución única: sin MoR, sin suscripciones nativas, adopción <2%. |

---

## Complejidad de Implementación (Node.js/Express) — Top 3

### 1. Stripe — Complejidad: Media (5/10)

| Fase | Tareas | Tiempo estimado |
|---|---|---|
| **Setup inicial** | `npm i stripe`, webhook secret, API keys (.env) | 30 min |
| **Checkout básico** | `stripe.checkout.sessions.create()`, redirect, success/cancel URLs | 2–4 h |
| **Webhooks** | `stripe.webhooks.constructEvent()` con signature verification, idempotencia, manejo de `payment_intent.succeeded`, `checkout.session.completed` | 4–6 h |
| **Suscripciones** | Products + Prices en dashboard, `stripe.subscriptions.create()`, customer portal (`billingPortal.sessions.create()`) | 1 día |
| **Meters API** (usage-based) | `stripe.billing.meterEvents.create()`, agregación de eventos, facturación por consumo | 1–2 días |
| **Stripe Connect** (BYO → payouts) | `stripe.accounts.create({type: 'express'})`, account links onboarding, `stripe.transfers.create()`, dashboard Connect | 3–5 días |
| **Crypto** (USDC/USDT) | Endpoint específico con `crypto` payment method type, settlement en fiat o USDC | 1 día |
| **Total full-stack** | Checkout + Subscriptions + Meters + Connect + Crypto | **2–3 semanas** |

**Archivos clave esperados:**
- `src/payments/stripe.ts` — cliente singleton
- `src/payments/webhook-handler.ts` — router Express para webhooks
- `src/payments/checkout.ts` — creación de sesiones
- `src/payments/connect.ts` — onboarding + payouts
- `src/payments/meters.ts` — event ingestion para usage-based

**Pitfalls principales:**
- Webhook signature verification obligatorio — sin esto, cualquiera puede falsificar eventos
- Idempotencia con `Idempotency-Key` en transfers (Stripe Connect) para evitar doble payout
- Manejar `account.updated` webhooks para saber cuándo un usuario completó onboarding Connect
- La API de Stripe usa snake_case; mantener consistencia con el resto del codebase (camelCase)

### 2. Paddle — Complejidad: Baja-Media (3/10)

| Fase | Tareas | Tiempo estimado |
|---|---|---|
| **Setup inicial** | `npm i @paddle/paddle-node-sdk`, API key, sandbox environment | 20 min |
| **Checkout** | `paddle.products.list()`, `paddle.prices.list()`, `paddle.transactions.create()`, Paddle.js overlay en frontend | 2–3 h |
| **Suscripciones** | Price + Product creation via dashboard o API, `paddle.subscriptions.list()`, `paddle.subscriptions.update()` para cambios de plan | 4–6 h |
| **Webhooks** | `paddle.webhooks.unmarshal()` con `secret_key`, eventos `transaction.completed`, `subscription.updated`, `subscription.canceled` | 2–3 h |
| **Customer portal** | Paddle ya provee UI hosted para gestión de suscripciones del cliente (sin build) | 0 h |
| **Total (todo)** | Checkout + Subscriptions + Webhooks | **1–2 días** |

**Archivos clave esperados:**
- `src/payments/paddle.ts` — cliente singleton
- `src/payments/paddle-webhooks.ts` — manejo de eventos
- Frontend: `<script src="https://cdn.paddle.com/paddle/v2/paddle.js">` + `Paddle.Checkout.open()`

**Pitfalls principales:**
- Paddle no tiene payouts a usuarios — para BYO API Keys necesitarás Stripe Connect en paralelo
- El pricing 5% + $0.50 es all-in pero el settlement es semanal/mensual (no instantáneo como Stripe)
- La API de Paddle usa IDs con prefijo (`pri_`, `pro_`, `txn_`, `sub_`) — familiarizarse con el sistema de entidades
- Sandbox de Paddle es completo pero los webhooks tienen delay en sandbox (usar `paddle.notifications.replay()` para testing)

### 3. dLocal — Complejidad: Media (5/10)

| Fase | Tareas | Tiempo estimado |
|---|---|---|
| **Setup inicial** | Contacto con ventas (enterprise), API keys, sandbox access | 2–5 días (onboarding) |
| **Pay-in (cobrar)** | `POST /payments` con método local (Pix, tarjeta, OXXO, etc.), redirect/iframe | 1–2 días |
| **Pay-out (BYO)** | `POST /payouts` a cuentas bancarias locales, billeteras (Pix), cash pickup | 2–3 días |
| **Webhooks** | `payment.authorized`, `payment.paid`, `payout.completed` — endpoint Express con signature HMAC | 4–6 h |
| **Métodos locales** | Pix (Brasil): QR code + copy-paste. OXXO (México): voucher. PSE (Colombia): redirect bancario. Cada método tiene su propio flujo de UI. | 3–5 días (multi-método) |
| **Total multi-país** | Pay-in + Pay-out + 5+ métodos locales en 3+ países | **2–3 semanas** |

**Archivos clave esperados:**
- `src/payments/dlocal.ts` — cliente REST (sin SDK oficial → fetch/axios con tipado manual)
- `src/payments/dlocal-webhooks.ts`
- `src/payments/dlocal-payouts.ts`

**Pitfalls principales:**
- Sin SDK oficial Node.js — integración es REST pura con `fetch`/`axios`. Debes manejar tipado manualmente
- Flujos de UI distintos por método de pago (QR vs redirect vs voucher) — no unificado como Stripe Checkout
- Tarifas no públicas — el pricing es parte del contrato enterprise negociado
- Webhooks usan HMAC con `X-DLocal-Signature` — diferente del esquema de Stripe/Paddle
- Ideal como complemento LatAm, no como proveedor principal (no cubre EU/US)

### Resumen de complejidad

| Proveedor | SDK | Tiempo total | Archivos | Riesgo principal |
|---|---|---|---|---|
| **Stripe** | `stripe` (4M+/sem) | 2–3 semanas | ~6 archivos | Conectar bien los webhooks + idempotencia en transfers |
| **Paddle** | `@paddle/paddle-node-sdk` | 1–2 días | ~3 archivos | Sin payouts — requiere Stripe Connect en paralelo |
| **dLocal** | REST (sin SDK npm) | 2–3 semanas | ~4 archivos | Onboarding enterprise + sin SDK oficial |

---

## Próximos pasos sugeridos

1. **Abrir cuenta sandbox en Paddle** (developer.paddle.com) — probar integración de suscripciones.
2. **Abrir cuenta sandbox en Stripe** (dashboard.stripe.com) — probar Connect + Meters API.
3. **Crear POC**: endpoint de checkout con Paddle + endpoint de payout con Stripe Connect.
4. **Evaluar BTCPay Server** como add-on opcional para pagos crypto (alineado con ethos open-source, sin costo de comisiones).
5. **Decidir en 3–6 meses** si consolidar en Stripe-only o mantener dual-provider.

---

*Investigación: Mayo 2026. Fuentes: stripe.com/pricing, paddle.com/pricing, docs.lemonsqueezy.com, developer.paypal.com, docs.adyen.com, dlocal.com, razorpay.com, mollie.com, btcpay.org, opennode.com, nowpayments.io, coinbase.com/commerce. Verificar precios antes de integrar — pueden cambiar.*
