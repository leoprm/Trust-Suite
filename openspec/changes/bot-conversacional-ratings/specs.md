# Specs: Bot Conversacional con Ratings

## SPEC-1: Detección de modo (comando vs conversación)

**Objetivo:** Diferenciar mensajes con `/comando` de mensajes naturales.

**Reglas:**
- Si el mensaje empieza con `/` después de la mención → modo comando
- Si el mensaje no empieza con `/` → modo conversación natural
- Si el mensaje no menciona al bot → modo análisis pasivo

**Validación:**
- `@TrustMakerBot /info` → comando
- `@TrustMakerBot info` → conversación (el usuario quiere preguntar algo)
- `@TrustMakerBot ¿qué necesidades hay?` → conversación
- `Hola equipo, ¿cómo va la nueva feature?` → análisis pasivo

## SPEC-2: Conversación natural vía concierge

**Objetivo:** Enviar mensajes naturales al Hermes Agent y devolver la respuesta.

**Flujo:**
1. Extraer `treeId` del chat de Telegram (`telegramChatId` → `tree.id`)
2. Llamar `POST /api/concierge` con:
   ```json
   {
     "message": "texto del usuario sin la mención",
     "treeId": "<treeId>",
     "agentId": null
   }
   ```
3. Headers: `Authorization: Bearer <HERMES_API_SERVER_KEY>`, `X-Hermes-Session-Key: tg-user-<telegramUserId>`
4. Recibir `{ reply: "..." }` y enviarlo al grupo
5. Si timeout (>30s), responder "El agente está pensando, vuelve a intentarlo."

**Validación:**
- Mensaje natural → respuesta del Hermes Agent en <30s
- Sin árbol asociado → "Este grupo no tiene un árbol. Agrega el bot a un grupo nuevo para crear uno."

## SPEC-3: Análisis pasivo de feedback

**Objetivo:** Detectar feedback sobre necesidades/soluciones en mensajes que no mencionan al bot.

**Flujo:**
1. Para cada mensaje en el grupo (sin mención al bot):
   a. Buscar si contiene títulos de necesidades existentes en el árbol (fuzzy match)
   b. Si hay match, analizar sentimiento:
      - Positivo → rating 6-10 proporcional a intensidad
      - Negativo → rating 1-4 
      - Neutral → ignorar
   c. Si hay sentimiento claro, registrar rating:
      ```json
      POST /api/ratings
      {
        "agentId": "<agent asociado a la necesidad>",
        "treeId": "<treeId>",
        "role": "analyst",
        "stars": <1-10>
      }
      ```

**Detección de sentimiento (v1 simple):**
- Palabras positivas: "excelente", "buenísimo", "genial", "funciona", "resolvió", "útil", "gracias"
- Palabras negativas: "malo", "no funciona", "error", "problema", "roto", "falla", "lento"
- Intensidad: cantidad de palabras positivas/negativas + signos de exclamación + emojis

**Validación:**
- "¡La solución de seguridad quedó excelente!" → rating 9 para la necesidad "Protocolo de seguridad..."
- "Eso no funciona, está roto" → rating 2
- "Buenos días equipo" → sin rating (neutral)

## SPEC-4: API Key auth en concierge y ratings

**Objetivo:** Permitir que el bot autentique sin JWT de usuario.

**Cambio:**
- Middleware `authenticateJWT` debe aceptar header `Authorization: Bearer <API_SERVER_KEY>` como alternativa
- Si el token coincide con `HERMES_API_SERVER_KEY`, asignar `req.user = { id: 'telegram-bot', role: 'SYSTEM' }`
- `/api/ratings` ya usa `authenticateJWT` → hereda el cambio

## SPEC-5: Skills de Trust Maker en system prompt

**Objetivo:** Hermes Agent debe conocer las herramientas de Trust Maker al responder.

**Cambio en conciergeController:**
- Agregar al system prompt instrucciones del skill `trust-maker`:
  - Lista de herramientas disponibles (list_trees, get_needs, get_ideas, propose_idea, vote...)
  - Cómo usarlas (formato de comandos)
  - Contexto del árbol actual

**Validación:**
- Preguntar "¿qué necesidades hay?" → Hermes Agent lista necesidades reales del árbol
- Preguntar "crea una necesidad de testing" → Hermes Agent la crea y confirma
