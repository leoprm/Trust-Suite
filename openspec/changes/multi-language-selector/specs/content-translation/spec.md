## ADDED Requirements

### Requirement: Migración de textos hardcodeados a i18n
Todos los textos visibles al usuario en los handlers del bot SHALL migrarse a
claves i18n. No se permiten strings en español o inglés hardcodeados en el código.

#### Scenario: Texto de bienvenida
- **WHEN** un usuario completa el onboarding
- **THEN** el mensaje de bienvenida usa `t('onboarding.welcome', { lng, name })` en vez de string hardcodeado

#### Scenario: Error genérico
- **WHEN** ocurre un error inesperado
- **THEN** el mensaje usa `t('errors.generic', { lng })` en vez de "Ocurrió un error"

### Requirement: Traducciones iniciales generadas con IA
Los archivos JSON de traducción para inglés SHALL generarse una vez con IA (Claude
o similar) tomando como base los textos en español existentes. Se validan manualmente
antes de commit.

#### Scenario: Generación de en.json
- **WHEN** se crea el archivo `locales/en.json`
- **THEN** cada clave tiene su traducción al inglés, revisada por un hablante
- **AND** se preservan los placeholders de interpolación (`{{name}}`, `{{count}}`)

### Requirement: Archivos mínimos requeridos
El sistema SHALL tener al menos `es.json` y `en.json` completos. Los nombres de
idiomas en el selector usan el nombre nativo (Español, English).

#### Scenario: Idiomas soportados
- **WHEN** se consulta `getSupportedLanguages()`
- **THEN** devuelve `[{ code: 'es', name: 'Español', flag: '🇲🇽' }, { code: 'en', name: 'English', flag: '🇺🇸' }]`
