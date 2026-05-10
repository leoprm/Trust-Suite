# Análisis: 3 Modos de Financiamiento para Trees

> Fecha: 2026-05-09
> Fuentes: trust-dna-final-report.md, trust-dna-gap-analysis.md, schema.prisma, TRUST-DNA.md

---

## 1. Verdicto Ejecutivo

**SÍ — implementar los 3 modos, pero como progresión por madurez del Tree, no como opciones libres desde el inicio.** Mode 1 es el default universal. Mode 2 se desbloquea con gates de madurez (T1 + E2). Mode 3 es una especialización de Mode 2 para Trees con gastos variables comprobados, no un tercer modo independiente.

Los 3 modos son compatibles con el Trust DNA si —y solo si— se preserva la separación estricta: fiat financia salarios y presupuesto operativo, NUNCA compra XP, votos ni poder político. El riesgo real no está en los modos en sí, sino en la porosidad de la frontera fiat↔gobernanza.

---

## 2. Análisis de Viabilidad (4 Axiomas del Trust DNA)

| Axioma | Mode 1 (Gratuito) | Mode 2 (Subscripción) | Mode 3 (Proporcional) |
|---|---|---|---|
| **Transparencia** | ✅ Natural — sin dinero no hay qué ocultar | ⚠️ Requiere ledger público de pagos y fondo | ⚠️ Requiere transparencia de gastos + prorrateo |
| **Eficiencia** | ✅ Sin overhead financiero | ⚠️ Overhead de cobro recurrente, morosidad | 🔴 Mayor overhead: billing variable, reconciliación mensual |
| **Autonomía** | ✅ Cada Tree elige si escala | ✅ Tree define su cuota soberanamente | ✅ Tree define sus gastos soberanamente |
| **Adaptabilidad** | ✅ Puede migrar a Mode 2/3 | ✅ Puede ajustar cuota o migrar a 3 | ⚠️ Migrar hacia abajo requiere liquidar compromisos |

### ¿Violan el principio "el dinero externo no contamina la gobernanza interna"?

**No, si se diseñan con la frontera correcta.** El principio del Trust DNA establece:

> Fiat externo NUNCA compra XP, votos, poder ni autoridad política.

Los modos propuestos canalizan fiat a:
- **Presupuesto operativo del Tree** (materiales, infraestructura, servicios) → ✅ OK
- **Salarios por trabajo** (compensación por tareas completadas, basada en nivel/XP) → ✅ OK mientras sea retribución por trabajo, no compra de XP
- **Fondo del Tree** (reserva, inversión comunitaria) → ✅ OK

Lo que NO debe hacer ningún modo:
- ❌ Pagar para obtener XP o subir de nivel
- ❌ Pagar para obtener más votos o peso electoral
- ❌ Pagar para ser admin o eludir rotación de mandato
- ❌ Miembros premium con privilegios de gobernanza

**Riesgo de contaminación**: Si en Mode 2 los no-pagadores pierden derecho a voto, se viola el principio. Si solo pierden acceso a features operativos (tareas remuneradas, berries, fondo compartido), la gobernanza sigue limpia.

---

## 3. Análisis Técnico — Schema de Prisma

### Lo que ya existe (no reinventar)

```prisma
// Tree ya tiene:
economyMode     TreeEconomyMode  @default(NO_ECONOMY)  // 5 valores: NO_ECONOMY → TRUST_FULL
presupuestoTotal Float           @default(100)

// TreeMember ya tiene:
bayasBalance   Float    @default(0)    // Berries del miembro
xp             Float    @default(0)    // Experiencia
level          Int      @default(1)    // Nivel

// FiatTransaction ya existe con:
amount, currency, type (enum), category (enum)
verificationStatus (6 estados: DECLARED → REJECTED)
counterpartyName, counterpartyType
treeId, branchId, taskId, createdById, certifiedById

// AssetFund ya existe:
treeId, balance, type (FIAT | PROPERTY)

// Branch tiene:
bayasFund      Float    @default(0)
xpPool         Float    @default(0)
```

### Lo que se necesita agregar

#### 1. Extender `TreeEconomyMode` → `TreeFinancingMode` (nuevo enum)

```prisma
// ACTUAL — no tocar, es madurez económica
enum TreeEconomyMode {
  NO_ECONOMY        // Sin economía alguna
  LEGACY_FIAT       // Solo fiat
  BERRIES_LATENT    // Berries inactivas
  BERRIES_ACTIVE    // Berries circulando
  TRUST_FULL        // Economía completa
}

// NUEVO — modo de financiamiento externo, ortogonal a economyMode
enum TreeFinancingMode {
  GRATUITO          // Mode 1 — sin fiat externo
  SUBSCRIPCION      // Mode 2 — cuota fija mensual
  PROPORCIONAL      // Mode 3 — gastos divididos
}
```

**Por qué separado y no extender `economyMode`**: `economyMode` mide la madurez de la economía *interna* (berries, ciclos, oxidación). El modo de financiamiento es cómo el Tree se relaciona con fiat *externo*. Son dimensiones ortogonales — un Tree puede estar en `BERRIES_ACTIVE` (economía interna madura) y ser `GRATUITO` (sin cobrar a miembros), o estar en `LEGACY_FIAT` y ser `SUBSCRIPCION`.

#### 2. Campos nuevos en `Tree`

```prisma
model Tree {
  // ... existente ...
  
  // Financing mode (nuevo)
  financingMode           TreeFinancingMode  @default(GRATUITO)
  
  // Mode 2: Subscripción fija
  subscriptionAmount      Float?             // Cuota mensual por miembro
  subscriptionCurrency    String?            @default("CLP")
  subscriptionDayOfMonth  Int?               @default(1)  // Día de cobro
  
  // Fondo del Tree (existente AssetFund se reutiliza)
  // presupuestoTotal ya existe, se reutiliza para tracking
}
```

#### 3. Campos nuevos en `TreeMember`

```prisma
model TreeMember {
  // ... existente ...
  
  // Payment/subscription tracking (nuevo)
  isPayingMember          Boolean   @default(true)  // Si está al día con pagos
  lastPaymentDate         DateTime?                 // Último pago registrado
  paymentDueDate          DateTime?                 // Próximo vencimiento
  subscriptionStatus      SubscriptionStatus @default(ACTIVE) 
}
```

#### 4. Nuevos enums

```prisma
enum SubscriptionStatus {
  ACTIVE       // Al día
  GRACE        // En período de gracia (ej. 7 días post-vencimiento)
  SUSPENDED    // Sin acceso a features premium
  CANCELLED    // Dio de baja voluntariamente
}

enum TreeFinancingMode {
  GRATUITO
  SUBSCRIPCION
  PROPORCIONAL
}
```

#### 5. Nueva tabla: `TreeExpense` (para Mode 3)

```prisma
model TreeExpense {
  id            String        @id @default(uuid())
  treeId        String
  tree          Tree          @relation(fields: [treeId], references: [id], onDelete: Cascade)
  description   String        @db.Text
  amount        Float
  currency      String        @default("CLP")
  category      TransactionCategory
  isRecurring   Boolean       @default(false)
  dueDayOfMonth Int?          // Para gastos recurrentes
  addedById     String
  addedBy       User          @relation(fields: [addedById], references: [id])
  month         String        // "2026-05"
  fiatTxId      String?       // Link a la transacción fiat cuando se paga
  fiatTx        FiatTransaction? @relation(fields: [fiatTxId], references: [id])
  createdAt     DateTime      @default(now())
  
  @@index([treeId, month])
}
```

#### 6. Nueva tabla: `MemberPayment` (registro de pagos)

```prisma
model MemberPayment {
  id            String        @id @default(uuid())
  treeId        String
  tree          Tree          @relation(fields: [treeId], references: [id], onDelete: Cascade)
  memberId      String
  member        TreeMember    @relation(fields: [memberId], references: [id], onDelete: Cascade)
  amount        Float
  currency      String        @default("CLP")
  period        String        // "2026-05"
  fiatTxId      String?
  fiatTx        FiatTransaction? @relation(fields: [fiatTxId], references: [id])
  paidAt        DateTime      @default(now())
  
  @@index([treeId, period])
  @@index([memberId])
}
```

### ¿El `economyMode` actual puede extenderse?

**No directamente.** `economyMode` es una progresión de madurez económica *interna* (NO_ECONOMY → TRUST_FULL). Los modos de financiamiento son una dimensión separada. Pero sí hay relación:

```
financingMode=GRATUITO     → limita economyMode a NO_ECONOMY o LEGACY_FIAT
financingMode=SUBSCRIPCION  → habilita economyMode hasta BERRIES_ACTIVE
financingMode=PROPORCIONAL  → requiere economyMode ≥ LEGACY_FIAT
```

Esta relación se valida en aplicación, no en schema.

---

## 4. Edge Cases y Riesgos

### 4.1 Mode 2: ¿Castas por pago?

**Riesgo real**: Si los no-pagadores pierden acceso a features de gobernanza (votar, ser admin), se crean castas y se viola el Trust DNA.

**Mitigación de diseño**:
- Los no-pagadores **conservan íntegro su poder de gobernanza**: votan, son elegibles, participan en el pipeline Needs→Ideas→Branches
- Lo que pierden al no pagar: acceso a tareas remuneradas, recepción de berries, participación en el fondo del Tree
- Sus XP y nivel siguen acumulándose normalmente por trabajo voluntario
- Período de gracia de 7-15 días antes de suspensión
- La cuota debe ser aprobada democráticamente (votación del Tree), no impuesta por admins

**Conclusión**: El riesgo de castas es manejable si la frontera fiat↔gobernanza se mantiene estricta. El sistema debe ser "pay for operations, not for power."

### 4.2 Mode 3: Entrada/salida a mitad de mes

**Escenarios**:

| Evento | Regla |
|---|---|
| Miembro entra día 10 | Paga proporcional: `(días restantes / días del mes) × (gastos / miembros)` |
| Miembro sale día 20 | Paga proporcional por los 20 días usados |
| Miembro entra y sale mismo mes | Paga solo días activos |
| Nuevo gasto a mitad de mes | Se recalcula para todos al cierre; se notifica el delta |

**Implementación**: Job CRON al cierre de mes que:
1. Suma todos los `TreeExpense` del mes
2. Cuenta miembros activos (con `joinedAt ≤ fin del mes`)
3. Calcula `amountPerMember = totalExpenses / activeMembers`
4. Genera `MemberPayment` para cada uno
5. Si el miembro estuvo parcial, prorratea por `díasActivos / díasDelMes`

**Alternativa más simple**: No prorratear — el que entra paga el mes completo, el que sale también. Más simple de implementar y comunicar. Si el Tree prefiere prorrateo, se habilita como flag `prorrateoActivado`.

### 4.3 ¿Progresivos por madurez o elegibles desde el inicio?

**Recomendación: progresivos con gates de madurez.** Esto alinea con los gaps T1 (Gates de madurez comunitaria) y E2 (Modos Económicos graduales) que el análisis Trust DNA ya identificó como críticos.

```
Mode 1 (GRATUITO)       → Disponible desde creación del Tree
Mode 2 (SUBSCRIPCION)   → Desbloquea cuando:
  - Tree tiene ≥ 5 miembros verificados
  - Tree tiene ≥ 1 Branch completada
  - Antigüedad ≥ 30 días
  - economyMode ≥ LEGACY_FIAT
  
Mode 3 (PROPORCIONAL)   → Desbloquea cuando:
  - Tree tiene ≥ 15 miembros activos
  - Tiene ≥ 3 meses en Mode 2 con ≥ 80% cumplimiento de pagos
  - Gastos mensuales documentados ≥ 3 ciclos
  - economyMode ≥ BERRIES_LATENT
```

Esto previene que Trees inmaduros activen cobros sin la infraestructura comunitaria para sostenerlos. También fuerza que Mode 3 solo esté disponible para Trees que ya demostraron disciplina financiera en Mode 2.

---

## 5. Recomendación Final

### Implementar los 3 modos, con estas decisiones de diseño

**SÍ a Mode 1 (Gratuito)**: Es el baseline. Todo Tree nuevo empieza aquí. Sin cambios al schema — `financingMode=GRATUITO` por defecto. Ya es funcionalmente lo que existe hoy.

**SÍ a Mode 2 (Subscripción fija)**: Es el puente natural hacia una economía con fiat. La cuota fija es predecible, simple de implementar, y resuelve el 80% de los casos de uso reales (comunidades profesionales, equipos estables).

**SÍ condicional a Mode 3 (Proporcional)**: No como modo independiente, sino como **especialización de Mode 2 con `billingMode=PROPORCIONAL`**. El enum `TreeFinancingMode` solo necesita 2 valores reales (`GRATUITO`, `SUBSCRIPCION`) + un flag `billingMode: FIXED | PROPORTIONAL` dentro de SUBSCRIPCION. Mode 3 comparte toda la infraestructura de Mode 2 y solo difiere en cómo se calcula el monto.

### Arquitectura recomendada

```
Tree.financingMode ∈ {GRATUITO, SUBSCRIPCION}
  └─ Si SUBSCRIPCION:
       ├─ Tree.subscriptionBillingMode ∈ {FIXED, PROPORTIONAL}
       ├─ Si FIXED: Tree.subscriptionAmount (cuota fija mensual)
       └─ Si PROPORTIONAL: se calcula de TreeExpense ÷ miembros activos
```

### Lo que NO hacer

- ❌ No tocar `economyMode` — es madurez de economía interna, no financiamiento externo
- ❌ No crear tabla `SubscriptionPlan` separada — over-engineering para 3 modos
- ❌ No implementar pasarela de pagos — eso es externo, Trust Suite solo registra transacciones fiat (ya tiene `FiatTransaction`)
- ❌ No vincular pago a poder de voto — línea roja del DNA

### Esfuerzo estimado

| Componente | Esfuerzo |
|---|---|
| Schema: nuevos campos en Tree + TreeMember + enums | 1 sprint |
| Schema: TreeExpense + MemberPayment | 1 sprint |
| Backend: endpoints CRUD para financing settings | 2 sprints |
| Backend: lógica de membresía (grace, suspensión, reactivación) | 2 sprints |
| Backend: CRON mensual de billing (Mode 3 prorrateo) | 1 sprint |
| Backend: gates de madurez para desbloqueo de modos | 1 sprint |
| Frontend: UI de configuración de financiamiento | 2 sprints |
| Frontend: dashboard de pagos para miembros | 1 sprint |
| **Total** | **~11 sprints** |

Se alinea con Fase 2 del roadmap Trust DNA (Q1 2027), donde ya están planificados E2 (Modos Económicos), E3 (TRUST_FULL) y T1 (Gates de madurez).

---

## 6. Riesgos Residuales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Miembros ricos dominan Trees vía Mode 3 pagando todo | Media | Alto | Límite: ningún miembro puede cubrir > 50% de los gastos del Tree |
| Trees fantasma que cobran y desaparecen | Baja | Alto | Gates de madurez + transparencia de ledger + reputación del Tree |
| Complejidad de UX para miembros no-técnicos | Alta | Medio | Mode 1 es default; Mode 2/3 ocultos hasta desbloqueo; onboarding guiado |
| Fraude en gastos declarados (Mode 3) | Media | Alto | Todo gasto linkeado a FiatTransaction con verificación (6 estados) ya existente |

---

*Documento generado para decisión de desarrollo. Los modos de financiamiento son viables, deseables, y alineados con el Trust DNA siempre que la frontera fiat↔gobernanza sea técnicamente inquebrantable.*
