# Propuesta: Bot Conversacional con Ratings

## Problema

El bot de Telegram `@TrustMakerBot` actualmente solo responde a comandos estructurados (`@TrustMaker info`, `@TrustMaker lista necesidades`, etc.). No puede mantener conversaciones naturales ni analizar el feedback implícito del grupo sobre necesidades y soluciones.

## Solución

Transformar `@TrustMakerBot` en un agente conversacional con dos modos:

### Modo 1: Conversación natural (menciones directas)
Cuando un usuario menciona `@TrustMakerBot` sin un comando `/`, el bot:
1. Detecta que no es un comando estructurado
2. Envía el mensaje a `POST /api/concierge` con `{ message, treeId }`
3. Hermes Agent responde con contexto del árbol y skills de Trust Maker
4. El bot reenvía la respuesta al grupo

### Modo 2: Analista de feedback (todos los mensajes)
El bot lee **todos** los mensajes del grupo y:
1. Detecta menciones a necesidades o soluciones existentes en el árbol
2. Analiza el sentimiento (positivo/negativo/neutral)
3. Genera ratings (1-10) para el modelo de IA asociado a la solución/necesidad
4. Registra el rating vía `POST /api/ratings`

### Auth del bot
El bot usará la API key de Hermes (`HERMES_API_SERVER_KEY`) para autenticarse contra `/api/concierge` y `/api/ratings`, evitando depender de JWT de usuario.

## Cambios requeridos

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/bot/index.ts` | Modificar | Detectar `/` vs texto natural, dispatchear a concierge |
| `src/bot/messages.ts` | Nuevo | Handler de mensajes naturales → concierge |
| `src/bot/analyzer.ts` | Nuevo | Analizador de feedback pasivo en todos los mensajes |
| `src/bot/commands.ts` | Modificar | Solo procesar si empieza con `/` |
| `src/controllers/conciergeController.ts` | Modificar | Aceptar auth por API key (no solo JWT) |
| `src/controllers/ratingController.ts` | Modificar | Aceptar auth por API key |
| `src/bot/formatters.ts` | Modificar | Formatear respuestas del concierge para Telegram |

## Skills de Hermes Agent

El endpoint `/api/concierge` debe inyectar el skill `trust-maker` en el system prompt para que Hermes Agent:
- Conozca las herramientas disponibles (listar árboles, necesidades, ideas, votar)
- Entienda el dominio de Trust Maker
- Responda con precisión sobre el estado del árbol

## No scope (para fases futuras)

- Sistema de decaimiento de XP cross-árbol
- Motor de asignación de puestos por habilidad
- Exploración automática para modelos nuevos
