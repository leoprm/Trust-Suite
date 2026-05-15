## ADDED Requirements

### Requirement: Motor i18next con archivos JSON
El backend SHALL usar `i18next` con archivos JSON de traducción organizados por
idioma en `backend/locales/`. Cada string de la interfaz del bot tendrá una clave
única y traducciones en todos los idiomas soportados.

#### Scenario: Obtener texto traducido
- **WHEN** el bot necesita enviar un mensaje (ej. "Árbol creado exitosamente")
- **THEN** se llama a `t('tree.created', { lng: user.language, name: tree.name })`
- **AND** se obtiene el texto en el idioma correcto con las variables interpoladas

#### Scenario: Idioma no soportado
- **WHEN** se solicita una traducción en un idioma sin archivo JSON
- **THEN** se hace fallback al idioma default (`es`)

#### Scenario: Clave de traducción faltante
- **WHEN** una clave no existe en el archivo del idioma solicitado
- **THEN** se hace fallback al valor en el idioma default (`es`)

### Requirement: Estructura de archivos de traducción
Los archivos de traducción SHALL estar en `backend/locales/<lang>.json` con
namespaces: `common`, `onboarding`, `tree`, `needs`, `voting`, `errors`, `dm`.

#### Scenario: Estructura de locales
- **WHEN** se inicializa i18next
- **THEN** carga `locales/es.json` y `locales/en.json` como mínimo
- **AND** los namespaces permiten carga lazy para no saturar memoria

### Requirement: Helper i18n.ts
Existirá un helper `backend/src/bot/i18n.ts` que exporte:
- `initI18n()` — inicializa i18next con los archivos JSON
- `t(key, lng, vars?)` — obtiene traducción con interpolación
- `getSupportedLanguages()` — devuelve lista de idiomas disponibles (código + bandera + nombre)

#### Scenario: Inicialización al arrancar
- **WHEN** el backend inicia
- **THEN** `initI18n()` se llama antes de `createBot()`
- **AND** i18next queda listo para usar en todos los handlers
