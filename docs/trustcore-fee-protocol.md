# TrustCore Fee Protocol — Diseño Completo

> **Fecha:** 12 Mayo 2026  
> **Autor:** Analyst-2 (Hermes Agent)  
> **Versión:** 1.0 — Propuesta para revisión de Leo

---

## 1. Resumen Ejecutivo

El **TrustCore Fee Protocol** introduce un fee dinámico sobre transacciones P2P de Trust Wallet que financia la infraestructura del ecosistema. El fee se ajusta automáticamente según el tamaño del sistema (volumen, usuarios, árboles activos) y se distribuye entre los **árboles TrustCore** — comunidades designadas como mantenedoras de infraestructura. Cada fee queda registrado de forma trazable en el ledger como `WalletTransaction` tipo `FEE`, con transparencia total vía dashboard público.

**Principios de diseño:**
- **No es un impuesto fijo** — se adapta al tamaño real del sistema
- **Financia crecimiento**, no solo mantención
- **Transparencia radical** — cada peso de fee es trazable
- **Voluntario para árboles** — ser TrustCore es opt-in del dueño del árbol

---

## 2. Modelo de Datos

### 2.1 Cambios en modelos existentes

#### Tree — nuevo campo `isTrustCore`

```prisma
model Tree {
  // ... campos existentes ...
  isTrustCore         Boolean  @default(false)   // ← NUEVO
  trustCoreBalanceClp Float    @default(0)       // ← NUEVO: CLP acumulado por fees
  // ... relations ...
  trustCoreConfig     TrustCoreConfig?           // ← NUEVA relation
}
```

**Semántica:**
- `isTrustCore`: el dueño del árbol activa este flag para que su árbol sea candidato a recibir fees. El admin del servidor es quien designa/remueve árboles como TrustCore efectivos.
- `trustCoreBalanceClp`: balance acumulado de fees recibidos. Se incrementa atómicamente en cada transacción con fee. Los fondos pueden ser retirados por el admin del árbol para pagar infraestructura.

#### WalletTransaction — el tipo `FEE` ya existe

El enum `WalletTransactionType` ya incluye `FEE`. Se usará con:
- `treeId`: el árbol TrustCore que recibe el fee
- `fromUserId`: quién pagó el fee (el sender de la transferencia)
- `amount`: monto del fee
- `metadataJson`: `{ feePercent, baseFee, growthFee, trustCoreTreeId, parentTxId }`

### 2.2 Nuevos modelos

#### TrustCoreConfig — configuración por árbol TrustCore

```prisma
model TrustCoreConfig {
  id                    String   @id @default(uuid())
  treeId                String   @unique
  tree                  Tree     @relation(fields: [treeId], references: [id], onDelete: Cascade)
  
  // El dueño del árbol define qué % de los fees recibidos va a:
  maintenanceShare      Float    @default(0.70)  // 70% → costos fijos (servidores, luz, internet)
  growthShare           Float    @default(0.30)  // 30% → expansión (nuevos nodos, marketing, I+D)
  
  // Métricas del árbol (actualizadas por cron)
  monthlyMaintenanceCost Float   @default(0)     // CLP/mes — costo declarado de infraestructura
  totalFeesCollected     Float   @default(0)     // CLP acumulado histórico
  totalFeesDistributed   Float   @default(0)     // CLP ya retirado/gastado
  
  // Control
  isActive              Boolean  @default(true)  // admin puede pausar recepción de fees
  activatedAt           DateTime @default(now())
  deactivatedAt         DateTime?
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([treeId])
  @@index([isActive])
}
```

**Validación:** `maintenanceShare + growthShare` debe ser exactamente `1.0`.

#### GlobalFeeConfig — configuración global del sistema (singleton)

```prisma
model GlobalFeeConfig {
  id                          String   @id @default("default")
  
  // Fórmula dinámica
  baseMaintenanceCostClp      Float    @default(500000)   // CLP/mes — costo base de infraestructura central
  growthFactor                Float    @default(0.02)     // factor de crecimiento (0-1)
  minFeePercent               Float    @default(0.5)      // floor: 0.5%
  maxFeePercent               Float    @default(5.0)      // ceiling: 5%
  
  // Current calculated fee (recomputed by cron)
  currentFeePercent           Float    @default(0.5)
  maintenanceComponent        Float    @default(0.35)
  growthComponent             Float    @default(0.15)
  lastRecalculatedAt          DateTime?
  recalculationIntervalHours  Int      @default(6)
  
  // Snapshot de métricas del sistema (para la fórmula)
  totalActiveUsers            Int      @default(0)
  totalMonthlyVolumeClp       Float    @default(0)
  totalActiveTrees            Int      @default(0)
  totalTrustCoreTrees         Int      @default(0)
  systemMetricsUpdatedAt      DateTime?
  
  // Administradores del servidor (user IDs, JSON array)
  serverAdminIds              Json     @default("[]")
  
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}
```

#### FeeDistribution — registro de cada distribución de fee

```prisma
model FeeDistribution {
  id                  String   @id @default(uuid())
  walletTransactionId String   @unique  // FK a WalletTransaction tipo FEE
  trustCoreTreeId     String            // árbol TrustCore que recibió el fee
  trustCoreTree       Tree     @relation(fields: [trustCoreTreeId], references: [id])
  amount              Float             // monto distribuido a este árbol
  totalFeeAmount      Float             // fee total de la transacción padre
  splitRatio          Float             // proporción que recibió este árbol (0-1)
  createdAt           DateTime @default(now())

  @@index([trustCoreTreeId])
  @@index([walletTransactionId])
  @@index([createdAt])
}
```

---

## 3. Fórmula del Fee Dinámico

### 3.1 Variables

| Variable | Fuente | Descripción |
|---|---|---|
| `B` | `GlobalFeeConfig.baseMaintenanceCostClp` | Costo base mensual de infraestructura (CLP) |
| `V` | `GET /api/public/metrics` → monthlyVolume | Volumen mensual de transacciones (CLP) |
| `U` | `User.count()` | Usuarios activos totales |
| `T` | `Tree.count({ where: { isTrustCore: true, trustCoreConfig: { isActive: true } }})` | Árboles TrustCore activos |
| `α` | `GlobalFeeConfig.growthFactor` | Factor de crecimiento (default 0.02) |
| `m_s` | `TrustCoreConfig.maintenanceShare` | Share de mantención por árbol |
| `g_s` | `TrustCoreConfig.growthShare` | Share de crecimiento por árbol |

### 3.2 Fórmula

```
feePercent = clamp(maintenanceComponent + growthComponent, minFeePercent, maxFeePercent)

Donde:
  maintenanceComponent = (B / max(V, 1)) × 100
  growthComponent      = α × (1 − 1/(1 + U/1000)) × 100
```

**Explicación:**

1. **Componente de mantención** (`maintenanceComponent`):  
   `B / V` — a mayor volumen, menor % necesario para cubrir el costo fijo.  
   Ej: si B = 500,000 CLP/mes y V = 10,000,000 CLP/mes → 5%. Si V = 100,000,000 → 0.5%.

2. **Componente de crecimiento** (`growthComponent`):  
   `α × (1 − 1/(1 + U/1000))` — curva logarítmica que crece rápido al inicio (pocos usuarios → más inversión en crecimiento) y se aplana al madurar.  
   Ej con α=0.02: U=100 → 0.18%, U=1000 → 1.0%, U=10000 → 1.82%, U=100000 → 1.98%.

3. **Clamp**: el fee nunca baja de `minFeePercent` (0.5%) ni sube de `maxFeePercent` (5%).

### 3.3 Ejemplos con números realistas (CLP)

| Escenario | Usuarios | Volumen/mes | Costo base | Fee calculado | Fee en CLP por $1000 |
|---|---|---|---|---|---|
| **Early stage** | 200 | $2M | $500K | 2.68% (cap 5%?) → 5% | $50 |
| **Crecimiento** | 2000 | $20M | $500K | 2.5% + 1.33% = 3.83% | $38 |
| **Maduro** | 50000 | $500M | $500K | 0.1% + 1.96% = 2.06% | $21 |
| **Muy maduro** | 200000 | $2000M | $500K | 0.025% + 1.99% = 2.02% | $20 |

> **Nota para Leo:** Con minFeePercent=0.5%, maxFeePercent=5%, el fee siempre está entre $5 y $50 por cada $1000 transferidos. En etapas tempranas conviene subir el cap o ajustar α.

### 3.4 Recalculo

Un **cron job** (`recalculateFeeCron`) ejecuta cada `recalculationIntervalHours` (default 6h):
1. Consulta `User.count()`, volumen mensual de transacciones, árboles TrustCore activos
2. Calcula el nuevo `currentFeePercent`
3. Actualiza `GlobalFeeConfig` con los nuevos valores + snapshot de métricas
4. Loggea `EventLog` acción `FEE_RECALCULATED`

---

## 4. Flujo Completo de una Transacción con Fee

### Ejemplo: Ana envía $1000 CLP a Bruno. Fee actual = 2%.

```
┌─────────────────────────────────────────────────────────────────┐
│                      ANTES DE LA TRANSFERENCIA                   │
├─────────────────────────────────────────────────────────────────┤
│  Ana:      balanceClp = $5,000                                  │
│  Bruno:    balanceClp = $2,000                                  │
│  Tree #1 (TrustCore): trustCoreBalanceClp = $150,000            │
└─────────────────────────────────────────────────────────────────┘

POST /api/wallet/transfer
{
  "toUserId": "<bruno-id>",
  "amount": 1000,
  "currency": "CLP"
}

┌─────────────────────────────────────────────────────────────────┐
│                   PRISMA $transaction (Serializable)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. LOCK sender wallet (Ana)                                    │
│  2. Verificar balanceClp ≥ 1000 ✓                               │
│  3. LOCK receiver wallet (Bruno, create if missing)              │
│                                                                  │
│  4. Calcular fee:                                                │
│     fee = amount × currentFeePercent                             │
│     fee = 1000 × 0.02 = 20 CLP                                  │
│     netAmount = 1000 - 20 = 980 CLP                             │
│                                                                  │
│  5. Debit sender:                                                │
│     Ana.balanceClp = 5000 - 1000 = 4000                         │
│                                                                  │
│  6. Credit receiver:                                             │
│     Bruno.balanceClp = 2000 + 980 = 2980                        │
│                                                                  │
│  7. Credit TrustCore tree:                                       │
│     Tree#1.trustCoreBalanceClp = 150000 + 20 = 150020           │
│                                                                  │
│  8. Crear WalletTransactions:                                    │
│     a) P2P_TRANSFER_OUT (Ana, -1000)                            │
│     b) P2P_TRANSFER_IN  (Bruno, +980)                           │
│     c) FEE              (Tree#1, +20)  ← treeId = Tree#1.id     │
│                                                                  │
│  9. Crear FeeDistribution:                                       │
│     trustCoreTreeId = Tree#1.id, amount = 20, splitRatio = 1.0  │
│                                                                  │
│  10. EventLog × 3: TRANSFER_OUT, TRANSFER_IN, FEE_COLLECTED     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DESPUÉS DE LA TRANSFERENCIA                  │
├─────────────────────────────────────────────────────────────────┤
│  Ana:      balanceClp = $4,000  (-$1000)                        │
│  Bruno:    balanceClp = $2,980  (+$980)                         │
│  Tree #1:  trustCoreBalanceClp = $150,020  (+$20)               │
└─────────────────────────────────────────────────────────────────┘

RESPONSE 201:
{
  "transferId": "tx_out_abc123",
  "currency": "CLP",
  "amount": 1000,
  "feeAmount": 20,
  "netAmount": 980,
  "feePercent": 2.0,
  "fromUserId": "<ana-id>",
  "toUserId": "<bruno-id>",
  "trustCoreTreeId": "<tree1-id>",
  "newBalance": 4000,
  "createdAt": "2026-05-12T14:30:00Z"
}
```

### Múltiples árboles TrustCore: división del fee

Si hay 3 árboles TrustCore activos, el fee se divide proporcionalmente al `monthlyMaintenanceCost` declarado por cada uno:

```
Tree A: monthlyMaintenanceCost = $300,000 → peso = 0.50 → recibe $10
Tree B: monthlyMaintenanceCost = $200,000 → peso = 0.33 → recibe $7
Tree C: monthlyMaintenanceCost = $100,000 → peso = 0.17 → recibe $3
────────────────────────────────────────────────────────
Total:                              $600,000                $20
```

Se crean 3 `FeeDistribution` records (uno por árbol) + 1 `WalletTransaction` tipo `FEE` con `metadataJson` que referencia las 3 distribuciones.

---

## 5. Designación de Árboles TrustCore

### 5.1 Flujo de opt-in / designación

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Dueño árbol  │────▶│ Admin        │────▶│ Árbol es     │
│ activa flag  │     │ servidor     │     │ TrustCore    │
│ isTrustCore  │     │ aprueba/     │     │ activo       │
│ = true       │     │ rechaza      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Paso 1 — Dueño del árbol:**  
`PATCH /api/trees/:id/trustcore/opt-in`  
- Requiere ser creator del árbol  
- Setea `isTrustCore = true`  
- Crea `TrustCoreConfig` con maintenanceShare y growthShare defaults  
- El árbol NO recibe fees todavía — está "pendiente de aprobación"

**Paso 2 — Admin del servidor:**  
`POST /api/admin/trustcore/:treeId/activate`  
- Requiere `requireServerAdmin` (user IDs en `GlobalFeeConfig.serverAdminIds`)  
- Setea `TrustCoreConfig.isActive = true`  
- El árbol ahora participa en la distribución de fees

**Remover un árbol TrustCore:**  
`POST /api/admin/trustcore/:treeId/deactivate`  
- `isActive = false`, `deactivatedAt = now()`  
- Los fees acumulados (`trustCoreBalanceClp`) siguen disponibles para retiro

### 5.2 Endpoints nuevos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `PATCH` | `/api/trees/:id/trustcore/opt-in` | Tree creator | Activa flag isTrustCore + crea TrustCoreConfig |
| `PATCH` | `/api/trees/:id/trustcore/opt-out` | Tree creator | Desactiva isTrustCore. Solo si no tiene fees pendientes. |
| `PATCH` | `/api/trees/:id/trustcore/config` | Tree admin | Actualiza maintenanceShare, growthShare, monthlyMaintenanceCost |
| `GET` | `/api/trees/:id/trustcore/stats` | Tree member | Dashboard de fees recibidos, distribuciones, transparencia |
| `POST` | `/api/admin/trustcore/:treeId/activate` | Server admin | Activa árbol como TrustCore |
| `POST` | `/api/admin/trustcore/:treeId/deactivate` | Server admin | Desactiva árbol TrustCore |
| `GET` | `/api/admin/trustcore/dashboard` | Server admin | Panel global: todos los TrustCore, fees totales, métricas |
| `GET` | `/api/admin/trustcore/config` | Server admin | Leer/escribir GlobalFeeConfig |
| `PUT` | `/api/admin/trustcore/config` | Server admin | Actualizar GlobalFeeConfig |
| `POST` | `/api/trees/:id/trustcore/withdraw` | Tree admin | Retirar fondos del trustCoreBalanceClp (crea WalletTransaction TREE_PAYMENT) |
| `GET` | `/api/public/fee-stats` | Público | Fee actual, histórico, distribución entre TrustCore trees |

---

## 6. Transparencia y Auditoría

### 6.1 Trazabilidad por transacción

Cada fee es completamente trazable:

```
WalletTransaction (FEE)
├── id: "fee_abc123"
├── type: FEE
├── amount: 20
├── treeId: "tree_1_id"          ← ¿a qué árbol TrustCore fue?
├── fromUserId: "ana_id"         ← ¿quién pagó el fee?
├── metadataJson: {
│     "feePercent": 2.0,
│     "baseFee": 14,             // componente mantención
│     "growthFee": 6,            // componente crecimiento
│     "parentTxId": "tx_out_abc123",
│     "distributionId": "dist_xyz"
│   }
│
└── FeeDistribution
    ├── trustCoreTreeId: "tree_1_id"
    ├── amount: 20
    ├── splitRatio: 1.0
    └── walletTransactionId: "fee_abc123"
```

### 6.2 Dashboard de transparencia

**Por árbol TrustCore** (`GET /api/trees/:id/trustcore/stats`):
```json
{
  "treeId": "...",
  "treeName": "Infraestructura Chile",
  "isActive": true,
  "trustCoreBalanceClp": 150020,
  "totalFeesCollected": 250000,
  "totalFeesDistributed": 99980,
  "maintenanceShare": 0.70,
  "growthShare": 0.30,
  "monthlyMaintenanceCost": 300000,
  "feesThisMonth": 45000,
  "distributionCount": 1280,
  "recentDistributions": [...]
}
```

**Dashboard global** (`GET /api/admin/trustcore/dashboard`):
```json
{
  "currentFeePercent": 2.0,
  "totalFeesCollectedAllTime": 1250000,
  "totalFeesThisMonth": 180000,
  "activeTrustCoreTrees": 3,
  "totalTransactionsWithFee": 45000,
  "systemMetrics": {
    "totalActiveUsers": 2500,
    "monthlyVolumeClp": 25000000,
    "activeTrees": 45
  },
  "trees": [
    { "treeId": "...", "name": "Infra Chile", "balanceClp": 150020, "share": 0.50 },
    { "treeId": "...", "name": "Nodo Argentina", "balanceClp": 89000, "share": 0.33 },
    { "treeId": "...", "name": "CDN Global", "balanceClp": 43000, "share": 0.17 }
  ]
}
```

### 6.3 EventLog

Cada operación de fee genera EventLog:

| Acción | Entidad | Severidad | Cuándo |
|---|---|---|---|
| `FEE_COLLECTED` | WalletTransaction | INFO | Cada fee deducido en una transferencia |
| `FEE_DISTRIBUTED` | FeeDistribution | INFO | Cada distribución a un árbol TrustCore |
| `FEE_RECALCULATED` | GlobalFeeConfig | INFO | Cada recalculo del fee por cron |
| `TRUSTCORE_ACTIVATED` | TrustCoreConfig | WARNING | Admin activa un árbol TrustCore |
| `TRUSTCORE_DEACTIVATED` | TrustCoreConfig | WARNING | Admin desactiva un árbol |
| `TRUSTCORE_WITHDRAWAL` | WalletTransaction | CRITICAL | Retiro de fondos del trustCoreBalanceClp |

---

## 7. Plan de Implementación

### Fase 0: Prisma + Migraciones

| T# | Título | Depende de |
|---|---|---|
| **F0.1** | Agregar `isTrustCore`, `trustCoreBalanceClp` a Tree; crear `TrustCoreConfig`, `GlobalFeeConfig`, `FeeDistribution` en schema.prisma | — |
| **F0.2** | Ejecutar `npx prisma db push` + INSERT inicial de `GlobalFeeConfig` con defaults | F0.1 |

### Fase 1: Fee Calculation Engine

| T# | Título | Depende de |
|---|---|---|
| **F1.1** | Implementar `calculateFeePercent()` en `backend/src/utils/feeEngine.ts` | F0.2 |
| **F1.2** | Cron job `recalculateFeeCron` (cada 6h) — recalcula fee y actualiza GlobalFeeConfig | F1.1 |
| **F1.3** | Tests unitarios para fórmula del fee (casos borde: V=0, U=0, todos los caps) | F1.1 |

### Fase 2: Transferencia con Fee

| T# | Título | Depende de |
|---|---|---|
| **F2.1** | Modificar `walletController.transfer()` — integrar deducción de fee en transacción atómica | F0.2, F1.1 |
| **F2.2** | Lógica de distribución multi-árbol: `distributeFee()` que divide entre TrustCore activos | F2.1 |
| **F2.3** | Extender respuesta del endpoint transfer para incluir `feeAmount`, `netAmount`, `feePercent` | F2.1 |
| **F2.4** | Tests de integración: transfer con 1 TrustCore, con 3 TrustCore, sin TrustCore (fee=0) | F2.1, F2.2 |

### Fase 3: TrustCore Management

| T# | Título | Depende de |
|---|---|---|
| **F3.1** | Endpoints de opt-in/opt-out: `PATCH /api/trees/:id/trustcore/opt-in`, `opt-out` | F0.2 |
| **F3.2** | Endpoint de configuración: `PATCH /api/trees/:id/trustcore/config` | F0.2 |
| **F3.3** | Endpoints admin: `POST /api/admin/trustcore/:treeId/activate`, `deactivate` | F0.2 |
| **F3.4** | Endpoint de retiro: `POST /api/trees/:id/trustcore/withdraw` | F0.2 |
| **F3.5** | Middleware `requireServerAdmin` — verifica contra `GlobalFeeConfig.serverAdminIds` | F0.2 |

### Fase 4: Transparencia y Dashboard

| T# | Título | Depende de |
|---|---|---|
| **F4.1** | Endpoint stats por árbol: `GET /api/trees/:id/trustcore/stats` | F2.1, F2.2 |
| **F4.2** | Dashboard admin global: `GET /api/admin/trustcore/dashboard` | F2.1, F3.3 |
| **F4.3** | Endpoint público: `GET /api/public/fee-stats` | F2.1 |
| **F4.4** | CRUD GlobalFeeConfig: `GET/PUT /api/admin/trustcore/config` | F0.2 |
| **F4.5** | Frontend: TrustCore settings panel en TreeDetail (solapa FINANZAS, para tree admins) | F3.1, F3.2, F4.1 |
| **F4.6** | Frontend: TrustCore admin dashboard en Trust Lite (para server admins) | F4.2, F4.4 |
| **F4.7** | Frontend: Fee breakdown en TransferPage y WalletTransactions | F2.3 |

### Fase 5: EventLog + Pulido

| T# | Título | Depende de |
|---|---|---|
| **F5.1** | Agregar EventLog en todos los endpoints nuevos | F3.x, F4.x |
| **F5.2** | Extender `GET /api/wallet/transactions` para filtrar por tipo FEE | F2.1 |
| **F5.3** | Auditoría: script de verificación de consistencia (suma de fees = suma de distribuciones) | F2.2 |

### Grafo de dependencias

```
F0.1 ──► F0.2 ──┬──► F1.1 ──► F1.2 ──► F1.3
                 │
                 ├──► F2.1 ──┬──► F2.2 ──► F2.3 ──► F2.4
                 │           │
                 │           └──► F4.1 ──► F4.5
                 │           └──► F4.2 ──► F4.6
                 │           └──► F4.3
                 │           └──► F5.2
                 │
                 ├──► F3.1 ──► F3.2 ──► F3.5
                 │           └──► F4.5
                 │
                 ├──► F3.3 ──► F4.2 ──► F4.6
                 │
                 ├──► F3.4
                 │
                 └──► F4.4 ──► F4.6

F3.x + F4.x ──► F5.1
F2.2 ───────► F5.3
```

**Paralelismo máximo:**
- F1.1 ∥ F2.1 ∥ F3.1 ∥ F3.3 ∥ F3.4 ∥ F4.4 (todos solo dependen de F0.2)
- F4.5 ∥ F4.6 ∥ F4.7 (frontends independientes)

---

## 8. Riesgos y Mitigaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|---|---|---|---|
| **Fee muy alto desincentiva uso** | ALTA | Media | `maxFeePercent` (5%) + monitoreo de volumen post-activación. Si el volumen cae >20%, trigger de revisión manual. |
| **Fee muy bajo no cubre costos** | MEDIA | Media | `minFeePercent` (0.5%) + `baseMaintenanceCost` declarado por cada árbol. Si `trustCoreBalanceClp` no cubre `monthlyMaintenanceCost`, el árbol puede subir su share de mantención. |
| **Ataque Sybil para bajar el fee** | MEDIA | Baja | El fee usa `User.count()` para el componente de crecimiento. Crear usuarios falsos podría bajarlo artificialmente. Mitigación: usar `User.count({ where: { isOnboarded: true } })` + anti-bot en registro. |
| **Árbol TrustCore malicioso** | ALTA | Baja | Un árbol podría declarar `monthlyMaintenanceCost` inflado para recibir más fees. Mitigación: el admin del servidor revisa y aprueba/activa manualmente cada TrustCore. Dashboard muestra fees vs costos declarados. |
| **División injusta entre TrustCores** | BAJA | Media | La división por `monthlyMaintenanceCost` declarado podría ser gamed. Alternativa: división equitativa (1/N) con opción de pesos manuales por el admin. |
| **Fondos acumulados sin usar** | BAJA | Alta | Si un árbol acumula fees pero nunca los retira, el sistema igual funciona. Los fondos están ahí para cuando se necesiten. Se puede agregar un timeout (ej: 6 meses sin uso → fondos redistribuidos). |
| **Error en cálculo atómico del fee** | CRÍTICA | Baja | La deducción del fee ocurre dentro de `prisma.$transaction` con isolation level `Serializable`. Si falla, toda la transferencia hace rollback. Tests de integración cubren casos borde. |
| **Cron no ejecuta → fee estancado** | MEDIA | Baja | El cron tiene heartbeat + log. Si falla 3 veces consecutivas, se usa el último `currentFeePercent` calculado. El sistema nunca se queda sin fee. |

---

## 9. Decisiones de Diseño (razonamiento)

### ¿Por qué `trustCoreBalanceClp` en Tree y no una tabla separada?

- Simplicidad: una columna, un `UPDATE`, atómico dentro de la transacción existente.
- Tree ya tiene campos financieros (`presupuestoTotal`, `subscriptionAmount`).
- Si en el futuro se necesita multi-currency o ledger más complejo, se migra a tabla separada.

### ¿Por qué división proporcional a `monthlyMaintenanceCost`?

- Incentiva declarar costos reales (si inflas, el admin no te activa).
- Refleja necesidad real: quien gasta más en infraestructura, recibe más.
- Alternativa considerada: división equitativa (1/N). Pero eso trata igual a un árbol que gasta $50K/mes vs uno que gasta $1M/mes.

### ¿Por qué fee sobre P2P transfers (no deposits/withdrawals)?

- Deposits/withdrawals son interacciones con el sistema financiero externo (MercadoPago, bancos) → ellos ya cobran su fee.
- P2P transfers son intra-sistema, usan la infraestructura del ecosistema → tiene sentido que la financien.
- Si en el futuro se quiere fee sobre withdrawals, se agrega con la misma lógica.

### ¿Por qué `minFeePercent = 0.5%` y `maxFeePercent = 5%`?

- 0.5%: floor para que siempre haya algo de financiamiento, incluso en sistemas enormes.
- 5%: ceiling para que nunca sea usurero. 5% de $1000 = $50. Comparable a comisiones de exchanges/wallets P2P (MercadoPago cobra ~4-6% en algunos casos).
- Ambos son configurables por el admin del servidor vía `PUT /api/admin/trustcore/config`.

---

## 10. Próximos pasos

1. **Leo revisa este documento** y da feedback (ajustar fórmula, caps, modelo de datos)
2. **Crear tareas kanban** para F0.1 y F0.2 (Prisma) — son el prerequisito de todo
3. **Definir server admin IDs** en `GlobalFeeConfig.serverAdminIds` (¿Leo? ¿otros?)
4. **Decidir árboles TrustCore iniciales** para testing
5. **Implementar en fases** según el plan de la Sección 7

---

> **Documento generado por Hermes Agent (analyst-2) para revisión de Leo.**
> Una vez aprobado, se descompone en tareas kanban para backend-eng y frontend-eng.
