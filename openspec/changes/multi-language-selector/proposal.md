# Propuesta: Selector de Idioma Universal (i18n + TTS)

## ¿Por qué?

Trust Maker actualmente solo habla español. Para ser accesible globalmente, la primera
pregunta del onboarding debe ser "¿en qué idioma quieres interactuar?" y todo el bot
debe adaptarse a esa selección — incluyendo la voz del TTS.

## ¿Qué cambia?

- **Nuevo**: Primera pregunta del onboarding → selector de idioma con botones inline
- **Nuevo**: Motor i18next con archivos JSON de traducción (`locales/en.json`, `locales/es.json`, etc.)
- **Nuevo**: Modelo `User.language` en Prisma (default `es`)
- **Nuevo**: TTS adaptativo — cada idioma mapea a una voz Edge TTS compatible
- **Modificado**: Todos los textos del bot se sirven desde i18next, no hardcodeados
- **Modificado**: `/start` y primer mensaje → flujo de selección de idioma antes que nada

## Capacidades

1. **language-selection** — Selector de idioma como primera interacción del onboarding
2. **i18n-engine** — Motor de traducción i18next + estructura de archivos JSON
3. **tts-adaptation** — Voz TTS automática según idioma del usuario
4. **content-translation** — Migración de textos hardcodeados a claves i18n

## Impacto

- **Backend**: Nuevo helper `i18n.ts`, carpeta `locales/`, modificación de todos los handlers de bot
- **DB**: Migración — columna `language` en tabla `User` (varchar(5), default 'es')
- **TTS**: Mapeo de voces por idioma en `ttsService.ts`
- **Frontend**: No aplica (chat-first v4)
- **Riesgo**: Las traducciones iniciales (EN) deben ser precisas — se generan una vez con IA y se validan
