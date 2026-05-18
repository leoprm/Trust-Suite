# Spec: Sync de Miembros MTProto

## Comportamiento

### WHEN Ari es agregada a un grupo (nuevo o rejoin)
- THEN se ejecuta `syncAllMembers(chatId, treeId)`
- AND para cada participante humano: se crea/actualiza User + TreeMember
- AND el adder (quien invitó) obtiene rol ADMIN
- AND los demás obtienen rol MEMBER
- AND si el sync falla, se loguea pero no bloquea el flujo

### WHEN el script Python lista participantes
- THEN se excluyen bots (incluyendo al propio Ari)
- THEN se usa `client.iter_participants()` para paginación automática
- THEN timeout de 30s para evitar bloqueos

### WHEN un miembro ya existía en la DB
- THEN se actualiza su status a ACTIVE (por si estaba INACTIVE)
- THEN no se duplica el registro

## Archivos

| Archivo | Propósito |
|---|---|
| `backend/lib/tg_members.py` | Script Telethon: recibe JSON por stdin, devuelve participantes por stdout |
| `backend/src/bot/telegramClient.ts` | Wrapper TypeScript: spawn subprocess, parsear output |
| `backend/src/bot/index.ts` | Handler `my_chat_member`: integrar syncAllMembers |
| `backend/.env` | Agregar TELEGRAM_API_ID + TELEGRAM_API_HASH |
