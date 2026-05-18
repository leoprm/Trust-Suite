# Specs: @TrustManagerBot

## SPEC-1: Deep-link de onboarding
- Link: `https://t.me/TrustManagerBot?start=<treeId>`
- Al recibir `/start <treeId>`: verificar que el árbol existe y es público/abierto
- Si no existe: "Este enlace no es válido"
- Si existe: iniciar flujo de registro

## SPEC-2: Flujo de registro (3 pasos)
1. **Términos legales**: mostrar markdown con términos, botón "Aceptar" / "Rechazar"
2. **Método de pago**: "¿Método de pago?" → opciones (Stripe, Paddle, "Por ahora no")
3. **Confirmación**: "¡Listo! Ya eres miembro del árbol X. Para manejar tu cuenta o cualquier duda, habla con @TrustManagerBot"

## SPEC-3: Menú de opciones pre-escritas
Al escribir a @TrustManagerBot, mostrar inline keyboard:
- 📋 Ver mis árboles
- 💳 Gestionar método de pago
- ❓ Preguntas frecuentes
- 📞 Hablar con TrustManager

## SPEC-4: Modo conversacional (20 turnos/mes)
- Al seleccionar "Hablar con TrustManager": "Escribe tu consulta (te quedan N turnos este mes)"
- Cada mensaje del usuario consume 1 turno
- Al agotar turnos: "Has alcanzado el límite de 20 consultas este mes. Se renovarán el día 1."
- Sin límite diario

## SPEC-5: Sin poderes de modificación
- TrustManager NO ejecuta comandos de sistema
- TrustManager NO modifica archivos
- TrustManager SOLO lee datos públicos del usuario (árboles, membresía)
- TrustManager NO usa skill_manage
- TrustManager NO accede a sandbox de árboles

## SPEC-6: Conteo de turnos
- Contador en JSON: `data/supportSessions.json`
- Campos: userId, month, turnsUsed, lastTurnAt
- Reset automático el día 1 de cada mes
