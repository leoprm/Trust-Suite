# Propuesta: Onboarding — Subárbol + WhatsApp

## ¿Por qué?

El segundo mensaje del onboarding actual solo pregunta "¿Qué tipo de organización son y cuáles
son sus objetivos?". Falta capturar:
- Si el árbol es un **subárbol** de otro grupo → necesario para jerarquía parent/child (T19)
- El **código del árbol superior** si es subárbol → para linkear automáticamente
- El **ID del grupo de WhatsApp** → para relacionar el árbol con su grupo de WhatsApp

## ¿Qué cambia?

- **Modificado**: Segunda pregunta del onboarding ahora incluye 2 preguntas adicionales:
  1. "¿Son un subárbol de otro grupo?" (Sí/No inline buttons)
  2. Si Sí → "Ingresa el código del árbol superior"
  3. "¿Cuál es el ID/grupo de WhatsApp? (opcional, envía /skip)"
- **Nuevo**: Campo `whatsappGroupId` en modelo `Tree`
- **Modificado**: `handleOnboardingResponse` → soporta multi-step con estado en sesión

## Capacidades

1. **onboarding-subtree** — Preguntar si es subárbol y capturar código del padre
2. **onboarding-whatsapp** — Capturar ID del grupo de WhatsApp

## Impacto

- **Backend**: `bot/index.ts` (mensaje onboarding + handler), `prisma/schema.prisma` (nuevo campo)
- **DB**: Migración — columna `whatsappGroupId` en Tree
- **Frontend**: No aplica
