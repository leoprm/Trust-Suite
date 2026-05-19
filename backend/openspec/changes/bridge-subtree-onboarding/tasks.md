# Tasks: Bridge-Driven Sub-Tree Onboarding

- [ ] **T1: API endpoint** — `GET /api/users/:telegramUserId/trees` en `treeController.ts` + ruta en `treeRoutes.ts`. Devuelve árboles donde el usuario es miembro ACTIVO con `id, name, icono`. (~30 LOC)
- [ ] **T2: Onboarding — pregunta sub-árbol al inicio** — Modificar `my_chat_member` handler en `bot/index.ts` para preguntar "¿Es un sub-árbol?" ANTES del selector de idioma. Callbacks `subtree_early_yes` / `subtree_early_no`. (~60 LOC)
- [ ] **T3: Onboarding — selector visual de árbol padre** — Callback `subtree_early_yes` → fetch membresías del usuario → inline keyboard con `🌳 Nombre` → callback `onboarding:parent_select:<treeId>` → vincula y notifica. (~80 LOC)
- [ ] **T4: Bridge — notificar chat padre** — Al vincular en T3, enviar mensaje al `telegramChatId` del árbol padre: "🌿 Nuevo sub-árbol vinculado: ...". (~20 LOC)
- [ ] **T5: Bridge — system prompt con parentTree** — `buildSystemPrompt()` en `hermesBridge.ts` incluye bloque "Parent Tree Context" con `parentTreeId`, `parentTreeName`, instrucción de presentarse. (~30 LOC)
- [ ] **T6: Bridge — prefijo de árbol en mensajes** — `routeToHermes()` en `hermesBridge.ts` antepone `- NombreDelÁrbol:` cuando el chat tiene >1 árbol. (~25 LOC)
- [ ] **T7: Cleanup — remover step 4 (código padre) del onboarding** — Eliminar `step === 4` de `handleOnboardingResponse()` y el callback `onboarding:subtree_yes`/`subtree_no` viejo (step 2). Renumerar steps. (~40 LOC)
- [ ] **T8: E2E test** — `e2e-subtree-onboarding.test.ts`: crear árbol padre → agregar Ari a grupo nuevo → seleccionar sub-árbol → elegir padre → verificar DB + notificación. (~100 LOC)

**Total estimado: ~385 LOC**
