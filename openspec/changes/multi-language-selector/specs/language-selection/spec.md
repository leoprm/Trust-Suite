## ADDED Requirements

### Requirement: Selector de idioma como primera interacción
Cuando un usuario inicia el bot por primera vez (sin `language` configurado), el bot
SHALL preguntar "Select your language / Selecciona tu idioma" con botones inline
ANTES de cualquier otra pregunta del onboarding.

#### Scenario: Usuario nuevo sin idioma
- **WHEN** un usuario sin `language` envía `/start` o su primer mensaje
- **THEN** el bot responde con el mensaje de selección de idioma + botones inline (🇺🇸 English, 🇲🇽 Español, etc.)
- **AND** el mensaje incluye audio TTS en inglés

#### Scenario: Usuario selecciona idioma
- **WHEN** el usuario presiona un botón de idioma (ej. "🇲🇽 Español")
- **THEN** se guarda `User.language = 'es'`
- **AND** el bot continúa con el flujo normal de onboarding en ese idioma
- **AND** todos los mensajes subsecuentes usan el idioma seleccionado

#### Scenario: Usuario ya tiene idioma configurado
- **WHEN** un usuario con `language` ya establecido envía `/start`
- **THEN** el bot responde directamente en su idioma, sin repetir el selector

#### Scenario: Cambiar idioma después
- **WHEN** un usuario envía `/language` o selecciona "Cambiar idioma" en el menú
- **THEN** el bot muestra el selector de idioma nuevamente
- **AND** al seleccionar, actualiza `User.language` y confirma en el nuevo idioma

### Requirement: Audio TTS en el mensaje de selección
El mensaje de selección de idioma SHALL incluir un audio TTS que diga la frase
en inglés para que el usuario pueda escucharlo aunque no lea el texto.

#### Scenario: Audio en selección de idioma
- **WHEN** el bot envía el mensaje de selección de idioma
- **THEN** se genera y envía un audio TTS en inglés con el texto "Select your language"
