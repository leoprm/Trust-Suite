# Propuesta: Sync Completo de Miembros al Join/Rejoin

## Problema
Cuando Ari es agregada o re-agregada a un grupo de Telegram, solo registra al usuario que la invitó como TreeMember. Los demás miembros del grupo (7 personas en Primatest) quedan invisibles para Ari, que reporta "0 miembros" aunque el grupo tiene 8.

La causa raíz es que Telegram Bot API no expone un endpoint para listar todos los miembros de un grupo — solo `getChatMember(chat_id, user_id)` (consulta individual) y `getChatAdministrators` (admins).

## Solución
Usar **MTProto** (Telethon) — el protocolo nativo de Telegram — para iterar TODOS los participantes del grupo cuando Ari entra/reingresa, y crear/actualizar sus registros `User` + `TreeMember` en la DB.

## Impacto
- Archivos: `bot/index.ts` (handler `my_chat_member`), nuevo `bot/telegramClient.ts`
- Nuevas dependencias: `telethon` (Python, ya disponible en el sistema)
- Nuevas variables de entorno: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`
- Sin breaking changes — todo es aditivo
