# Design: Sync Completo de Miembros vía MTProto

## Arquitectura

```
TrustMaker Backend (:3100)
    │
    │  my_chat_member (bot added/re-added)
    │
    ▼
telegramClient.ts
    │  spawn Python subprocess
    │  stdin: JSON {api_id, api_hash, chat_id}
    │  stdout: JSON array de participantes
    │
    ▼
lib/tg_members.py (Telethon)
    │  client.iter_participants(chat_id)
    │  output: [{id, username, first_name, is_bot}, ...]
    │
    ▼
bot/index.ts
    │  for each participant (no bots):
    │    prisma.user.upsert({ telegramUserId })
    │    prisma.treeMember.upsert({ userId, treeId, ACTIVE })
    │  log: "Synced N members for tree X"
```

## Flujo

1. Ari entra/reingresa al grupo → handler `my_chat_member`
2. Se crea/encuentra el árbol (existente)
3. **NUEVO**: se llama `syncAllMembers(chatId, treeId)`
4. El script Python lista todos los participantes vía MTProto
5. Para cada humano: upsert User + TreeMember (role: MEMBER, salvo el adder que es ADMIN)
6. El adder original se mantiene como ADMIN
7. Se envía mensaje de bienvenida/rejoin como antes

## Decisiones

- **Python subprocess, no librería Node**: Telethon es Python nativo. Node no tiene cliente MTProto maduro. Subprocess con JSON stdin/stdout es simple y confiable.
- **No blocking**: si el sync falla, el bot sigue funcionando (try/catch, log del error)
- **Batch upsert**: una transacción Prisma con `createMany`/`updateMany` para eficiencia
- **Session efímera**: Telethon usa `StringSession` — no requiere archivo de sesión persistente

## Variables de entorno

```env
# backend/.env
TELEGRAM_API_ID=31560427
TELEGRAM_API_HASH=2aac1e3f5046329fefb782cda1c2b89f
```
