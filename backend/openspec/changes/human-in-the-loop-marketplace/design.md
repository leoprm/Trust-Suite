# Human-in-the-Loop — Diseño Técnico

## Schema

### Extensión de User (columnas nuevas)

```prisma
model User {
  // ... existentes ...
  availableForHire Boolean  @default(false)
  hourlyRate       Int?     // en centavos (ej: 50000 = $500.00)
  currency         String?  @default("CLP") // CLP, USD, EUR, MXN, ARS
  location         String?  // "Santiago, Chile"
  externalTasks    ExternalTask[] @relation("Worker")
}
```

### ExternalTask (modelo nuevo)

```prisma
model ExternalTask {
  id          String   @id @default(uuid())
  treeId      String
  tree        Tree     @relation(fields: [treeId], references: [id])
  createdBy   String   // userId de quien creó (o "ari")
  title       String
  description String   @db.Text
  skills      String   // JSON array: ["design", "react"]
  budget      Int      // centavos
  currency    String   @default("CLP")
  workerId    String?
  worker      User?    @relation("Worker", fields: [workerId], references: [id])
  status      ExternalTaskStatus @default(OPEN)
  deliverableUrl String? // URL del archivo en sandbox
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
  @@index([treeId])
}

enum ExternalTaskStatus {
  OPEN
  CLAIMED
  DELIVERED
  APPROVED
  REJECTED
}
```

### i18n strings nuevas

- `hilt.*` — comandos y mensajes del marketplace

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/external-tasks` | Crear tarea (desde árbol) |
| GET | `/api/external-tasks/available` | Listar tareas abiertas (workers) |
| GET | `/api/external-tasks/my` | Mis tareas (worker autenticado) |
| POST | `/api/external-tasks/:id/claim` | Reclamar tarea |
| POST | `/api/external-tasks/:id/deliver` | Entregar evidencia |
| POST | `/api/external-tasks/:id/approve` | Aprobar (miembros del árbol) |
| POST | `/api/external-tasks/:id/reject` | Rechazar |

## Comandos del bot

| Comando | Handler |
|---------|---------|
| `/trabajar` | Activa `availableForHire`, pide skills/rate/ubicación |
| `/perfil` | Editar perfil de worker |
| `/tareas` | Mini App o inline keyboard con tareas matching |

## Flujo de pago

1. Árbol tiene fondos en Paddle/Stripe → budget reservado al crear ExternalTask
2. Worker reclama → escrow en Paddle
3. Worker entrega → miembros aprueban → Paddle libera
4. Si rechazan → fondos vuelven al árbol
