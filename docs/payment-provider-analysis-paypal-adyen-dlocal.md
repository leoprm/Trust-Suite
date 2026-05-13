# Payment Provider Analysis — Part 2/4: PayPal, Adyen, dLocal

> Research date: May 2026
> Sources: Official pricing pages (paypal.com, adyen.com, dlocal.com), developer docs, public documentation.
> No recommendation — facts only. Recommendation in Part 4.

## Comparison Table

| Criterio | PayPal | Adyen | dLocal |
|---|---|---|---|
| **Cobertura geográfica** | 200+ mercados. Presencia global, pero con disponibilidad de features variable por país. | Global (cobertura de tarjetas en prácticamente todos los países). 250+ métodos de pago locales. Fuerte en EU, NA, APAC. LatAm con cobertura parcial pero creciente. | 40+ países en mercados emergentes: LatAm (AR, BR, CL, CO, MX, PE, UY, etc.), África (NG, KE, ZA, EG, MA, etc.), Asia (IN, ID, PH, CN, BD, etc.). **Especialista en LatAm.** |
| **Precio (% + fee fijo)** | Doméstico (US): 3.49% + $0.49 (PayPal Checkout), 2.99% + $0.49 (tarjetas directas). Internacional: +1.50% cross-border + fixed fee variable por región. Micropagos: 5% + $0.05. Tarifas publicadas, predecibles. | Interchange++: $0.13 processing fee + interchange (varía por tarjeta) + 0.60% adquirente. APMs: 1.30%–4.50% según método. Sin fee fijo adicional en la mayoría de métodos. Precios por volumen negociable (contratos enterprise). | Pricing no público — requiere contacto con ventas. Típicamente 3%–5% según mercado y método. Fee fijo varía por país. Modelo "all-in" que incluye procesamiento local + FX. Negociable por volumen. |
| **API y DX** | REST API madura. SDK oficial para Node.js (`@paypal/checkout-server-sdk`). Documentación extensa en developer.paypal.com. Sandbox completo. Curva de aprendizaje baja-media. | REST API de grado enterprise. SDK oficial Node.js (`@adyen/api-library` v18+). Documentación excelente (docs.adyen.com) con guías interactivas, Postman collections, y playground. La mejor DX de los 3. | REST API. SDK oficial Node.js (`dlocal-js`). Documentación en docs.dlocal.com — adecuada pero menos pulida que Adyen. Sandbox disponible. API simple con conceptos claros (pay-in, pay-out). |
| **Suscripciones recurrentes** | Sí, nativo. PayPal Subscriptions API (planes, ciclos de facturación, trials, prorrateo). También vía Braintree (tokenización de tarjeta + billing agreements). Webhooks para eventos del ciclo de vida. | Sí, nativo. Tokenización + recurring payments. Soporte para suscripciones con tarjeta y métodos locales donde aplica. API de tokenización robusta. Soporta MIT (Merchant Initiated Transactions) y CIT (Customer Initiated). | Sí, vía tokenización. Soporta pagos recurrentes con tarjeta y métodos locales (ej: PIX recurrente en Brasil). Menos features que PayPal/Adyen en gestión de planes (no tiene motor de suscripciones nativo — se maneja con token + cron propio). |
| **Merchant of Record** | **No.** PayPal es payment facilitator. El merchant es responsable de impuestos/VAT/GST. PayPal retiene fondos en disputas pero no maneja obligaciones fiscales del merchant. | **No.** Adyen es adquirente/procesador. El merchant es el MoR y responsable de tax compliance en cada jurisdicción. | **Parcial.** En algunos mercados LatAm, dLocal actúa como MoR local (ej: Brasil, Argentina con regulaciones cambiarias), manejando retenciones impositivas locales. No cubre VAT/GST global. Es el más cercano a MoR de los tres. |
| **Payouts a usuarios** | Sí. PayPal Payouts API permite envíos masivos a cuentas PayPal (hasta 15,000 por lote). Hyperwallet (adquirido por PayPal) para payouts a cuentas bancarias locales en 200+ países. Escenario BYO API keys: el usuario recibe payout a su PayPal/bank account. | Sí. Adyen Payouts permite envíos a tarjetas y cuentas bancarias en 100+ países. Marketplace/Platform model con split de fondos. Soporta BYO: el creador recibe payout directo a su método de cobro preferido. | Sí, core feature. dLocal Pay-outs a cuentas bancarias locales, billeteras (PIX en Brasil, UPI en India), y cash pickup en puntos de pago. Especialmente fuerte en LatAm donde los rails bancarios tradicionales son limitados. |
| **Cripto/stablecoin nativo** | **Sí.** PayPal Checkout with Crypto (BTC, ETH, LTC, BCH). PYUSD stablecoin nativa (PayPal USD, regulada por NYDFS) para transfers y pagos. El merchant puede aceptar crypto y recibir settlement en fiat. Spread de conversión: ~1%. | **No.** Adyen no ofrece aceptación nativa de cripto ni stablecoins. No hay planes públicos de incorporarlo. Posible vía partners terceros pero no integrado. | **No.** dLocal no tiene aceptación nativa de cripto. Enfocado en métodos de pago locales fiat. Posible integración vía partners pero no es parte de su oferta core. |
| **Facilidad integración Node.js/Express** | Buena. SDK oficial estable. Miles de ejemplos. Middleware-style con flujo de órdenes (create → capture). Complejidad: baja-media. Lo más complejo es el manejo de webhooks y estados de orden. | Excelente. SDK oficial con tipado TypeScript completo. Documentación con snippets copy-paste. API unificada para 250+ métodos de pago (mismo endpoint para tarjeta, APM, wallet). Complejidad: media (por la flexibilidad), pero el SDK abstrae bien. | Buena. API simple con pocos endpoints. SDK ligero. Integración directa: creas un payment intent, rediriges al usuario, recibes webhook. Complejidad: baja. Menos features que Adyen pero más simple por lo mismo. |

## Resumen por proveedor

### PayPal
- **Fortaleza:** Ubicuidad. 400M+ usuarios activos. Confianza de consumidor.
- **Debilidad:** Pricing alto para pequeños volúmenes. No es MoR. Hold de fondos agresivo.
- **Ideal para:** MVPs, early-stage, mercados donde PayPal wallet es dominante.

### Adyen
- **Fortaleza:** Mejor DX del mercado. Pricing competitivo a escala. Unificación de métodos de pago.
- **Debilidad:** Barrera de entrada alta (contrato enterprise, volúmenes mínimos). Sin LatAm nativo profundo.
- **Ideal para:** Scale-ups con volumen, producto global que necesita muchos métodos de pago.

### dLocal
- **Fortaleza:** LatAm y mercados emergentes. Pay-ins y pay-outs locales. Actúa como MoR parcial en mercados complejos.
- **Debilidad:** Pricing opaco. Menor cobertura en tier-1 (NA, EU). SDK menos maduro.
- **Ideal para:** Productos con foco en LatAm/emergentes, marketplaces que necesitan payouts locales.

---

> **Nota:** Esta tabla alimenta el análisis final en la Parte 4 donde se cruzarán los 9 proveedores (Stripe, PayPal, Adyen, dLocal, LemonSqueezy, Paddle, MercadoPago, Wise, Crypto) contra los requerimientos específicos de Trust Maker.
