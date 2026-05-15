# Diseño: Selector de Idioma Universal

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│  Usuario manda /start o primer mensaje          │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  messages.ts / commands.ts                       │
│  ¿User.language existe?                          │
│  ├─ NO  → showLanguageSelector()                │
│  └─ SÍ  → flujo normal en user.language         │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  i18n.ts                                         │
│  t(key, lng, vars) → texto traducido            │
│  getSupportedLanguages() → [{code, name, flag}]  │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  locales/                                        │
│  ├── es.json  (default, completo)                │
│  └── en.json  (traducido con IA, validado)      │
└─────────────────────────────────────────────────┘
```

## Flujo de onboarding (nuevo)

1. Usuario manda primer mensaje o `/start`
2. Si `User.language` es null → `showLanguageSelector(ctx)`
   - Mensaje: "🌐 Select your language / Selecciona tu idioma"
   - Botones inline: `🇺🇸 English` (callback: `lang:en`), `🇲🇽 Español` (callback: `lang:es`)
   - **Audio TTS**: inglés, voz en-US-JennyNeural
3. Usuario presiona botón → callback handler en `messages.ts`
   - Guarda `prisma.user.update({ language })`
   - Responde en el idioma seleccionado: `t('onboarding.language_selected', { lng })`
   - Continúa con el flujo normal de onboarding (`t('onboarding.welcome', ...)`)
4. Si `User.language` ya existe → saltar paso 2-3

## Cambios en el código

### Nuevos archivos
- `backend/src/bot/i18n.ts` — init, t(), getSupportedLanguages()
- `backend/locales/es.json` — textos en español
- `backend/locales/en.json` — textos en inglés

### Archivos modificados
- `backend/src/bot/index.ts` — initI18n() en createBot(), handler callback `lang:*`
- `backend/src/bot/commands.ts` — /start adaptado, nuevo /language
- `backend/src/bot/messages.ts` — showLanguageSelector(), flujo condicional
- `backend/src/bot/dm.ts` — textos i18n en menú personal
- `backend/src/bot/formatters.ts` — textos i18n
- `backend/src/services/ttsService.ts` — VOICE_MAP por idioma
- `prisma/schema.prisma` — campo `language` en User
- `backend/src/bot/types.ts` — `language` en BotSessionData

### Modelo Prisma (cambio)
```prisma
model User {
  // ... existente
  language  String   @default("es")  // ISO 639-1, 2-5 chars
}
```

### VOICE_MAP (ttsService.ts)
```ts
const VOICE_MAP: Record<string, string> = {
  es: 'es-MX-DaliaNeural',
  en: 'en-US-JennyNeural',
};
const DEFAULT_VOICE = 'es-MX-DaliaNeural';
```

## No se modifica
- Frontend (chat-first v4, no hay UI web para esto)
- API REST (el cambio es solo en la capa de bot)
- Lógica de Concierge (no necesita i18n, solo backend)
