# Propuesta: @TrustManagerBot — Bot de Soporte y Onboarding

## Problema
Los usuarios de Trust Maker necesitan:
1. Un mecanismo claro de registro e inscripción a árboles
2. Aceptación de términos legales
3. Ingreso de método de pago (opcional por ahora)
4. Soporte administrativo sin saturar a Ari ni dar acceso al servidor

## Solución
Crear **@TrustManagerBot**, un segundo bot de Telegram con tres funciones:

1. **Onboarding vía deep-link**: Ari invita "¿Quieres participar?" → link `t.me/TrustManagerBot?start=<treeId>` → página de registro
2. **Registro guiado**: términos legales → método de pago (opcional) → confirmación → "habla con @TrustManagerBot para cualquier duda"
3. **Soporte administrativo**: menú de opciones pre-escritas + opción "Hablar con TrustManager" que conecta con Hermes Agent (20 turnos/mes/usuario, sin límite diario)
4. **Sin poderes**: TrustManager no modifica servidor, no accede a DB de escritura, no crea skills

## Impacto
- `src/bot/trustManagerBot.ts` — nuevo: instancia del bot, handlers de menú y conversación
- `src/bot/menus/` — opciones pre-escritas
- `src/controllers/onboardingController.ts` — nuevo: registro, términos, método de pago
- `src/services/supportSessionService.ts` — nuevo: límite 20 turnos/mes
- `.env` — TRUST_MANAGER_BOT_TOKEN
