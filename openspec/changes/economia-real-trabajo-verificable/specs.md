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

### Endpoints
- `POST /api/tasks` — crear task (creador del árbol o admin)
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
  skills      String?  // JSON: {"design": 45, "frontend": 72, "backend": 30}
  totalXp     Int      @default(0)
}
```

### Lógica
- Al verificar una task, se infieren skills del título + descripción
- Se suman 10-50 XP según complejidad de la task
- Skills se acumulan incrementalmente (sin decaimiento para humanos)
- TaskRouter prioriza miembros con skills relevantes y menos carga actual

### TaskRouter extendido
- Ya existe para AI agents — extender a humanos
- Query: miembros del árbol con skills que matchean, ordenados por XP en esa skill
- Excluir miembros con tasks activas > 3
- Rotación semanal para evitar monopolio

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

## 6. Árboles Privados

### Cambios
- `Tree.admissionPolicy` default: CLOSED (antes OPEN)
- `handleTreeListQuery` filtra: solo OPEN + trees donde el usuario es miembro
- `findTreeByChat` sigue funcionando para todos los trees (el bot está en el grupo)
- Auto-join solo para trees OPEN
- Invitación: comando `/invitar @username` que agrega al usuario como miembro
