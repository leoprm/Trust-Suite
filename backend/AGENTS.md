# TrustMaker Backend — Agent Guidelines

## ⚠️ CRÍTICO: Sandbox Boundary

**Todo archivo con el que Ari (Hermes Agent) deba interactuar DEBE estar dentro del sandbox del árbol.**

- **Sandbox base:** `process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees"`
- **Sandbox por árbol:** `<SANDBOX_BASE>/<treeId>/`
- **Ruta de conversaciones:** `<SANDBOX_BASE>/<treeId>/conversations/`
- **Ruta de media:** `<SANDBOX_BASE>/<treeId>/media/`

Ari solo puede leer/escribir archivos dentro de su sandbox vía la API (`/api/trees/:treeId/sandbox/*`). Cualquier archivo fuera del sandbox es INVISIBLE para Ari.

**Regla de oro:** Si creas o guardas un archivo que Ari necesita leer, debe ir sí o sí dentro de `<SANDBOX_BASE>/<treeId>/...`. NUNCA en el CWD del backend, `conversations/` relativo, ni `/tmp/`.

## Convenciones del proyecto

- Backend: Express + TypeScript + Prisma + MySQL
- Bot de Telegram: grammY en `src/bot/`
- Sandbox API: `src/controllers/sandboxController.ts`
- Hermes Bridge: `src/bot/hermesBridge.ts` (conexión Telegram → Hermes Agent)
- Skills de Hermes: `~/.hermes/skills/trust-maker/`

## Commits

Siempre commitear al terminar: `git add -A && git commit -m "..."`. No dejar archivos modificados sin commit.
