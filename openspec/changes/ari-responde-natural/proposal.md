# Propuesta: Ari responde naturalmente

## Problema
Actualmente Ari solo responde cuando la mencionan (@TrustMakerBot), le hacen reply, o es el único miembro del árbol. Esto la hace sentir como un bot de comandos, no como una asistente natural.

## Solución
Darle a Ari la capacidad de decidir cuándo hablar, basado en contexto:

1. **Escaneo de keywords**: El Bridge escanea cada mensaje en busca de palabras clave sobre Ari o Trust Maker
2. **Decisión contextual**: Cuando detecta keywords, envía los últimos 10 mensajes con nombres de usuario a Ari para que evalúe si debe responder
3. **Ventana de conversación**: Cuando Ari responde, se abre una ventana de 20 mensajes donde recibe TODOS los mensajes del grupo. En cada uno decide si seguir hablando. Si responde, el contador se reinicia. Si no, la ventana se cierra tras 20 mensajes sin respuesta
4. **Respuesta obligatoria**: Siempre responde si la tagean, le hacen reply, o le preguntan directamente

## Impacto
- Archivos: `hermesBridge.ts`, `index.ts`
- Nuevo estado: ventana de conversación por árbol
- Sin cambios en DB ni API
