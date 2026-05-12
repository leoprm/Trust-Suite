# Trust Wallet — Análisis Regulatorio CMF/Banco Central Chile

Fecha: 11 mayo 2026
Contexto: Definir el modelo operativo de Trust Wallet en Chile que minimice riesgo regulatorio manteniendo valor real al usuario.

---

## 1. Viabilidad de los 4 modelos sin licencia CMF

### 1.1 Ledger cerrado de créditos comerciales (solo tracking, no retención real)

**Viable sin licencia CMF: SÍ — con restricciones estrictas.**

Este es el modelo más seguro desde el punto de vista regulatorio. Trust Wallet actúa como un sistema contable que registra créditos/debitos internos entre participantes del ecosistema Trust Suite, sin retener fondos reales del usuario final.

Cómo funciona:
- El usuario NUNCA "carga saldo" a Trust Wallet como entidad.
- Trust Wallet mantiene un ledger de doble entrada que registra obligaciones entre participantes.
- Los pagos reales ocurren directamente entre las partes vía Khipu/Flow/Mercado Pago, Trust Wallet solo orquesta la transacción y registra el resultado.
- El saldo que el usuario ve es un "crédito comercial/utilizable" dentro del ecosistema, no un depósito a la vista.

Riesgo regulatorio: Bajo. No hay captación de fondos del público (reservada a bancos por Ley General de Bancos). No hay emisión de instrumentos de pago con provisión de fondos (regulado por CMF bajo Ley 20.009 y NCG 523). Trust Wallet no califica como "Emisor de Tarjetas de Pago con Provisión de Fondos no Bancario" porque no mantiene una "Cuenta de Provisión de Fondos" real.

Límites:
- No puede permitir retiros del "saldo" a cuentas bancarias externas (eso implicaría que el saldo es dinero real en custodia).
- No puede permitir transferencias entre usuarios que no estén vinculadas a una transacción económica subyacente dentro del ecosistema.
- Los créditos deben expirar o reverse si no se usan en un plazo razonable (no son depósitos a perpetuidad).

### 1.2 Cuenta de pago/prepago regulada

**Viable sin licencia CMF: NO directamente.**

Una "cuenta de pago con provisión de fondos" es exactamente lo que la CMF regula bajo la categoría de "Emisores de Tarjetas de Pago con Provisión de Fondos no Bancarias". La CMF los define como:

> "Sociedades Anónimas Especiales autorizadas por la CMF para emitir tarjetas de pago con provisión de fondos, permiten a su Titular o Portador disponer de recursos depositados en una Cuenta de Provisión de Fondos, abierta en el Emisor de este medio de pago, para la adquisición de bienes, el pago de servicios o la extinción de otras obligaciones de pago en las entidades afiliadas al respectivo sistema."

Fuente: https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-30298.html

Si Trust Wallet recibe fondos CLP reales de usuarios y los mantiene en una cuenta pooled o segregada, con el usuario teniendo derecho a disponer de esos fondos para pagos a terceros, **está operando como emisor de tarjeta de pago con provisión de fondos no bancario** y requiere autorización CMF.

**No es viable para Fase 1 sin licencia.** El proceso de autorización CMF requiere:
- Constitución como Sociedad Anónima Especial.
- Capital mínimo y garantías.
- Aprobación del directorio/gerentes por CMF.
- Sistemas de gestión de riesgos, compliance, AML.
- Proceso de meses/años.

### 1.3 Marketplace con pagos por cuenta de terceros

**Viable sin licencia CMF: PARCIALMENTE — si los fondos nunca pasan por Trust Wallet.**

Este modelo es una variante del ledger cerrado donde Trust Wallet actúa como facilitador de pagos entre dos partes (ej: freelancer y cliente dentro de Trust Suite), pero los fondos se mueven directamente entre las cuentas bancarias de las partes vía un PSP (Khipu, Flow, Mercado Pago).

Estructura clave para cumplimiento:
- Split de pago: el cliente paga a través de Khipu/Flow, el PSP divide el pago: una parte al freelancer, una comisión a Trust Suite.
- Trust Wallet NUNCA recibe los fondos del pago completo en su cuenta.
- El "saldo" del freelancer en Trust Wallet es un reflejo de lo que el PSP ya le transfirió directamente a su cuenta bancaria.
- Trust Wallet solo registra la transacción y calcula comisiones.

Riesgo regulatorio: Bajo-Medio. Similar al ledger cerrado, pero requiere integración con split payments del PSP.

Opción concreta: Mercado Pago tiene "Split Payments" para marketplaces, Flow tiene funcionalidad similar. Khipu permite crear cobros con destino a diferentes cuentas.

### 1.4 Apoyarse en un emisor/PSP regulado existente

**Viable sin licencia CMF: SÍ — es la ruta más rápida para Fase 2+.**

Modelo: Trust Wallet contrata a un emisor de prepago ya autorizado por CMF (ej: Tenpo, Mach, Prepago Los Héroes, Ripley Prepago, etc.) como "BIN sponsor" o "program manager".

El emisor regulado:
- Mantiene la Cuenta de Provisión de Fondos (regulada).
- Emite las tarjetas/medios de pago.
- Cumple con KYC/AML regulatorio.
- Reporta a CMF/UAF.

Trust Wallet:
- Opera la capa de experiencia de usuario (frontend, app).
- Maneja el ledger de créditos comerciales y lógica de negocio.
- Integra su ecosistema Trust Suite.

Listado de emisores fiscalizados por CMF: https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&entidad=TPEEM&Estado=VI

**No es viable para Fase 1 por costo y complejidad contractual**, pero debe ser el objetivo para Fase 2 cuando el volumen lo justifique.

---

## 2. Modelo recomendado para FASE 1 (MVP) — riesgo regulatorio mínimo

### Recomendación: Ledger Cerrado de Créditos Comerciales + Khipu como orquestador de pagos

**Arquitectura:**

```
Usuario A (cliente)          Trust Wallet (ledger)         Usuario B (freelancer)
     │                              │                              │
     │  1. Solicita pago            │                              │
     │─────────────────────────────>│                              │
     │                              │  2. Crea cobro en Khipu      │
     │                              │     con split/notify          │
     │  3. Paga en Khipu/banco      │                              │
     │──────────────────────────────│                              │
     │                              │  4. Webhook: pago conciliado  │
     │                              │  5. Registra crédito en      │
     │                              │     ledger de B               │
     │                              │                              │  6. Notifica saldo
     │                              │─────────────────────────────>│     disponible
     │                              │                              │
     │                              │  7. B usa crédito para       │
     │                              │     servicios en ecosistema   │
```

**Principios regulatorios del MVP:**

1. **Fondos nunca en custodia de Trust Wallet.** Khipu recibe el pago de A, lo rutea a la cuenta bancaria de B (o a la cuenta operacional de Trust Suite para la comisión). El "saldo" que B ve en Trust Wallet es un crédito comercial contable, no un depósito.

2. **Sin retiros a cuentas bancarias desde Trust Wallet.** El usuario B recibe su pago directamente del PSP, no de Trust Wallet. Si necesita "retirar", el PSP ya le depositó.

3. **Sin transferencias P2P de "saldo".** Si B quiere pagarle a C dentro del ecosistema, se registra como un ajuste contable en el ledger (débito a B, crédito a C), pero el dinero real subyacente sigue en la cuenta bancaria del destinatario original.

4. **KYC mínimo.** Solo datos básicos de registro (RUT, nombre, email). KYC completo solo cuando el usuario quiera recibir pagos (rol de freelancer/proveedor).

5. **Límites por defecto.** $200.000/mes por usuario no verificado, $2.000.000/mes con verificación básica (RUT validado vía Khipu).

**Por qué este modelo no cae en regulación CMF:**

- No hay "cuenta de provisión de fondos" (no retenemos dinero de usuarios).
- No hay "emisión de tarjeta de pago" (el medio de pago es Khipu/Flow).
- No hay "captación de fondos del público" (reservada a bancos).
- Es un sistema de registro contable + orquestación de pagos vía PSP autorizados.

---

## 3. Triggers específicos que activan regulación CMF/Banco Central

| # | Trigger | Regulador | Fundamento |
|---|---|---|---|
| 1 | **Retener saldos CLP de usuarios por > 1 día hábil** | CMF | Si Trust Wallet recibe fondos del usuario y los mantiene overnight, se configura "cuenta de provisión de fondos". La CMF fiscaliza a cualquier entidad que "permita disponer de recursos depositados en una cuenta de provisión de fondos abierta en el emisor". |
| 2 | **Permitir retiros a cuentas bancarias externas** | CMF + Banco Central | Implica que el "saldo" es dinero real en custodia. Solo bancos y emisores de prepago autorizados pueden permitir retiros de fondos del público. |
| 3 | **Permitir transferencias entre usuarios sin transacción subyacente** | CMF | Si los usuarios pueden enviarse "saldo" entre sí sin una contraprestación económica real, el sistema funciona como un sistema de pagos alternativo. Capítulo III.J.1 del Compendio de Normas Financieras del Banco Central regula sistemas de tarjetas de pago. |
| 4 | **Ofrecer intereses o rendimientos sobre saldos** | CMF | Configura captación de fondos del público (Ley General de Bancos, art. 39). Exclusivo de bancos. |
| 5 | **Emitir tarjeta física o virtual con marca (Visa/MC)** | CMF | Requiere licencia de emisor de tarjeta de pago + membership de marca. Sin BIN sponsor es inviable. |
| 6 | **Operar como "adquirente" (procesar pagos de comercios)** | CMF | Si Trust Wallet procesa pagos con tarjeta para comercios del ecosistema, necesita contrato de adquirencia. |
| 7 | **Superar umbral de $5.000.000 en transacciones mensuales por usuario** | UAF | Dispara obligaciones de reporte de operaciones sospechosas (ROS) bajo Ley 19.913 (UAF). |
| 8 | **Ofrecer crédito o financiamiento con fondos propios o de terceros** | CMF | Configura actividad de intermediación financiera. Ley Fintech 21.521 regula plataformas de financiamiento colectivo. |

**Regla práctica:** Si Trust Wallet **toca el dinero** (lo recibe, lo retiene, lo transfiere a terceros), necesita licencia. Si solo **registra transacciones** entre partes que se pagan directamente vía PSP, está en zona segura.

---

## 4. Sandbox regulatorio en Chile (Ley Fintech 21.521)

### Sí, existe. Se llama "Espacio Controlado de Pruebas".

La Ley 21.521 (Ley Fintech), publicada en enero 2023, crea en su Título II el "Sistema de Finanzas Abiertas" y establece un marco para que la CMF autorice **espacios controlados de prueba (sandbox)**.

**Características del sandbox:**

- **Solicitud ante la CMF**: La empresa presenta un proyecto de innovación financiera que no encaja perfectamente en la regulación actual.
- **Duración**: Hasta 24 meses, prorrogable con autorización.
- **Alcance limitado**: Número máximo de participantes, volumen de transacciones, cobertura geográfica.
- **Exención regulatoria temporal**: La CMF puede eximir del cumplimiento de ciertas normas durante el período de prueba.
- **Salida**: Al finalizar, la empresa debe: (a) obtener la licencia definitiva si el modelo es viable, (b) cesar operaciones, o (c) migrar a un marco ya existente.

**¿Trust Wallet califica para sandbox?** Posiblemente sí si:
- Propone un modelo híbrido innovador (ej: ledger + prepago).
- Demuestra que el modelo actual no calza en categorías existentes.
- Tiene respaldo de capital y compliance.

**¿Conviene para Fase 1? NO.** El proceso de aplicación al sandbox toma meses, requiere preparación legal costosa, y fuerza a Trust Wallet a definirse como "entidad regulada" desde el día 1. Para un MVP es contraproducente. **El sandbox es herramienta de Fase 2-3**, cuando el modelo de ledger cerrado necesite evolucionar a custodia real de fondos.

**Fuente**: Ley 21.521, Título II. Disponible en https://www.bcn.cl/leychile/navegar?idNorma=118101 (requiere JavaScript para visualización completa).

---

## 5. Recomendación final — Arquitectura Trust Wallet Fase 1

### Arquitectura de mínimo riesgo regulatorio con máximo valor real

```
┌──────────────────────────────────────────────────────┐
│                   TRUST SUITE                          │
│                                                        │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │  Trust App   │   │ Trust Market │   │ Trust DNA   │  │
│  │  (freelance) │   │ (matching)   │   │ (verif)     │  │
│  └──────┬───────┘   └──────┬───────┘   └─────┬──────┘  │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            │                            │
│                 ┌──────────▼──────────┐                 │
│                 │   TRUST WALLET      │                 │
│                 │   (ledger interno)  │                 │
│                 │                     │                 │
│                 │ • Créditos (CLP)    │                 │
│                 │ • Débitos           │                 │
│                 │ • Comisiones        │                 │
│                 │ • Doble entrada     │                 │
│                 │ • Inmutable         │                 │
│                 └──────────┬──────────┘                 │
│                            │                            │
│                 ┌──────────▼──────────┐                 │
│                 │ PAYMENT ORCHESTRATOR│                 │
│                 │ • Khipu adapter     │                 │
│                 │ • Flow adapter      │                 │
│                 │ • Webhook handler   │                 │
│                 │ • Reconciliation    │                 │
│                 └──────────┬──────────┘                 │
└────────────────────────────┼────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐
     │   KHIPU       │ │   FLOW     │ │ MERCADO PAGO │
     │ (transferencia)│ │ (tarjetas) │ │ (fallback)   │
     └───────┬────────┘ └─────┬──────┘ └──────┬───────┘
             │                │               │
             ▼                ▼               ▼
     Cuentas bancarias de freelancers / Trust Suite ops
```

**Flujo de pago (ejemplo: cliente paga a freelancer):**

1. Cliente inicia pago de $100.000 a freelancer en Trust Suite.
2. Trust Wallet crea `payment_intent` en estado `pending`.
3. Payment Orchestrator crea cobro en Khipu por $101.500 (monto + fee Trust Suite 1.5%).
4. Cliente paga vía Khipu (banco del cliente → Khipu).
5. Webhook de Khipu notifica pago conciliado.
6. Trust Wallet registra en ledger:
   - Débito: "comisión por cobrar" ($1.500 a cuenta Trust Suite)
   - Crédito: "crédito comercial freelancer" ($98.500 a cuenta Freelancer)
7. Khipu rutea fondos reales: $98.500 a cuenta bancaria del freelancer, $1.500 a cuenta Trust Suite.
8. Freelancer ve su "saldo disponible" de $98.500 en Trust Wallet.
9. Freelancer usa ese crédito para pagar servicios dentro del ecosistema (ej: verificación DNA, boost de perfil, suscripción).

**Lo que NUNCA hace Trust Wallet Fase 1:**
- ❌ Recibir fondos en cuenta pooled a nombre de usuarios.
- ❌ Permitir "retirar saldo" a cuenta bancaria (el dinero ya está en la cuenta del freelancer).
- ❌ Permitir transferencias P2P de saldo sin transacción subyacente.
- ❌ Ofrecer intereses, rendimientos o crédito.

**Lo que SÍ hace Trust Wallet Fase 1:**
- ✅ Orquestar pagos vía PSP regulados (Khipu/Flow/Mercado Pago).
- ✅ Mantener ledger contable inmutable de créditos comerciales.
- ✅ Permitir que los créditos se usen para pagar servicios dentro de Trust Suite.
- ✅ Cobrar comisiones transparentes por transacción.
- ✅ Conciliar diariamente ledger vs movimientos bancarios.

### Costos estimados Fase 1

| Concepto | Estimación |
|---|---|
| Khipu (carga principal) | 0.8211% efectivo con IVA |
| Flow (fallback tarjeta) | 3.44% a 3.80% efectivo |
| Infraestructura ledger | ~$0 (interno, costo desarrollo) |
| Conciliación | Automática vía webhooks Khipu |
| KYC/AML básico | RUT validado por Khipu (incluido en comisión) |
| Fee Trust Suite | 1.5% sugerido sobre monto transado |

### Evolución a Fase 2 (cuando el volumen lo justifique)

1. Evaluar sandbox CMF si el modelo evoluciona a prepago real.
2. Negociar con emisor regulado existente como BIN sponsor.
3. Implementar KYC completo + scoring de riesgo transaccional.
4. Migrar de "créditos comerciales" a "cuenta de provisión de fondos regulada" con autorización CMF.

---

## Fuentes

- **CMF** — Emisores de Tarjetas de Pago con Provisión de Fondos no Bancarias: https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-30298.html
- **CMF** — Listado de fiscalizados TPEEM: https://www.cmfchile.cl/institucional/mercados/consulta.php?mercado=B&entidad=TPEEM&Estado=VI
- **Ley 21.521** (Ley Fintech) — Título II: Sistema de Finanzas Abiertas y Espacio Controlado de Pruebas: https://www.bcn.cl/leychile/navegar?idNorma=118101
- **Ley General de Bancos** (DFL 3, 1997) — Art. 39: Captación de fondos del público reservada a bancos.
- **Ley 20.009** — Norma sobre tarjetas de pago con provisión de fondos.
- **NCG 523** — Norma de Carácter General CMF sobre emisores de tarjetas de pago con provisión de fondos no bancarias.
- **UAF** — Ley 19.913: Unidad de Análisis Financiero, reporte de operaciones sospechosas.
- **Khipu** — Tarifas Pagos Instantáneos Chile: https://www.khipu.com/page/tarifas-instantaneos-chile
- **Flow** — Tarifas: https://web.flow.cl/es-cl/tarifas/
- **Mercado Pago** — Pasarela online Chile: https://www.mercadopago.cl/link-de-pago-plugins-y-plataformas-checkout
- **Informe interno** — Trust Wallet Informe Proveedores: `/home/leo/.hermes/cache/documents/doc_b30053fc6233_Trust_Wallet_Informe_Proveedores.pdf`

---

*Análisis preparado para Trust Suite — uso interno. No constituye asesoría legal. Se recomienda validar con abogado especializado en regulación financiera chilena antes de implementar.*
