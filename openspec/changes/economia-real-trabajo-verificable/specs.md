# Especificaciones Técnicas

## 1. Tasks con Presupuesto

### Schema
```prisma
model Task {
  id          String   @id @default(uuid())
  needId      String
  treeId      String
  title       String
  description String?
  budget      Int               // CLP
  status      TaskStatus        // PENDING, ASSIGNED, IN_PROGRESS, EVIDENCE_SUBMITTED, VERIFIED, PAID, DISPUTED
  assigneeId  String?           // userId
  creatorId   String            // userId
  skills      String?           // JSON array: ["design", "frontend"]
  evidenceUrl String?           // URL o path de archivo subido
  evidenceType String?           // IMAGE, FILE, LINK
  disputedById String?          // userId que disputó
  disputeReason String?
  disputeEvidenceUrl String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  need     Need  @relation(fields: [needId], references: [id])
  tree     Tree  @relation(fields: [treeId], references: [id])
  assignee User? @relation("TaskAssignee", fields: [assigneeId], references: [id])
  creator  User  @relation("TaskCreator", fields: [creatorId], references: [id])
}

enum TaskStatus {
  PENDING
  ASSIGNED
  IN_PROGRESS
  EVIDENCE_SUBMITTED
  VERIFIED
  PAID
  DISPUTED
}
```

### Creación de tasks
- **Cualquier miembro del árbol** puede crear tasks
- **Método principal**: conversación natural con @TrustMakerBot
  - Ej: "@TrustMakerBot necesito que alguien rediseñe el hero de la landing, presupuesto 15 lucas"
  - El bot parsea con Hermes Agent y crea la task automáticamente
- **Método alternativo**: comando `/creatask "título" --presupuesto 15000 --need "Landing page"`
- El creador del árbol puede modificar presupuesto y asignar prioridad

### Endpoints
- `POST /api/tasks` — crear task (cualquier miembro)
- `GET /api/tasks?treeId=X` — listar tasks del árbol
- `PATCH /api/tasks/:id/assign` — asignar a un miembro (TaskRouter o manual)
- `PATCH /api/tasks/:id/status` — cambiar estado
- `POST /api/tasks/:id/evidence` — subir evidencia (multipart: foto/archivo)
- `POST /api/tasks/:id/dispute` — disputar task con contra-evidencia
- `POST /api/tasks/:id/resolve-dispute` — resolver disputa por votación

---

## 2. Skills por Trabajo Verificado

### Extensión de User
```prisma
model User {
  // ... existente ...
  skills      String?  // JSON: {"design": 45, "frontend": 72}
  totalXp     Int      @default(0)
}
```

### Match con skills existentes (NO inferir skills nuevas cada vez)
- Al verificar una task, el bot analiza título + descripción
- **Primero revisa las skills que el usuario YA tiene**
- Si la task calza con una skill existente → suma XP a esa skill
- Si no calza con ninguna → crea UNA nueva skill (no una lista)
- Esto evita inflación de skills — máximo ~8-10 skills por usuario

### Categorías de skills predefinidas
`design`, `frontend`, `backend`, `data`, `ops`, `writing`, `research`, `coordination`, `marketing`, `finance`

### XP
- Tasks simples (≤2h): 10-20 XP
- Tasks medias (2-8h): 20-35 XP  
- Tasks complejas (>8h): 35-50 XP
- La complejidad la estima el creador al crear la task

### TaskRouter extendido
- Ya existe para AI agents — extender a humanos
- Query: miembros del árbol con skills que matchean, ordenados por XP en esa skill
- Excluir miembros con tasks activas > 3
- Rotación: si un miembro ya tiene 2 tasks asignadas esta semana, baja prioridad

---

## 3. Evidencias y Disputas

### Subida de evidencia
- Endpoint `POST /api/tasks/:id/evidence` acepta multipart/form-data
- Archivos se guardan en `/uploads/evidence/{taskId}/{timestamp}_{filename}`
- Tipos permitidos: JPG, PNG, WEBP, PDF, ZIP (máx 10MB)
- El bot acepta fotos directo en Telegram → las reenvía al endpoint

### Disputas
- Cualquier miembro del árbol puede disputar una task en EVIDENCE_SUBMITTED
- Debe adjuntar contra-evidencia (foto/archivo)
- La disputa abre votación de 24h en el grupo
- El bot publica: "🔍 Disputa en task X — ¿evidencia suficiente? Voten 👍 o 👎"
- Quórum: 30% de miembros activos
- Mayoría simple decide

---

## 4. Cuota Mensual Dinámica

### Cálculo
```
cuota = costoBase + (Σ presupuestos tasks activas / N miembros activos)
```

- `costoBase`: precio de suscripción del árbol (ya configurable vía Paddle/Stripe)
- Se recalcula el día 1 de cada mes
- El bot notifica a cada miembro su cuota vía DM o en el grupo

### Implementación
- Cron job mensual (día 1, 00:00)
- Calcula y persiste en `TreeMember.monthlyFee`
- Notifica vía bot de Telegram

---

## 5. Gate de Pago

### Estados de pago
```prisma
model TreeMember {
  // ... existente ...
  paymentStatus   PaymentStatus @default(GRACE)
  graceUntil      DateTime?     // fecha fin período de gracia
  lastPaymentAt   DateTime?
}
enum PaymentStatus { GRACE, ACTIVE, DELINQUENT, BLOCKED }
```

### Flujo
1. Miembro nuevo → GRACE por 7 días
2. Día 8 sin pago → DELINQUENT (aviso genérico + link de pago)
3. Día 15 sin pago → BLOCKED (sin interacción con el bot)
4. Pago realizado → ACTIVE inmediatamente
5. Comandos públicos (/info, /lista) siempre visibles

### Bot middleware
- `bot.on("message:text")` → verificar paymentStatus antes de procesar
- Si BLOCKED → responder con mensaje genérico + link de pago
- Si DELINQUENT → responder con recordatorio amable + link

---

## 6. Árboles Privados → Ya en progreso (t_18294caf)

---

## 7. Split de Pagos con Stripe Connect

### Modelo de reparto

Cada necesidad ganadora define un **creador** que recibe un porcentaje del presupuesto. Al pagar la cuota mensual, el sistema fracciona el pago automáticamente:

```
Ejemplo: Necesidad "Rediseñar landing" — presupuesto $100, creador Juan (20%)
Cuota total del árbol: $300/mes (10 miembros)

Cuando Pedro paga $30:
  → $6 (20%) a la cuenta Stripe Connect de Juan
  → $24 al pool del árbol
```

### Schema

```prisma
model PaymentSplit {
  id          String   @id @default(uuid())
  needId      String
  memberId    String   // quien recibe el split
  percentage  Float    // 0.0 a 100.0
  reason      String   // "need_creator", "task_executor"
  createdAt   DateTime @default(now())

  need   Need       @relation(fields: [needId], references: [id])
  member TreeMember @relation(fields: [memberId], references: [id])
}

model MemberBalance {
  id            String   @id @default(uuid())
  memberId      String   @unique
  availableBalance Int   @default(0)  // CLP, retirable
  pendingBalance   Int   @default(0)  // CLP, en período de clearing
  stripeAccountId String?  // Stripe Connect account ID
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  member TreeMember @relation(fields: [memberId], references: [id])
}
```

### Stripe Connect Flow

1. **Onboarding**: `POST /api/members/me/stripe-onboard` → devuelve URL de Stripe Connect onboarding
2. **Return**: Stripe redirige a `/api/stripe/onboard/return?memberId=X` → guarda `stripeAccountId`
3. **Split en pago**: Webhook `checkout.session.completed`:
   - Calcula `PaymentSplit` para cada necesidad activa
   - Crea Stripe Transfer a la connected account de cada beneficiario
   - El resto va a la cuenta platform del árbol
4. **Retiro**: `POST /api/members/:id/withdraw` → Stripe Payout a cuenta bancaria vinculada

### Cálculo de porcentajes

- **Creador de necesidad**: 20% del presupuesto total de sus necesidades activas
- **Ejecutor de task**: 80% del presupuesto de la task cuando se marca VERIFIED
- El porcentaje lo define el creador al abrir la necesidad (máx 50%)

### Ledger interno

Aunque el split es en tiempo real vía Stripe Connect, se mantiene un ledger en `MemberBalance` para:
- Auditoría y transparencia
- Reversiones en caso de disputa ganada
- Historial de transacciones

### Endpoints nuevos

- `POST /api/members/me/stripe-onboard` — iniciar onboarding Stripe Connect
- `GET /api/stripe/onboard/return?memberId=X` — callback de Stripe
- `GET /api/members/:id/balance` — consultar balance
- `POST /api/members/:id/withdraw` — retirar a cuenta bancaria
- `GET /api/tree/:id/ledger` — historial de transacciones del árbol (admin)
