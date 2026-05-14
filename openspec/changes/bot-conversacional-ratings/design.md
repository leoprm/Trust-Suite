# Design: Bot Conversacional con Ratings

## Arquitectura

```
Grupo Telegram
      │
      ▼
bot/index.ts (message:text handler)
      │
      ├── ¿Menciona @TrustMakerBot?
      │     │
      │     ├── ¿Empieza con /?
      │     │     └── commands.ts (handler actual, sin cambios)
      │     │
      │     └── Texto natural
      │           └── messages.ts (NUEVO)
      │                 └── POST /api/concierge → Hermes Agent → reply
      │
      └── No menciona
            └── analyzer.ts (NUEVO)
                  ├── Fuzzy match necesidades
                  ├── Análisis de sentimiento
                  └── POST /api/ratings (si aplica)
```

## Flujo detallado

### Modo conversación (messages.ts)

```typescript
// src/bot/messages.ts
export async function handleNaturalMessage(
  prisma: PrismaClient,
  ctx: Context
): Promise<{ text: string } | null> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || !msg.text) return null;
  
  // 1. Extraer texto sin la mención
  const text = removeMention(msg.text);
  
  // 2. Buscar árbol del chat
  const tree = await findTreeByChat(prisma, ctx.chat.id.toString());
  if (!tree) return { text: noTreeError() };
  
  // 3. Mostrar "escribiendo..."
  await ctx.replyWithChatAction('typing');
  
  // 4. Llamar al concierge
  const reply = await callConcierge(tree.id, text, ctx.from?.id);
  
  // 5. Devolver respuesta
  return { text: reply };
}

async function callConcierge(treeId: string, message: string, userId: number): Promise<string> {
  const response = await fetch('http://localhost:3100/api/concierge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_SERVER_KEY}`,
      'X-Hermes-Session-Key': `tg-user-${userId}`,
    },
    body: JSON.stringify({ message, treeId }),
    signal: AbortSignal.timeout(30000),
  });
  
  const data = await response.json();
  return data.reply || 'Lo siento, no pude procesar tu mensaje.';
}
```

### Modo análisis (analyzer.ts)

```typescript
// src/bot/analyzer.ts
export async function analyzeMessage(
  prisma: PrismaClient,
  ctx: Context,
  treeId: string
): Promise<void> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || !msg.text) return;
  
  // 1. Buscar necesidades del árbol
  const needs = await prisma.need.findMany({
    where: { treeId, status: 'OPEN' },
    select: { id: true, title: true },
  });
  
  // 2. Fuzzy match: ¿el mensaje menciona alguna necesidad?
  const mentionedNeeds = needs.filter(n => 
    fuzzyMatch(msg.text.toLowerCase(), n.title.toLowerCase())
  );
  
  if (mentionedNeeds.length === 0) return;
  
  // 3. Análisis de sentimiento
  for (const need of mentionedNeeds) {
    const sentiment = analyzeSentiment(msg.text);
    if (sentiment.score === 0) continue; // neutral
    
    // 4. Buscar agente asociado a la necesidad
    const agent = await findAgentForNeed(prisma, need.id);
    if (!agent) continue;
    
    // 5. Registrar rating
    await fetch('http://localhost:3100/api/ratings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_SERVER_KEY}`,
      },
      body: JSON.stringify({
        agentId: agent.id,
        treeId,
        role: 'analyst',
        stars: sentiment.score,
      }),
    });
  }
}

// V1: keyword-based sentiment analysis
function analyzeSentiment(text: string): { score: number; label: string } {
  const positive = ['excelente', 'buenísimo', 'genial', 'funciona', 'resolvió', 
                     'útil', 'gracias', '👍', '🎉', '❤️', '🚀', '✅'];
  const negative = ['malo', 'no funciona', 'error', 'problema', 'roto', 'falla', 
                    'lento', '👎', '❌', '😡', '🤬'];
  
  let score = 5; // neutral start
  const text_lower = text.toLowerCase();
  
  for (const word of positive) {
    if (text_lower.includes(word)) score += 1;
  }
  for (const word of negative) {
    if (text_lower.includes(word)) score -= 1;
  }
  
  // Clamp 1-10
  score = Math.max(1, Math.min(10, score));
  
  return {
    score,
    label: score > 6 ? 'positive' : score < 4 ? 'negative' : 'neutral',
  };
}
```

## Cambios en bot/index.ts

```typescript
bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  
  // ── Siempre ejecutar análisis pasivo ──
  if (chatId) {
    analyzeMessage(prisma, ctx, chatId).catch(err => 
      console.error('[analyzer] Error:', err.message)
    );
  }
  
  // ── Solo responder si menciona al bot ──
  const mentioned = extractCommandText(ctx.message.text);
  if (mentioned === null) return; // no menciona al bot
  
  // ¿Es comando o conversación?
  if (mentioned.startsWith('/')) {
    // Modo comando (existente)
    const parsed = parseCommand(mentioned.slice(1)); // quitar el /
    // ... resto del handler actual
  } else {
    // Modo conversación natural
    const result = await handleNaturalMessage(prisma, ctx);
    if (result) {
      await ctx.reply(result.text, { parse_mode: 'Markdown' });
    }
  }
});
```

## API Key auth (middleware/authMiddleware.ts)

Agregar soporte para API key como alternativa a JWT:

```typescript
// En authenticateJWT:
const authHeader = req.headers.authorization;
if (authHeader?.startsWith('Bearer ')) {
  const token = authHeader.slice(7);
  
  // Intentar como API key primero
  if (token === process.env.HERMES_API_SERVER_KEY) {
    req.user = { id: 'telegram-bot', role: 'SYSTEM' };
    return next();
  }
  
  // Luego intentar como JWT
  // ... lógica existente
}
```

## Skills en system prompt (conciergeController.ts)

Agregar después del contexto del árbol:

```typescript
contextLines.push('');
contextLines.push('## Trust Maker Tools (vía Hermes Agent)');
contextLines.push('Tienes acceso a las siguientes operaciones sobre este árbol:');
contextLines.push('- list_trees() — árboles disponibles');
contextLines.push('- get_needs(treeId) — necesidades del árbol');
contextLines.push('- get_ideas(needId) — ideas para una necesidad');
contextLines.push('- propose_idea(content, treeId) — proponer nueva idea');
contextLines.push('- vote_on_idea(ideaId, needId) — votar por una idea');
contextLines.push('- register_result(needId, ideaId, summary, evaluation) — registrar resultado');
contextLines.push('');
contextLines.push('Cuando el usuario pregunte por datos del árbol, usa estas herramientas.');
contextLines.push('No inventes información — consulta las herramientas para obtener datos reales.');
```

## Orden de implementación

1. **SPEC-4**: API Key auth (habilitador para todo lo demás)
2. **SPEC-2**: messages.ts + integración con concierge
3. **SPEC-1**: Detección de modo en bot/index.ts
4. **SPEC-5**: Skills en system prompt
5. **SPEC-3**: analyzer.ts + fuzzy match + sentimiento
