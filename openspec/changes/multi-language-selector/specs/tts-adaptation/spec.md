## ADDED Requirements

### Requirement: Mapeo de voces TTS por idioma
El servicio TTS SHALL seleccionar automáticamente la voz de Edge TTS según el
`User.language`. Cada idioma soportado tendrá una voz configurada.

#### Scenario: Voz en español
- **WHEN** un usuario con `language='es'` recibe un mensaje con audio
- **THEN** se usa la voz `es-MX-DaliaNeural` (configurada por defecto)

#### Scenario: Voz en inglés
- **WHEN** un usuario con `language='en'` recibe un mensaje con audio
- **THEN** se usa la voz `en-US-JennyNeural`

#### Scenario: Idioma sin voz configurada
- **WHEN** un usuario tiene un idioma sin mapeo de voz explícito
- **THEN** se hace fallback a `es-MX-DaliaNeural`

### Requirement: Selector de idioma siempre con audio en inglés
Independientemente del idioma del usuario (o si no tiene), el mensaje de selección
de idioma SHALL siempre enviarse con audio TTS en inglés, usando `en-US-JennyNeural`.

#### Scenario: Audio del selector
- **WHEN** el bot envía el mensaje "Select your language / Selecciona tu idioma"
- **THEN** el audio TTS se genera con voz `en-US-JennyNeural` y texto "Select your language"

### Requirement: Configuración de voces
El mapeo de voces SHALL estar en un objeto de configuración, no hardcodeado en cada
llamada, para facilitar agregar nuevos idiomas.

#### Scenario: Agregar un nuevo idioma con voz
- **WHEN** se agrega soporte para un nuevo idioma (ej. portugués)
- **THEN** solo se necesita agregar la entrada en `VOICE_MAP` y el archivo `locales/pt.json`
