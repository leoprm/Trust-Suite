# Propuesta: Ari Retrospectiva Mensual

## Problema
Las conversaciones del grupo se pierden. No hay memoria organizacional. Los problemas recurrentes, oportunidades y patrones quedan invisibles.

## Solución
1. **Archivo diario**: El Bridge guarda toda la conversación en `conversations/<treeId>/<YYYY-MM-DD>.txt` con formato `[HH:MM] Usuario: mensaje` y `[HH:MM] [🎤 audio] Usuario: transcripción`
2. **Retención**: 3 meses (90 archivos). Auto-eliminar los más viejos
3. **Cron fin de mes**: concatenar los ~30 archivos del mes → enviar a Ari para análisis
4. **Sin keywords ni gatillantes**: Ari lee todo el texto y encuentra patrones por sí misma
5. **Informe condicional**: Ari decide si hay algo que valga la pena reportar. Si no, silencio

## Por qué es mejor que keywords
- Un LLM detecta matices que ningún regex puede
- No requiere mantener listas de palabras clave
- Captura problemas expresados de formas inesperadas
- Menos falsos positivos (solo reporta si realmente hay algo)

## Impacto
- Archivos: `bot/index.ts` (guardado de mensajes), `bot/scheduler.ts` (cron)
- Nuevo: `services/monthlyRetrospective.ts`
- Almacenamiento: `conversations/<treeId>/` (~30 archivos/mes, ~1-5MB c/u)
