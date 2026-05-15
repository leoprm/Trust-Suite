# Tareas: Selector de Idioma Universal

## 1. Schema + Infraestructura i18n

- [ ] 1.1 Agregar `language String @default("es")` al modelo User en schema.prisma + migración
- [ ] 1.2 Crear `backend/src/bot/i18n.ts` — initI18n(), t(), getSupportedLanguages()
- [ ] 1.3 Inicializar i18next en `createBot()` (antes del bot.start)

## 2. Archivos de traducción

- [ ] 2.1 Crear `backend/locales/es.json` con todos los textos actuales del bot (namespaces: common, onboarding, tree, needs, voting, errors, dm)
- [ ] 2.2 Crear `backend/locales/en.json` con traducciones al inglés (generadas con IA, validadas)

## 3. Selector de idioma en onboarding

- [ ] 3.1 Crear `showLanguageSelector(ctx)` en messages.ts — inline keyboard con 🇺🇸 English / 🇲🇽 Español + audio TTS en inglés
- [ ] 3.2 Handler callback `lang:en` y `lang:es` — guarda User.language, responde en idioma seleccionado
- [ ] 3.3 Modificar `/start` y primer mensaje: detectar si falta language → mostrar selector antes del onboarding

## 4. Migrar textos del bot a i18n

- [ ] 4.1 Migrar `commands.ts` — /start, /help, /language y resto de comandos
- [ ] 4.2 Migrar `messages.ts` — onboarding, respuestas naturales, creación de necesidades
- [ ] 4.3 Migrar `dm.ts` — menú personal, perfil
- [ ] 4.4 Migrar `formatters.ts` — formatos de texto (necesidades, resultados, etc.)
- [ ] 4.5 Migrar `voting.ts` — mensajes de votación
- [ ] 4.6 Migrar `approval.ts` — mensajes de aprobación

## 5. TTS adaptativo

- [ ] 5.1 Agregar `VOICE_MAP` en ttsService.ts — mapeo idioma → voz Edge TTS
- [ ] 5.2 Modificar `generateVoice()` en bot/index.ts — usar VOICE_MAP[user.language]
- [ ] 5.3 Selector de idioma siempre manda audio en inglés (voz en-US-JennyNeural)

## 6. Tests + Verificación

- [ ] 6.1 Test: usuario sin idioma → selector → selecciona → onboarding en idioma correcto
- [ ] 6.2 Test: usuario con idioma → /start directo sin selector
- [ ] 6.3 Test: cambio de idioma con /language
- [ ] 6.4 Test: TTS usa voz correcta según idioma
- [ ] 6.5 Verificar que todos los textos del bot aparecen en locales JSON (sin strings hardcodeados)
