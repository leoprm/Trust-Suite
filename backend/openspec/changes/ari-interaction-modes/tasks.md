# Tasks: Ari Interaction Modes

- [ ] **M1: Schema + migración** — Agregar `InteractionMode` enum y campo `interactionMode` a `Tree` en `prisma/schema.prisma`. Default: `MAXIMUM`. Ejecutar `prisma db push`. (~15 LOC)
- [ ] **M2: Gate en bot/index.ts** — Leer `tree.interactionMode` antes del bloque HERMES_BRIDGE_ENABLED. MINIMUM: solo reply+tag pasan. MEDIUM: reply+tag+nombre pasan, pero saltar conversation window y shouldAriRespond. MAXIMUM: sin cambios. (~50 LOC)
- [ ] **M3: Comando /modo** — Handler en `bot/index.ts`. Solo admin. Acepta: máxima/media/mínima (es+en). Actualiza `tree.interactionMode`. Confirma con mensaje. (~30 LOC)
- [ ] **M4: System prompt** — `buildSystemPrompt()` en `hermesBridge.ts` incluye bloque "Interaction Mode" cuando no es MAXIMUM. Instruye a Ari sobre cuándo responder. (~25 LOC)
- [ ] **M5: E2E test** — `e2e-interaction-modes.test.ts`: crear árbol, cambiar a MEDIUM, verificar que mensaje sin tag no llega a Hermes, cambiar a MINIMUM, verificar que solo tag funciona. (~80 LOC)

**Total: ~200 LOC**
