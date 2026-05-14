# Diseño — Aislamiento por Árbol

## Arquitectura

```
┌─────────────────────────────────────────┐
│           TrustMaker Backend            │
│  ┌───────────────────────────────────┐  │
│  │     sandboxRoutes.ts (API)        │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│  ┌──────────────▼────────────────────┐  │
│  │   TreeSandbox Service (lógica)    │  │
│  │  ┌──────────┐  ┌───────────────┐  │  │
│  │  │ filesystem│  │   port pool   │  │  │
│  │  │  manager  │  │   manager     │  │  │
│  │  └──────────┘  └───────────────┘  │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│  ┌──────────────▼────────────────────┐  │
│  │   Prisma (TreeSandbox model)      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
/home/leo/    /home/leo/    /home/leo/
trees/abc/   trees/def/    trees/ghi/
  apps/        apps/         apps/
  data/        data/         data/
  logs/        logs/         logs/
```

## Flujo de creación
1. Cliente llama `POST /api/trees/:id/sandbox`
2. `TreeSandbox.create(treeId)`:
   a. Verifica que el árbol existe
   b. Asigna puerto del pool (4100-4999)
   c. Crea directorios `/home/leo/trees/{treeId}/{apps,data,logs}`
   d. Inserta en DB
   e. Retorna `SandboxInfo`

## Pool de puertos
- Rango: 4100-4999 (900 puertos)
- Algoritmo: buscar el menor puerto libre no en DB
- Si se llena: error 507 Insufficient Storage

## Crecimiento a Docker (Fase 2)
La interfaz `TreeSandbox` ya abstrae la implementación:
- `create` → `docker compose up` con volumen montado
- `destroy` → `docker compose down`
- `health` → `docker ps` + healthcheck HTTP
- El resto del código no cambia
