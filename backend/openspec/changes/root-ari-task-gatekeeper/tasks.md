# Tasks: Root Ari Task Gatekeeper + Deep Tree Warning

## Grupo 1: Clasificación asíncrona (Ari raíz)

- [ ] **RG1: System prompt — Ari raíz como clasificador/priorizador**
  - Actualizar `hermesBridge.ts` `buildSystemPrompt`: cuando `hasChildren`, agregar reglas de clasificación
  - Evaluar importancia (1-10) usando keywords del comentario
  - Intentar resolver internamente primero (responder sin crear tarea)
  - Si requiere trabajo del sub-árbol → crear tarea Kanban con `--assignee <subtree-name>`
  - ~50 LOC

- [ ] **RG2: Kanban task creation — sub-árbol como agente**
  - La Ari raíz usa `hermes kanban create` con el nombre del sub-árbol como assignee
  - La tarea incluye: título, descripción, importancia (1-10), sub-árbol destino
  - Usar `--workspace dir:<path>` correcto
  - ~30 LOC (system prompt instructions)

- [ ] **RG3: Notificar al sub-árbol vía external-task**
  - Cuando se crea tarea Kanban para un sub-árbol, notificar al chat del sub-árbol
  - Usar `POST /api/bot/send-message` con el `treeId` del sub-árbol
  - ~25 LOC

## Grupo 2: Advertencia de profundidad

- [ ] **RG4: Calcular profundidad del árbol**
  - Función `getTreeDepth(treeId)` que recorre `parentTreeId` hacia arriba
  - Retorna profundidad (0 = raíz, 1 = hijo directo, 2 = nieto, etc.)
  - ~20 LOC en `treeController.ts` o helper

- [ ] **RG5: Warning en onboarding**
  - En `bot/index.ts`, durante el flujo de creación de sub-árbol
  - Si `depth ≥ 2`, mostrar mensaje de advertencia:
    *"⚠️ Este sub-árbol tendrá N niveles de profundidad. La latencia de coordinación entre Aris aumenta con cada nivel."*
  - ~15 LOC

## Grupo 3: Integración + test

- [ ] **RG6: Test E2E — flujo completo**
  - Crear árbol raíz → sub-árbol → sub-sub-árbol
  - Verificar: advertencia de profundidad aparece en nivel 3+
  - Verificar: comentario en grupo raíz → Ari raíz evalúa importancia
  - Verificar: tarea Kanban creada con sub-árbol como assignee
  - Verificar: sub-árbol recibe notificación
  - ~60 LOC
