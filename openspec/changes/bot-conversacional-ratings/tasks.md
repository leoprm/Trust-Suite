# Tasks: Bot Conversacional con Ratings

## SPEC-4: API Key auth

- [ ] **S4.1** Modificar `middleware/authMiddleware.ts`: aceptar `Authorization: Bearer <API_SERVER_KEY>` como alternativa a JWT. Si el token coincide con `HERMES_API_SERVER_KEY`, setear `req.user = { id: 'telegram-bot', role: 'SYSTEM' }`.

## SPEC-2: Conversación natural vía concierge

- [ ] **S2.1** Crear `src/bot/messages.ts` con `handleNaturalMessage(prisma, ctx)` que:
  - Extrae el texto sin la mención `@TrustMakerBot`
  - Busca el árbol asociado al chat (`findTreeByChat`)
  - Llama a `POST /api/concierge` con API key auth
  - Maneja timeout (30s) y errores
  - Retorna la respuesta formateada
- [ ] **S2.2** Usar `X-Hermes-Session-Key: tg-user-<telegramUserId>` para mantener sesión por usuario

## SPEC-1: Detección de modo en bot/index.ts

- [ ] **S1.1** Modificar `bot/index.ts` message:text handler:
  - Siempre ejecutar `analyzeMessage()` para análisis pasivo
  - Si el mensaje menciona al bot y empieza con `/` → comando (handler actual)
  - Si el mensaje menciona al bot y NO empieza con `/` → `handleNaturalMessage()`
  - Si no menciona al bot → solo análisis pasivo (no responder)

## SPEC-5: Skills en system prompt

- [ ] **S5.1** Modificar `conciergeController.ts`: agregar al system prompt las herramientas del skill `trust-maker` (list_trees, get_needs, get_ideas, propose_idea, vote_on_idea, register_result) con instrucciones de uso

## SPEC-3: Analizador de feedback

- [ ] **S3.1** Crear `src/bot/analyzer.ts` con `analyzeMessage(prisma, ctx, chatId)`:
  - Buscar necesidades OPEN del árbol
  - Fuzzy match del texto del mensaje contra títulos de necesidades
  - Análisis de sentimiento keyword-based (v1)
  - Si hay sentimiento claro: `POST /api/ratings` con stars 1-10
- [ ] **S3.2** `fuzzyMatch(text, title)`: detectar si el mensaje menciona una necesidad (substring + normalización básica)
- [ ] **S3.3** `analyzeSentiment(text)`: keyword-based positivo/negativo → score 1-10
