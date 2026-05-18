# Tasks: Sync Miembros MTProto

- [ ] **A — Script Python Telethon** (`backend/lib/tg_members.py`)
  - Recibe `{"api_id": N, "api_hash": "S", "chat_id": N}` por stdin
  - Usa `StringSession` + `TelegramClient`
  - `iter_participants(chat_id)` → filtra bots → devuelve `[{id, username, first_name, is_bot}]` por stdout
  - Timeout 30s, errores a stderr

- [ ] **B — Wrapper TypeScript** (`backend/src/bot/telegramClient.ts`)
  - `syncAllMembers(chatId: number, treeId: string, adderId: number): Promise<number>`
  - Spawnea `python3 lib/tg_members.py`
  - Escribe JSON por stdin, lee JSON de stdout
  - Para cada participante: `prisma.user.upsert` + `prisma.treeMember.upsert`
  - Retorna count de miembros sincronizados

- [ ] **C — Integrar en handler my_chat_member** (`backend/src/bot/index.ts`)
  - Después de crear/encontrar el árbol, llamar `syncAllMembers(chatId, tree.id, adderId)`
  - Envolver en try/catch (non-blocking)
  - Log: "Synced N members for tree X"

- [ ] **D — Variables de entorno + .gitignore**
  - Agregar `TELEGRAM_API_ID` y `TELEGRAM_API_HASH` a `backend/.env`
  - Agregar `*.session` a `.gitignore` de backend

- [ ] **E — Verificación end-to-end**
  - Sacar y re-agregar a Ari en Primatest
  - Verificar que `TreeMember` tiene 8 registros (todos los humanos del grupo)
  - Verificar que Ari reporta el número correcto de miembros
