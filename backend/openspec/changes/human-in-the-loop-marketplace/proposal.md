# Human-in-the-Loop Kanban Bridge — Propuesta v2

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18  
**Reemplaza:** v1 (h1-h5 archivadas — no contemplaban integración Kanban)

## Problema

Los pipelines de Kanban a veces requieren tareas que solo un humano puede hacer: diseñar, decidir, validar, crear contenido. Hoy no hay forma de que el dispatcher asigne trabajo a humanos y espere su resultado para continuar.

## Solución

Un **perfil Kanban `human-worker`** que en vez de spawnear un proceso, crea una ExternalTask en TrustMaker. El humano completa → webhook → tarea Kanban marcada `done` → pipeline avanza. Ari orquesta todo.

## Workflow completo

```
Pipeline Kanban
  │
  ├── ● backend-eng (AI) → escribe código → ✓
  ├── ◻ human-worker      → ExternalTask creada
  │     ├── Worker reclama en Telegram/WhatsApp
  │     ├── Ejecuta (diseño, traducción, decisión)
  │     ├── Entrega evidencia
  │     └── Ari o miembros verifican → approve
  │           └── Webhook → Kanban mark done → ✓
  ├── ◻ backend-eng (AI)  → esperaba al humano → ahora corre
  └── ✓ pipeline completo
```

## Lo que cambia del diseño original

| v1 (archivado) | v2 (nuevo) |
|---|---|
| Marketplace aislado | Integrado al dispatcher Kanban |
| Comandos independientes | Perfil `human-worker` en Kanban |
| Sin conexión a pipelines | Webhook desbloquea tareas dependientes |
| ~200 LOC | ~400-500 LOC |

## Componentes nuevos

1. **Perfil Kanban `human-worker`** — el dispatcher lo reconoce y crea ExternalTask en vez de spawn
2. **Webhook de completación** — ExternalTask approve/reject → marca Kanban task done/blocked
3. **Ari orquestador** — monitorea, verifica entregas, decide approve/reject automático
4. **Bot worker** — comandos `/trabajar`, `/perfil`, `/tareas`, claim/deliver

## Tareas estimadas

7-8 tareas Kanban (~500 LOC total)
