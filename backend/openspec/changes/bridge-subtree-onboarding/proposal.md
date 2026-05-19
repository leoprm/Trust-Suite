# Bridge-Driven Sub-Tree Onboarding + Tree Prefix

## Problem

Cuando un usuario crea un sub-árbol en el onboarding actual:
1. Debe escribir manualmente el código/ID del árbol padre — no hay selector visual de "tus árboles"
2. No se notifica a las Aris del árbol padre vía Bridge cuando se vincula un sub-árbol
3. El Bridge no participa en el flujo de decisión sub-árbol
4. En chats multi-IA (padre + sub-árboles), los mensajes de distintas Aris son indistinguibles

## Solution

### A. Bridge asume la pregunta de sub-árbol al inicio
Cuando Ari es agregada a un grupo (`my_chat_member` → `member`/`administrator`), el Bridge pregunta "¿Es este un sub-árbol?" **ANTES** del selector de idioma. Si responde "sí", muestra inline keyboard con los árboles donde el usuario es miembro activo.

### B. Selector visual de árbol padre
Inline keyboard con `🌳 NombreDelÁrbol` por cada membresía ACTIVA del usuario. Al seleccionar, se vincula automáticamente (`parentTreeId`).

### C. Notificación Bridge a Aris padres
Al crear sub-árbol, el Bridge envía mensaje al chat de Telegram del árbol padre notificando el nuevo sub-árbol vinculado.

### D. Bridge informa a Ari post-vinculación
System prompt de Ari incluye `parentTreeId`, `parentTreeName`, e instrucción de presentarse como sub-árbol.

### E. Prefijo de nombre de árbol en mensajes
`hermesBridge.ts` antepone `- NombreDelÁrbol:\n` antes de cada mensaje de Ari cuando el chat tiene múltiples IAs activas (árbol padre + sub-árboles).

## Components

1. **API endpoint** — `GET /api/users/:telegramUserId/trees` → lista membresías activas con tree.name, tree.icono, tree.id
2. **Onboarding flow** — mover pregunta sub-árbol al inicio (antes de `lang_group:`)
3. **Inline keyboard selector** — callback `onboarding:parent_select:<treeId>` para vincular
4. **Bridge notification** — `ctx.api.sendMessage(parentChatId, msg)` al vincular
5. **System prompt enhancement** — `buildSystemPrompt()` incluye parentTree context
6. **Tree prefix in messages** — `routeToHermes()` antepone `- TreeName:`
7. **E2E test** — flujo completo

## Estimated tasks

8 Kanban tasks, ~400 LOC total.
