# Trust Wallet — Plan de Implementación

> **Fecha:** 12 Mayo 2026
> **Autor:** Analyst-2 (Hermes Agent)
> **Estado:** Pendiente de aprobación de Leo

---

## 1. Resumen Ejecutivo

**Trust Wallet** será el 6to flavor del Trust Suite (`trust-wallet`), una billetera digital completa que unifica fiat (CLP) y berries bajo un solo techo. A diferencia de la wallet básica actual — que solo muestra balances de forma read-only — Trust Wallet permitirá depositar, retirar, transferir entre miembros (P2P) y ver el historial completo, todo desde una PWA dedicada.

**¿Por qué como flavor separado?** Porque una wallet es una aplicación con su propia identidad visual, flujo de navegación y propósito. No es una "feature" de Trust Lite — es un producto independiente. Sigue el patrón ya probado de `trust-lite`, `branch-os`, `trace-lite`, `trust-insight` y `trust-landing`.

---

## 2. Gap Analysis: Qué existe vs Qué falta

### 2.1 Wallet básica actual (Mayo 2026)

| Componente | Estado | Descripción |
|---|---|---|
| `GET /api/wallet/me` | ✅ | Balance fiat (INCOME - EXPENSE), berries (TreeMember.bayasBalance), suscripciones, últimas 5 tx |
| `GET /api/wallet/transactions` | ✅ | Feed paginado unificado (fiat + berries), filtros por tipo y treeId |
| `Wallet.tsx` | ✅ | Página de wallet con cards de balance fiat/berries, suscripciones, últimas tx |
| `WalletTransactions.tsx` | ✅ | Historial completo con filtros, load-more, animaciones |

**Limitación crítica:** Es 100% read-only. No hay endpoints para depositar, retirar ni transferir. Los balances se computan dinámicamente desde `FiatTransaction` (ledger contable) y `TreeMember.bayasBalance` — no hay un modelo `UserWallet` que represente el balance del usuario como entidad propia.

### 2.2 Lo que Leo quiere (gap)

| Función | ¿Existe? | Gap |
|---|---|---|
| Ver balance fiat + berries | ✅ | Ninguno — ya funciona |
| Historial de transacciones | ✅ | Ninguno — ya funciona |
| **Depositar** CLP o berries | ❌ | No hay modelo de wallet, no hay endpoint de depósito, no hay integración de pago |
| **Retirar** saldo | ❌ | Ídem |
| **Transferir** entre miembros (P2P) | ❌ | BerryConfig.allowP2PTransfers existe pero ningún endpoint lo usa |
| **Integración con berries** (P2P, task rewards) | ⚠️ | BerryTransaction tiene balanceBefore/After pero no hay UI/endpoint para transferencias |
| **Flavor separado** | ❌ | La wallet actual es una página dentro de cada flavor existente |

### 2.3 Sistema de berries — readiness

| Componente | Estado |
|---|---|
| `BerryConfig` (berriesEnabled, allowP2PTransfers, allowTaskRewards, monthlyFlowRate) | ✅ |
| `BerryTransaction` (tipos: TASK_REWARD, AUDIT_REWARD, LEVEL_REWARD, P2P_TRANSFER_IN, P2P_TRANSFER_OUT) | ✅ |
| `TreeMember.bayasBalance` (balance individual) | ✅ |
| Umbral poblacional (10000 miembros default) | ✅ (gate en `minMembersForBerries`) |
| Frontend — labels y colores para tipos BERRY_P2P_TRANSFER_IN/OUT | ✅ (en WalletTransactions.tsx) |

**Conclusión:** La infraestructura de berries está lista para P2P. Solo falta el endpoint `POST /api/wallet/transfer` que cree la `BerryTransaction` y actualice ambos `TreeMember.bayasBalance`.

### 2.4 Sistema fiat — readiness

| Componente | Estado |
|---|---|
| `FiatTransaction` (ledger contable, verificationStatus, receiptEvidenceId) | ✅ |
| `FiatVerificationStatus` (DECLARED → BACKED_BY_RECEIPT → RECONCILED → AUDITED) | ✅ |
| `MemberPayment` (PLEDGED/PAID/RELEASED/REFUNDED) | ✅ |

**Conclusión:** `FiatTransaction` es un ledger contable por árbol, no una wallet. Necesitamos un nuevo modelo `UserWallet` para representar el balance individual y un nuevo `WalletTransaction` para el historial de operaciones de wallet.

---

## 3. Arquitectura Propuesta

### 3.1 Modelos Prisma (nuevos)

#### UserWallet
```prisma
model UserWallet {
  id              String   @id @default(uuid())
  userId          String   @unique
  balanceClp      Float    @default(0)
  lockedClp       Float    @default(0)    // fondos en disputa/escrow/procesamiento
  balanceBerries  Float    @default(0)
  lockedBerries   Float    @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[]
}
```

**Decisiones:**
- `userId` @unique — una wallet por usuario (cross-tree)
- `balanceClp` y `balanceBerries` en el mismo modelo para vista unificada
- `lockedClp/Berries` para fondos en procesamiento (retiros pendientes, disputas)
- Sin `currency` field — CLP es default, BERRIES es el otro rail

#### WalletTransaction
```prisma
enum WalletTxType {
  DEPOSIT          // ingreso CLP (manual con comprobante o MercadoPago en Fase 2)
  WITHDRAWAL       // retiro CLP a cuenta bancaria
  P2P_SEND         // envío fiat o berries a otro miembro
  P2P_RECEIVE      // recepción de otro miembro
  TREE_PAYMENT     // pago a un árbol (subscription)
  MEMBER_REWARD    // recompensa desde un árbol (fiat o berries)
  REFUND           // devolución
  FEE              // comisión
}

enum WalletTxStatus {
  PENDING
  COMPLETED
  FAILED
  REVERSED
}

model WalletTransaction {
  id              String          @id @default(uuid())
  walletId        String
  type            WalletTxType
  status          WalletTxStatus  @default(PENDING)
  amount          Float
  currency        String          @default("CLP")   // CLP | BERRIES
  balanceBefore   Float
  balanceAfter    Float
  providerTxId    String?         // ID externo (MercadoPago, Khipu)
  providerPayload Json?           // respuesta completa del provider
  treeId          String?         // para TREE_PAYMENT, MEMBER_REWARD
  branchId        String?
  taskId          String?
  fromUserId      String?         // para P2P
  toUserId        String?         // para P2P
  metadataJson    Json?
  description     String?         @db.Text
  idempotencyKey  String?         @unique
  createdAt       DateTime        @default(now())

  wallet  UserWallet @relation(fields: [walletId], references: [id])
}
```

**Decisiones:**
- `idempotencyKey` @unique — evita doble acreditación
- `balanceBefore/After` — audit trail completo
- `fromUserId/toUserId` en vez de relación directa para desacoplar
- Misma tabla para fiat y berries (currency field discrimina)

### 3.2 Endpoints API

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `GET` | `/api/wallet/me` | **EXTENDER** — usar UserWallet en vez de cómputo dinámico. Agregar `availableClp`, `lockedClp`, `availableBerries`, `lockedBerries` | JWT |
| `GET` | `/api/wallet/transactions` | **EXTENDER** — incluir WalletTransaction en el feed unificado | JWT |
| `POST` | `/api/wallet/deposit` | Crear intención de depósito (monto, comprobante). Retorna instrucciones de transferencia | JWT |
| `POST` | `/api/wallet/withdraw` | Solicitar retiro (monto, datos bancarios). Crea WalletTransaction PENDING, lockea fondos | JWT |
| `POST` | `/api/wallet/transfer` | Transferencia P2P (toUserId, amount, currency). Atómica: debita wallet origen, acredita destino | JWT |
| `GET` | `/api/wallet/transfer/:id` | Detalle de una transferencia | JWT |
| `POST` | `/api/wallet/webhooks/mercadopago` | Webhook MP (Fase 2) — validación HMAC + idempotencia | Público + firma |

**Extensión de `GET /api/wallet/me`:**
```json
{
  "walletId": "uuid",
  "fiat": {
    "available": 150000,
    "locked": 0,
    "currency": "CLP"
  },
  "berries": {
    "available": 2500,
    "locked": 0,
    "currency": "BERRIES",
    "byTree": [
      { "treeId": "...", "treeName": "InnovaCorp", "balance": 1200 },
      { "treeId": "...", "treeName": "TechLab", "balance": 1300 }
    ]
  },
  "subscriptions": [...],
  "recentTransactions": [...]
}
```

### 3.3 Componentes Frontend

| Componente | Ruta | Descripción |
|---|---|---|
| `WalletDashboard.tsx` | `/` | Cards de balance fiat + berries, quick actions (Depositar, Retirar, Transferir), últimas 5 tx |
| `WalletTransactions.tsx` | `/transactions` | REUTILIZAR el existente — feed paginado con filtros |
| `DepositPage.tsx` | `/deposit` | Formulario: monto CLP, subir comprobante. Muestra datos bancarios para transferencia |
| `WithdrawPage.tsx` | `/withdraw` | Formulario: monto, banco, tipo cuenta, número cuenta, RUT |
| `TransferPage.tsx` | `/transfer` | Selector de miembro (búsqueda), monto, currency (CLP/BERRIES), confirmación |
| `TransferConfirm.tsx` | `/transfer/confirm` | Review antes de ejecutar — destinatario, monto, fee |

### 3.4 Flujo de depósito (Fase 1 — manual con comprobante)

```
Usuario → /wallet/deposit → ingresa monto + sube comprobante
  → POST /api/wallet/deposit { amount, receiptFile }
  → Backend crea WalletTransaction (type=DEPOSIT, status=PENDING)
  → Admin revisa comprobante, aprueba manualmente
  → Backend: PENDING → COMPLETED, acredita UserWallet.balanceClp
  → EventLog CRITICAL
```

**¿Por qué manual en Fase 1?** Mercado Pago/Khipu requieren credenciales reales, webhook público accesible desde internet, y testing en producción. La complejidad es alta. El flujo manual con comprobante usa infraestructura existente (`FiatVerificationStatus`, `receiptEvidenceId`) y permite validar todo el resto de la wallet antes de integrar la pasarela.

### 3.5 Flujo de transferencia P2P

```
Origen → /wallet/transfer → busca destinatario → ingresa monto + currency → confirma
  → POST /api/wallet/transfer { toUserId, amount, currency }
  → Backend (transacción atómica):
    1. Verifica balance suficiente (availableClp o availableBerries)
    2. Si BERRIES: verifica BerryConfig.allowP2PTransfers + minMembersForBerries
    3. Debita UserWallet origen + crea WalletTransaction (P2P_SEND)
    4. Acredita UserWallet destino + crea WalletTransaction (P2P_RECEIVE)
    5. Si BERRIES: también crea BerryTransaction para audit trail
    6. EventLog INFO para ambos
  → Notificación al destinatario
```

### 3.6 Integración con berries

- **P2P berries**: Usa `UserWallet.balanceBerries` como source of truth, sincronizado con `TreeMember.bayasBalance`. Al transferir berries, se actualizan ambos.
- **Task rewards**: Siguen funcionando como hoy (`BerryTransaction` con `type=TASK_REWARD`). El `UserWallet.balanceBerries` se recalcula como `SUM(TreeMember.bayasBalance)`.
- **Gate poblacional**: `POST /api/wallet/transfer` con `currency=BERRIES` verifica `BerryConfig.minMembersForBerries` antes de permitir.
- **Tree-scoping**: Las transferencias de berries son intra-tree (el balance de berries es por árbol). La UI muestra el tree de origen.

### 3.7 Mercado Pago — Fase 2

El análisis de proveedores de pago chilenos (`references/payment-providers-chile.md`) recomienda **Khipu** como riel primario (transferencia bancaria, 0.82% efectivo) y **Mercado Pago** como fallback para tarjeta (3.80% efectivo).

En Fase 2:
- `POST /api/wallet/deposit/mp` — crea preferencia de pago MP, retorna URL de checkout
- `POST /api/wallet/webhooks/mercadopago` — recibe `payment.updated`, valida HMAC, acredita
- Frontend: botón "Cargar con tarjeta" que abre checkout MP en nueva ventana
- Idempotencia por `providerTxId` único

---

## 4. Estructura del Flavor `trust-wallet`

### 4.1 Archivos nuevos en frontend/

```
frontend/
├── .env.trust-wallet              # VITE_APP_FLAVOR=trust-wallet, iconos, manifest
├── public/
│   ├── icon-wallet-192.png        # Ícono de wallet (billetera)
│   ├── icon-wallet-512.png
│   ├── manifest-trust-wallet.json # PWA manifest
│   └── sw-trust-wallet.js         # Service worker
└── src/
    ├── pages/
    │   ├── WalletDashboard.tsx     # Página principal: balances + quick actions
    │   ├── WalletTransactions.tsx  # YA EXISTE — reutilizar con ajustes mínimos
    │   ├── DepositPage.tsx         # Depósito CLP con comprobante
    │   ├── WithdrawPage.tsx        # Retiro a cuenta bancaria
    │   └── TransferPage.tsx        # Transferencia P2P
    └── config/
        └── appConfig.ts           # AGREGAR 'trust-wallet' a AppFlavor + APP_CONFIGS
```

### 4.2 Cambios en archivos existentes

| Archivo | Cambio |
|---|---|
| `appConfig.ts` | Agregar `'trust-wallet'` a `AppFlavor`, nueva entrada en `APP_CONFIGS`, `isTrustWallet` flag, puerto 5178 en `getAppUrl` |
| `App.tsx` | Nuevo bloque `{isTrustWallet && (...)}` con rutas: `/` → WalletDashboard, `/transactions`, `/deposit`, `/withdraw`, `/transfer` |
| `vite.config.ts` | Agregar puerto 5178 para dev, 4178 para preview |
| `WalletTransactions.tsx` | Extender TYPE_LABELS con nuevos tipos `WALLET_DEPOSIT`, `WALLET_WITHDRAWAL`, `WALLET_P2P_SEND`, `WALLET_P2P_RECEIVE` |
| `.env` (base) | Agregar `VITE_TRUST_WALLET_URL` para SSO cross-PWA |

### 4.3 Configuración appConfig

```typescript
'trust-wallet': {
  id: 'trust-wallet',
  name: 'Trust Wallet',
  shortName: 'Wallet',
  description: 'Billetera digital — CLP y Berries.',
  defaultPath: '/',
  defaultEntity: 'arbol',
  matrixEntities: [],           // Sin MobileShell/matrix — usa MainLayout
  drawerPanels: ['privacy'],
  features: {
    admin: false,
    citizenProfile: false,
    directory: false,
    needs: false,
    people: false,
    talentSearch: false,
    treeList: false,
    treeNetwork: false,
  },
  serviceWorker: '/sw-trust-wallet.js',
}
```

### 4.4 Rutas en App.tsx

```typescript
{isTrustWallet && (
  <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
    <Route path="/" element={<WalletDashboard />} />
    <Route path="/transactions" element={<WalletTransactions />} />
    <Route path="/deposit" element={<DepositPage />} />
    <Route path="/withdraw" element={<WithdrawPage />} />
    <Route path="/transfer" element={<TransferPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
  </Route>
)}
```

---

## 5. Plan de Implementación por Fases

### 🔴 Fase 0: Fundación (previo a todo)

| T# | Título | Perfil | Descripción |
|---|---|---|---|
| **F0.1** | Prisma: modelos UserWallet + WalletTransaction + migración | backend-eng | Crear modelos en schema.prisma, generar migración, push a DB, seed con wallets demo |
| **F0.2** | Frontend: scaffold del flavor trust-wallet | frontend-eng | Crear `.env.trust-wallet`, manifest, iconos, service worker, entrada en appConfig y App.tsx, vite.config |

**Dependencias:** F0.1 y F0.2 son independientes (paralelizables).

### 🟡 Fase 1: Core Wallet (el MVP)

| T# | Título | Perfil | Descripción | Depende de |
|---|---|---|---|---|
| **F1.1** | Backend: migrar GET /api/wallet/me a UserWallet | backend-eng | Crear/lazy-init UserWallet on first access. Extender endpoint para devolver `availableClp`, `lockedClp`, `availableBerries`, `lockedBerries`. Incluir WalletTransaction en recentTransactions. | F0.1 |
| **F1.2** | Backend: endpoint POST /api/wallet/transfer (P2P fiat + berries) | backend-eng | Transacción atómica: verificar balance, verificar BerryConfig para berries, debitar origen, acreditar destino, crear WalletTransactions, EventLog. Rate limiting: 10 transfers/min. | F0.1 |
| **F1.3** | Backend: endpoints POST /api/wallet/deposit + /api/wallet/withdraw | backend-eng | Depósito: recibe amount + receiptFile, crea WalletTransaction PENDING, sube comprobante. Retiro: recibe amount + bankInfo, lockea fondos, crea WalletTransaction PENDING. Ambos con EventLog CRITICAL. | F0.1 |
| **F1.4** | Frontend: WalletDashboard + DepositPage + WithdrawPage | frontend-eng | Dashboard con cards de balance (available/locked), quick actions, últimas tx. DepositPage con formulario de monto + upload comprobante + datos bancarios. WithdrawPage con formulario de datos bancarios. | F0.2, F1.1, F1.3 |
| **F1.5** | Frontend: TransferPage (P2P) | frontend-eng | Buscador de miembros, selector de currency (CLP/BERRIES), input de monto, confirmación pre-envío. Validaciones: balance suficiente, límites. | F0.2, F1.2 |
| **F1.6** | Backend + Frontend: extender GET /api/wallet/transactions con WalletTransaction | backend-eng + frontend-eng | Backend: merge WalletTransaction en el feed unificado. Frontend: extender TYPE_LABELS con nuevos tipos. | F1.1, F0.2 |

**F1.1, F1.2, F1.3 son independientes entre sí (paralelizables).**
**F1.4 y F1.5 dependen de sus respectivos backends. F1.4 y F1.5 son independientes entre sí.**

### 🟢 Fase 2: Pasarela de Pago

| T# | Título | Perfil | Descripción | Depende de |
|---|---|---|---|---|
| **F2.1** | Backend: integración Mercado Pago (checkout + webhook) | backend-eng | Crear preferencia de pago, webhook handler con HMAC, idempotencia, acreditación automática. Variables de entorno: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET. | F1.3 |
| **F2.2** | Frontend: botón "Cargar con tarjeta" + flujo MP | frontend-eng | Botón que abre checkout MP en popup/redirect. Página de retorno mostrando estado del pago. | F2.1, F1.4 |

### 🔵 Fase 3: Pulido y Seguridad

| T# | Título | Perfil | Descripción |
|---|---|---|---|
| **F3.1** | Seguridad: rate limiting, validación de idempotencia, tests | backend-eng | Rate limiting en deposits/withdraws/transfers. Tests unitarios para atomicidad. Validación de idempotency keys. |
| **F3.2** | SSO Cross-PWA: Wallet ↔ otros flavors | frontend-eng | Agregar `VITE_TRUST_WALLET_URL` a todos los .env. AppSwitcher incluye Trust Wallet. |
| **F3.3** | Admin: panel de aprobación de depósitos/retiros | frontend-eng | Página en Trust Lite (/admin/wallet) para revisar y aprobar/rechazar depósitos y retiros pendientes. |

---

## 6. Dependencias entre tareas

```
F0.1 (Prisma) ───────┬──→ F1.1 (GET /me extendido)
                      ├──→ F1.2 (transfer P2P)
                      └──→ F1.3 (deposit/withdraw)
                                        │
F0.2 (scaffold flavor) ────────────────┤
                                        │
                ┌───────────────────────┤
                ▼                       ▼
          F1.4 (Dashboard+Deposit)  F1.5 (TransferPage)
                │                       │
          ┌─────┘                       │
          ▼                             │
    F1.6 (transactions extendido) ──────┘
          │
          ▼
    F2.1 (MercadoPago backend)
          │
          ▼
    F2.2 (MercadoPago frontend)

    F3.1, F3.2, F3.3 (independientes entre sí, post-F1)
```

**Paralelismo máximo:**
- F0.1 ∥ F0.2
- F1.1 ∥ F1.2 ∥ F1.3
- F1.4 ∥ F1.5
- F3.1 ∥ F3.2 ∥ F3.3

---

## 7. Riesgos y Mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| **Regulatorio CMF**: Mantener saldos de usuarios puede requerir licencia de emisor de prepago en Chile | ALTA | Fase 1 con depósitos manuales (no custodia automatizada). Consultar abogado en paralelo. Si es necesario, evaluar partner con licencia (Khipu ya opera como intermediario regulado). |
| **Umbral berries 10000 miembros**: Las transferencias P2P de berries no funcionan sin población suficiente | MEDIA | El endpoint verifica `minMembersForBerries` antes de permitir. La UI muestra un mensaje claro ("Berries no disponibles hasta que el árbol alcance X miembros"). Mientras tanto, P2P fiat funciona normalmente. |
| **Race condition en balance**: Dos requests simultáneos podrían causar doble débito | ALTA | Usar `prisma.$transaction` con `isolationLevel: 'Serializable'` en transfer/deposit/withdraw. Idempotency keys como segunda capa de defensa. Tests de concurrencia. |
| **Mercado Pago — complejidad de webhooks**: Requiere URL pública, HMAC, idempotencia, reintentos | ALTA | Aplazar a Fase 2. Fase 1 valida toda la arquitectura con flujo manual. Cuando se active MP, el modelo de datos ya está listo (providerTxId, providerPayload, idempotencyKey). |
| **Sincronización UserWallet ↔ TreeMember.bayasBalance**: Los berries viven en TreeMember, no en UserWallet | MEDIA | UserWallet.balanceBerries se computa como `SUM(TreeMember.bayasBalance)` on-the-fly o se sincroniza vía trigger al crear BerryTransaction. Opción más segura: siempre leer de TreeMember para berries (UserWallet.balanceBerries es cached/derived). |
| **Datos bancarios — seguridad**: Retiros requieren datos bancarios sensibles (RUT, número cuenta) | MEDIA | Encriptar bankInfo en `metadataJson` con clave derivada del JWT secret. No loggear datos bancarios en EventLog. Rate limiting estricto: 3 retiros/día, máximo $500K diarios. |
| **Confusión de balances**: Los usuarios pueden no entender la diferencia entre balance fiat (global) y berries (por árbol) | BAJA | La UI separa claramente las cards. La de berries muestra breakdown por árbol. Tooltips explican cada balance. |

---

## 8. Estimación de Esfuerzo

| Fase | Tareas | Esfuerzo estimado | Backend | Frontend |
|---|---|---|---|---|
| F0: Fundación | 2 | 2-4h | 1 task | 1 task |
| F1: Core Wallet | 6 | 12-20h | 3 tasks | 3 tasks |
| F2: Mercado Pago | 2 | 6-10h | 1 task | 1 task |
| F3: Pulido | 3 | 4-8h | 1 task | 2 tasks |
| **Total** | **13** | **24-42h** | **6** | **7** |

**Critical path:** F0 → F1.3 → F1.4 → F1.6 → F2.1 → F2.2 = 6 tareas secuenciales (~16-28h si son同一个 dev, menos si son paralelas entre backend/frontend).

---

## 9. Referencias

- `references/trust-wallet-design.md` — Diseño original propuesto (mayo 2026)
- `references/payment-providers-chile.md` — Análisis de proveedores de pago chilenos (Codex GPT-5.5)
- `backend/prisma/schema.prisma` — Modelos FiatTransaction (L1202), BerryTransaction (L1895), BerryConfig (L1878), TreeMember (L608), MemberPayment (L1286)
- `backend/src/controllers/walletController.ts` — Wallet controller actual (294 LOC)
- `backend/src/routes/walletRoutes.ts` — Wallet routes actuales (9 LOC)
- `frontend/src/pages/Wallet.tsx` — Página wallet actual (413 LOC)
- `frontend/src/pages/WalletTransactions.tsx` — Historial de transacciones (534 LOC)
- `frontend/src/App.tsx` — Rutas actuales (200 LOC)
- `frontend/src/config/appConfig.ts` — Configuración de flavors (186 LOC)
