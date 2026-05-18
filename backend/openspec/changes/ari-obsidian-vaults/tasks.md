# Tasks: Ari Obsidian Vaults

- [ ] **O1: Vault scaffold — crear estructura obsidian/ al crear sandbox**
  - Modificar sandbox creation (sandboxController.ts) para crear `obsidian/` + subdirectorios + `.obsidian/app.json`
  - Para workers: crear vault en worker creation
  - ~20 LOC

- [ ] **O2: System prompt Ari — reglas de note-taking**
  - Actualizar `SOUL.md` de Ari en `/home/support/wiki/SOUL.md`
  - Agregar sección "Obsidian Vault" con reglas de cuándo escribir y formato
  - Agregar sección "Note Search" con reglas de cuándo buscar antes de responder
  - ~30 LOC

- [ ] **O3: Ari smart search — antes de responder, busca en vault**
  - En `hermesBridge.ts`: cuando Ari recibe mensaje del árbol, inyectar instrucción de buscar en `obsidian/` primero
  - O en el system prompt: hacerlo parte del comportamiento natural de Ari
  - Ari usa `search_files` / `grep` en su sandbox antes de responder
  - ~15 LOC

- [ ] **O4: Ari auto-write — escribir nota al crear/modificar archivos**
  - En `hermesBridge.ts`: cuando Ari escribe archivos al sandbox, también crear nota `.md` correspondiente
  - O como instrucción en system prompt: Ari debe escribir nota reflexiva después de crear archivos
  - ~25 LOC
