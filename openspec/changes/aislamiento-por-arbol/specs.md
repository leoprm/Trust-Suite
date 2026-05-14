# Especificaciones — Aislamiento por Árbol

## SPEC-1: TreeSandbox Service
**Archivo:** `backend/src/services/treeSandbox.ts`

### Interfaz
```typescript
interface SandboxInfo {
  treeId: string;
  port: number;
  workspacePath: string;
  status: 'IDLE' | 'RUNNING' | 'ERROR';
  createdAt: Date;
}

class TreeSandbox {
  static async create(treeId: string): Promise<SandboxInfo>;
  static async destroy(treeId: string): Promise<void>;
  static async get(treeId: string): Promise<SandboxInfo | null>;
  static async list(): Promise<SandboxInfo[]>;
  static async health(treeId: string): Promise<boolean>;
}
```

### Comportamiento
- `create`: crea directorio `/home/leo/trees/{treeId}/{apps,data,logs}`, asigna puerto libre del pool 4100-4999, guarda en DB
- `destroy`: elimina directorio y libera puerto
- `health`: hace GET a `http://localhost:{port}/health` (si hay app corriendo)
- Puerto se asigna secuencialmente, evitando puertos ya en uso

## SPEC-2: DB Schema
**Archivo:** `backend/prisma/schema.prisma` (nuevo modelo)

```prisma
model TreeSandbox {
  id        String   @id @default(uuid())
  treeId    String   @unique
  port      Int      @unique
  status    String   @default("IDLE") // IDLE | RUNNING | ERROR
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tree Tree @relation(fields: [treeId], references: [id], onDelete: Cascade)
}
```

## SPEC-3: API Endpoints
**Archivo:** `backend/src/routes/sandboxRoutes.ts`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/trees/:id/sandbox` | Crear sandbox |
| GET | `/api/trees/:id/sandbox` | Obtener estado |
| DELETE | `/api/trees/:id/sandbox` | Destruir sandbox |
| GET | `/api/trees/:id/sandbox/health` | Health check |

Autenticación: JWT requerido para create/destroy.

## SPEC-4: Integración con creación de árbol
Al crear un árbol (vía bot o API), el sandbox se crea automáticamente si `admissionPolicy !== 'CLOSED'`.

## SPEC-5: Directorios
```
/home/leo/trees/
  {treeId}/
    apps/       # Aplicaciones del árbol
    data/       # Datos persistentes del árbol
    logs/       # Logs de aplicaciones
```
