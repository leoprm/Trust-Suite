# Spec: Bridge Decision Engine

## T1 — scanForKeywords
**File:** `backend/src/bot/hermesBridge.ts`

Nueva función que recibe un string y devuelve `boolean` si contiene alguna keyword:
- `ari`, `trust maker`, `trustmaker`, `árbol`, `tree`, `agente`, `asistente`, `@TrustMakerBot`

Case-insensitive. Debe correr rápido (sin DB, sin I/O).

## T2 — collectRecentMessages
**File:** `backend/src/bot/hermesBridge.ts`

Nueva función que recibe `chatId` y `count`, usa la API de Telegram (`ctx.api.getChat` o similar) para obtener los últimos N mensajes del grupo con:
- `firstName` del usuario que envió cada mensaje
- `text` del mensaje

Devuelve array de `{displayName, text}`.

## T3 — Ventana de conversación (ConversationWindow)
**File:** `backend/src/bot/hermesBridge.ts`

Mapa en memoria `Map<treeId, {active: boolean, remaining: number}>`.

- `openWindow(treeId)`: activa ventana con 20 mensajes
- `resetWindow(treeId)`: reinicia contador a 20
- `tickWindow(treeId)`: decrementa contador, si llega a 0 cierra ventana
- `isWindowActive(treeId)`: boolean
- `closeWindow(treeId)`: cierra ventana

## T4 — shouldAriRespond (modo decisión)
**File:** `backend/src/bot/hermesBridge.ts`

Nueva función o modo de `routeToHermes()`:
- Envía a Hermes Agent un prompt especial con los últimos 10 mensajes + nombres
- System prompt incluye reglas de decisión
- Ari responde `NO_RESPONSE` si decide callar, o el texto de respuesta
- La función parsea y devuelve `{shouldRespond: boolean, text?: string}`

## T5 — Modificar handler de grupo
**File:** `backend/src/bot/index.ts` (línea ~1698)

Nuevo flujo antes del gate `cmdText === null`:

```
1. Si tagged/reply → openWindow + routeToHermes directo
2. Si conversationWindow activa → tickWindow → shouldAriRespond()
   - Si responde → resetWindow + enviar respuesta
   - Si no → closeWindow si remaining=0
3. Si no hay ventana activa → scanForKeywords()
   - Si keywords → openWindow + shouldAriRespond()
   - Si no → skip
```

## T6 — DM handler
**File:** `backend/src/bot/index.ts` (línea ~1116)

Los DMs siempre deben ir directo a Ari (sin keywords ni ventana). Comportamiento actual se mantiene.

## Reglas de Ari (en system prompt)

```
DECISION RULES:
- You MUST respond when: tagged (@TrustMakerBot), replied to your message, or directly asked a question
- When keywords about you or Trust Maker appear but you're not directly addressed: evaluate if your input adds value
- In a conversation window: you receive all messages. Respond only when you have something meaningful to add
- Stay silent when: off-topic chat, greetings between members, logistics unrelated to the tree
- Be warm and natural. You're a community member, not a command bot.
```
