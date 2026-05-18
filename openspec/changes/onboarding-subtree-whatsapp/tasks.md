# Tareas: Onboarding — Subárbol + WhatsApp

## 1. Schema + Mensaje multi-step

- [x] 1.1 Agregar `whatsappGroupId String?` al modelo Tree en schema.prisma + migración
- [x] 1.2 Reescribir el segundo mensaje de onboarding (`bot/index.ts` ~línea 449):
  - Mantener la pregunta original de objetivos
  - Agregar: "¿Es este un subárbol de otro grupo?" con botones inline [🔄 Sí, es subárbol] [🌳 No, es independiente]
  - Agregar placeholder para capturar respuestas multi-step
- [x] 1.3 Modificar `handleOnboardingResponse` para manejar el flujo multi-step:
  - Paso 1: respuesta a objetivos → guardar en tree.description/objectives
  - Paso 2: preguntar si es subárbol (inline buttons)
  - Paso 3 (si Sí): pedir código del árbol padre → validar existe → set parentTreeId
  - Paso 4: pedir ID del grupo de WhatsApp → guardar whatsappGroupId (o /skip)
- [x] 1.4 Agregar estado de onboarding en `BotSessionData`: `onboardingStep`, `onboardingTreeId`

## 2. Locales + Validación

- [x] 2.1 Agregar textos a `locales/es.json` y `locales/en.json`:
  - `onboarding.subtree_question`, `onboarding.subtree_yes`, `onboarding.subtree_no`
  - `onboarding.enter_parent_code`, `onboarding.parent_not_found`
  - `onboarding.whatsapp_question`, `onboarding.whatsapp_skip`
- [x] 2.2 Validar código del árbol padre: buscar por código en DB, mostrar nombre si existe

## 3. Tests

- [x] 3.1 Test: nuevo árbol independiente → flujo completo (objetivos → no subárbol → whatsapp)
- [x] 3.2 Test: subárbol → ingresa código padre válido → linkeado correctamente
- [x] 3.3 Test: subárbol → código padre inválido → mensaje de error y re-pregunta
- [x] 3.4 Test: /skip en WhatsApp → campo queda null
