# PAY [3/4] — Razorpay + Mollie + Crypto/Stablecoins

> Research date: 2026-05-12. Solo hechos, sin recomendación (va en parte 4).

## Tabla comparativa

| Criterio | Razorpay (India) | Mollie (Europa) | Crypto/Stablecoins (USDC/USDT) |
|---|---|---|---|
| **Cobertura geográfica** | India (principal), Malasia, Singapur, EE.UU. Acepta pagos internacionales en 100+ monedas vía tarjetas internacionales. | 28 países europeos: Países Bajos, Bélgica, Alemania, Austria, Francia, UK, España, Italia, Portugal, Polonia, Rep. Checa, Eslovaquia, Hungría, Rumanía, Bulgaria, Croacia, Eslovenia, Grecia, Dinamarca, Suecia, Noruega, Finlandia, Islandia, Estonia, Letonia, Lituania, Suiza, Luxemburgo. | **Global, permissionless** (smart contracts). Con proveedores: Coinbase Commerce (100+ países), BitPay (229 países), NOWPayments (global). Restricción: países sancionados OFAC. |
| **Precio** | **2% + GST** por transacción (doméstico India). Sin setup fee, sin AMC, sin fee por refunds/settlement. Pay-as-you-go. Enterprise para >₹5 lakhs/mes. Internacional: ~3% + ₹3. | **Pay-per-transaction, sin cuota mensual** (online). Tarjetas EEA consumer: 1.80% + €0.25; EEA commercial: 2.90% + €0.25; Non-EEA: 3.25% + €0.25. iDEAL: €0.32 flat. SEPA DD: €0.35 flat. Klarna: 2.99%–4.99% + €0.35–0.45. Volume pricing >€100K/mes. | **0% comisión** (smart contract directo, solo gas fees ~$0.00025–$15 según red). Con proveedores: Coinbase Commerce 1%, NOWPayments 0.5%–1%, BitPay 1% + $0.25. |
| **API y DX** | SDK oficial: npm `razorpay`. Docs completas en razorpay.com/docs. Soporta REST API, webhooks, checkout embebido. GitHub activo, ejemplos en Node.js. Sandbox con test keys. | SDK oficial: npm `@mollie/api-client` (Node.js 14+, TypeScript). SDKs también en PHP, Ruby, Python. Docs excelentes en docs.mollie.com. Discord community + MollieGPT. Sandbox con test keys `test_xxx`. | ethers.js v6.16, web3.js v4.16, viem v2.48 (industry standard). Proveedores: Coinbase Commerce SDK npm `coinbase-commerce-node`, BitPay SDK npm `bitpay-sdk` v8.0.4. NOWPayments sin SDK oficial (REST directo). |
| **Suscripciones recurrentes** | **Sí** — Subscriptions API nativa. Planes, add-ons, ciclos de facturación configurables. Payment retries automáticos. Soportado en tarjetas, UPI Autopay, eMandate, NACH. Plugin WooCommerce. | **Sí** — Subscriptions API nativa. First payment + recurring. Variable amounts, on-demand charging. Webhooks de ciclo de vida. Métodos: tarjetas, SEPA Direct Debit, PayPal. | **Sí** (NOWPayments: producto `/crypto-subscriptions`). **Sí** (smart contracts: ERC-1337, Superfluid streams, Sablier, USDC permit pull-based). Coinbase Commerce y BitPay: **no** tienen suscripciones nativas. |
| **Merchant of Record** | **No** — PSP estándar. No maneja impuestos, VAT, o GST. El merchant retiene responsabilidad fiscal. | **No** — PSP licenciado por DNB (banco central holandés) y UK FCA. No actúa como MoR: no remite impuestos, no emite facturas en nombre del merchant, no toma título de bienes/servicios. | **No** — ningún proveedor crypto actúa como MoR. Los smart contracts son fully decentralized sin entidad legal que asuma responsabilidad fiscal. |
| **Payouts a usuarios** | **Sí** — vía RazorpayX (business banking). Payouts API para disbursements masivos a cuentas bancarias, UPI, tarjetas. Bulk transfers, vendor payments, TDS automation. | **Sí** — Business accounts incluyen SEPA transfers (100 gratis/mes, €0.20 extra). Mollie Connect para marketplaces: split payments y balance transfers. Mirakl integration. | **Sí** — BitPay Send (1%), NOWPayments Mass Payouts, smart contracts (directo programable, multicall batch sends, Superfluid streams). Coinbase Commerce: no payouts directos. |
| **Cripto/stablecoin nativo** | **No** — sin soporte crypto. Solo fiat: tarjetas, UPI, wallets, netbanking, BNPL, EMI. | **No** — sin soporte crypto. Solo fiat: tarjetas, transferencias, wallets (Apple/Google Pay, PayPal), BNPL (Klarna, Riverty, in3, Billie, Alma). | **Sí** — por definición. USDC, USDT (ERC-20, TRC-20, BEP-20, SOL, Polygon, Arbitrum, Optimism, Base), DAI, y 300+ tokens con NOWPayments. Smart contracts aceptan cualquier ERC-20/SPL. |
| **Facilidad integración Node.js/Express** | **Alta** — `npm i razorpay`. Instancia con key_id + key_secret. Promesas + callbacks. `instance.payments.fetch()`, `instance.subscriptions.create()`. Checkout redirect o modal embebido. Webhook signature verification. | **Alta** — `npm i @mollie/api-client`. Async/await nativo. `mollieClient.payments.create()` → redirect a checkout URL → webhook endpoint. Paginación, iteración, TypeScript declarations. | **Variable**: Smart contracts requieren ethers.js/viem + conocimiento blockchain (curva de aprendizaje). Proveedores simplifican: Coinbase Commerce (`coinbase-commerce-node`) y BitPay (`bitpay-sdk`) son plug-and-play similares a PSPs tradicionales. NOWPayments requiere REST directo con fetch/axios. |

## Notas adicionales

### Razorpay
- **Fortaleza**: Dominio absoluto en India. API madura. Precios transparentes sin costos ocultos. Suscripciones + payouts vía RazorpayX en un solo ecosistema.
- **Limitación**: Cobertura internacional limitada a 4 países con operación directa. Fuera de India, presencia mínima.
- **Internacional**: Acepta pagos con tarjetas internacionales (Visa/MC/Amex) en 100+ monedas con conversión automática a INR. Pricing internacional no publicado públicamente (varía por tipo de tarjeta y país de origen).
- **RazorpayX Payouts**: Producto separado de business banking. Permite enviar dinero a cualquier cuenta bancaria india, UPI ID, o tarjeta. API para bulk disbursements. GST-compliant invoicing automation.

### Mollie
- **Fortaleza**: Cobertura paneuropea sólida. Pricing competitivo en métodos locales (iDEAL €0.32 flat es imbatible). API moderna y bien documentada. Sin cuotas mensuales.
- **Limitación**: Exclusivamente Europa. Sin soporte crypto. No MoR. Dependencia de métodos de pago locales fragmentados (diferentes rates por método).
- **Métodos locales**: iDEAL (Países Bajos), Bancontact (Bélgica), SEPA Direct Debit, SEPA Bank Transfer, Cartes Bancaires (Francia) — rates significativamente más bajos que tarjetas.
- **Connect for Platforms**: API específica para marketplaces con split payments, balance management, y sub-merchant onboarding KYC.

### Crypto/Stablecoins
- **Fortaleza (smart contracts)**: 0% comisión, global permissionless, sin intermediario, máxima programabilidad. Fondos en custodia propia. Sin riesgo de deplatforming.
- **Limitación (smart contracts)**: Sin MoR — el merchant asume 100% de compliance fiscal. Sin chargeback protection. Curva de aprendizaje técnica alta. Gas fees variables. Sin soporte al cliente.
- **NOWPayments**: Mejor balance provider — solo 0.5% mono, suscripciones nativas, mass payouts, 300+ tokens. Punto débil: sin SDK oficial, docs menos pulidas.
- **BitPay**: Más compliant (NYDFS BitLicense), mejor para empresas US-regulated. No soporta USDT (!). 1% + $0.25.
- **Coinbase Commerce**: Simple, marca confiable, 1% flat. Sin suscripciones ni payouts. Bueno para pagos one-time.

---

*Fuentes: razorpay.com/pricing (JSON-LD), razorpay.com/docs, github.com/razorpay/razorpay-node, mollie.com/pricing, docs.mollie.com, github.com/mollie/mollie-api-node, coinbase.com/commerce, nowpayments.io, bitpay.com, developer.bitpay.com. Verificación: 2026-05-12.*
