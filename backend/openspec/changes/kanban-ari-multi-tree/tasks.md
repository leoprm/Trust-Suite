# Kanban Multi-Tree para Ari — Tasks

## Fase 1: Configuración del Kanban

- [ ] **F1.1** Agregar sección `kanban:` en `/home/trustmaker/.hermes/config.yaml` con `dispatch_in_gateway: true`, intervalo 60s, auto_decompose
- [ ] **F1.2** Crear 10 perfiles worker: `backend-eng`, `backend-eng-2`, `backend-eng-3`, `backend-eng-4`, `analyst`, `analyst-2`, `researcher`, `researcher-2`, `writer`, `writer-2`
- [ ] **F1.3** Crear `AGENTS.md` en `/home/trustmaker/trees/` con regla de oro del sandbox
- [ ] **F1.4** Reiniciar gateway de trustmaker para cargar nueva configuración
- [ ] **F1.5** Smoke test: crear tarea → dispatcher la toma → worker completa

## Fase 2: Integración con Ari

- [ ] **F2.1** Verificar que el perfil `trustmaker` tiene `terminal` tool habilitado
- [ ] **F2.2** Agregar instrucciones de delegación Kanban en `buildSystemPrompt` (hermesBridge.ts)
- [ ] **F2.3** Agregar reglas de delegación en SOUL.md de Ari
- [ ] **F2.4** Reiniciar backend de TrustMaker
- [ ] **F2.5** Test: Ari recibe solicitud → crea tarea Kanban → worker la ejecuta en sandbox

## Fase 3: Monitoreo

- [ ] **F3.1** Crear script `kanban-blocked-alert-trustmaker.sh`
- [ ] **F3.2** Crear cron job blocked-only cada 10 min

## Fase 4: Verificación E2E

- [ ] **F4.1** Test con tree real: necesidad → Ari → Kanban task → worker → resultado en sandbox
- [ ] **F4.2** Test con múltiples trees simultáneos (3 trees pidiendo trabajo a la vez)
- [ ] **F4.3** Test con `person:<userId>` (revisión humana vía ExternalTask)
- [ ] **F4.4** Verificar que workers no acceden fuera del sandbox (security check)
