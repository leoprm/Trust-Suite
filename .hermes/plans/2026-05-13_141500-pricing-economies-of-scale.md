# Plan: Motor de Suscripción Dinámica con Economías de Escala

**Fecha:** 2026-05-13  
**Change:** `pricing-economies-of-scale`  
**Objetivo:** Implementar la fórmula de precio dinámico con exponente e=0.65 en Trust Maker v3

---

## Contexto Actual

- **Backend v3:** Express + TypeScript + Prisma + SQLite. Sin motor de suscripción.
- **Billing:** Paddle integrado (billingController.ts) solo para procesamiento de pagos.
- **Schema:** User, Tree, TreeMember, AgentMembership, ByoApiKey, UserAI. Sin modelo de pricing.
- **Frontend:** SettingsPage con panel de suscripción (SubscribePage), sin desglose de costos.
- **Fórmula validada:** `costo_user(n) = costo_base / (n/n_base)^0.65`, delta con buffer 20%.

---

## Lo que hay que construir

### 1. Schema: Modelo de PricingConfig

```prisma
model PricingConfig {
  id                    String   @id @default(uuid())
  baseMonthlyCost       Float    // Costos fijos: servidores, sueldos, licencias, infra
  currentUserCount      Int      // Usuarios activos al momento del cálculo
  currentCostPerUser    Float    // costo_base / currentUserCount (calculado)
  economiesOfScaleExp   Float    @default(0.65)
  growthBuffer          Float    @default(0.20)  // 20% buffer
  projectedNewUsers     Int      // Proyectados para próximo mes
  growthDelta           Float    // Costo extra por crecimiento
  totalMonthlyCost      Float    // baseMonthlyCost + growthDelta
  pricePerUser          Float    // totalMonthlyCost / (currentUserCount + projectedNewUsers)
  calculatedAt          DateTime @default(now())
  effectiveFrom         DateTime // Cuándo aplica este precio
}
```

### 2. Service: PricingService

**Archivo:** `backend/src/services/pricingService.ts`

```typescript
// Fórmula central
projectedCostPerUser(n): costo_base / (n / n_base)^0.65

// Delta de crecimiento
growthDelta = (costoTotalProyectado - costoTotalActual) * 1.2

// Precio final por usuario
pricePerUser = (baseCost + growthDelta) / totalUsers
```

**Métodos:**
- `calculatePricing(baseCost, currentUsers, projectedNewUsers)` → PricingConfig
- `getCurrentPricing()` → último PricingConfig
- `getPricingHistory()` → últimos 12 meses

### 3. Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/pricing/current` | No | Precio actual y desglose |
| GET | `/api/pricing/history` | Admin | Historial de precios |
| POST | `/api/pricing/calculate` | Admin | Forzar recálculo manual |
| PUT | `/api/pricing/config` | Admin | Actualizar costos base |

### 4. CRON Mensual

**Archivo:** `backend/src/cron/pricingCron.ts`

Ejecuta el primer día de cada mes:
1. Cuenta usuarios activos
2. Proyecta nuevos usuarios (promedio últimos 3 meses)
3. Calcula nuevo PricingConfig
4. Actualiza precio de suscripción en Paddle (vía API)
5. Loggea el cambio

### 5. Frontend: Pricing Breakdown

**Archivo:** `frontend/src/pages/SettingsPage.tsx` (modificación)

Agregar sección "Desglose de Precio" en el panel de suscripción:

```
┌─────────────────────────────────────┐
│ 💰 Tu suscripción                    │
│                                      │
│ Costos operativos:        $200.00    │
│ Crecimiento proyectado:   +100 users │
│ Delta crecimiento:        +$90.00    │
│                                      │
│ Total mensual:            $290.00    │
│ Usuarios:                 500        │
│ ─────────────────────────────────    │
│ Precio por usuario:       $0.58      │
│                                      │
│ 📈 Eficiencia: 42% menos que mes pasado │
└─────────────────────────────────────┘
```

---

## Archivos involucrados

| Archivo | Acción |
|---|---|
| `backend/prisma/schema.prisma` | Agregar modelo PricingConfig |
| `backend/prisma/migrations/...` | Migración automática |
| `backend/src/services/pricingService.ts` | **NUEVO** — Lógica de pricing |
| `backend/src/controllers/pricingController.ts` | **NUEVO** — Endpoints |
| `backend/src/routes/pricingRoutes.ts` | **NUEVO** — Rutas |
| `backend/src/cron/pricingCron.ts` | **NUEVO** — CRON mensual |
| `backend/src/index.ts` | Wire: rutas + CRON |
| `frontend/src/pages/SettingsPage.tsx` | Sección desglose de precio |
| `frontend/src/components/pricing/PricingBreakdown.tsx` | **NUEVO** — Componente |
| `openspec/changes/pricing-economies-of-scale/` | Actualizar tasks.md |

---

## Plan de implementación (5 tareas Kanban)

### Tarea 1: Schema + Migración
- Agregar modelo PricingConfig a schema.prisma
- Migración + regenerar Prisma client
- Sin dependencias

### Tarea 2: PricingService (fórmula central)
- Implementar `calculatePricing()`, `getCurrentPricing()`
- Tests unitarios con casos: 100→500 users, 100→1000, 100→10000
- Depende de Tarea 1

### Tarea 3: Endpoints + CRON
- GET /api/pricing/current, history, POST calculate, PUT config
- CRON mensual con proyección de usuarios
- Depende de Tarea 2

### Tarea 4: Integración Paddle
- Al recalcular precio, actualizar price en Paddle vía API
- Webhook para confirmar cambio
- Depende de Tarea 2

### Tarea 5: Frontend Pricing Breakdown
- Componente PricingBreakdown con desglose visual
- Integrar en SettingsPage
- Fetch a GET /api/pricing/current
- Depende de Tarea 3

---

## Validación

- [ ] `calculatePricing(200, 100, 100)` → costo/user ≈ $0.49, delta ≈ $53
- [ ] `calculatePricing(200, 100, 900)` → costo/user ≈ $0.15, delta ≈ $165
- [ ] GET /api/pricing/current devuelve desglose completo
- [ ] CRON no falla si no hay datos históricos (primer mes)
- [ ] Frontend muestra sección de desglose con datos reales
- [ ] Precio baja cuando crece la base de usuarios

---

## Riesgos

- **[Riesgo] Sin datos históricos el primer mes** → Mitigación: usar defaults (costo/user = $1.00) hasta tener 3 meses de datos
- **[Riesgo] CRON falla y no se actualiza el precio** → Mitigación: alerta por log + endpoint manual de recálculo
- **[Riesgo] Paddle no acepta el nuevo precio** → Mitigación: validar rango antes de enviar

---

## Orden de ejecución

```
T1 (Schema) ──┬── T2 (PricingService) ──┬── T3 (Endpoints + CRON) ── T5 (Frontend)
               │                        │
               │                        └── T4 (Paddle Integration)
               │
               (T2 y T4 comparten dependencia T1)
```

- **T1** primero (schema)
- **T2** y **T4** en paralelo tras T1
- **T3** tras T2 (necesita el service)
- **T5** tras T3 (necesita el endpoint)
