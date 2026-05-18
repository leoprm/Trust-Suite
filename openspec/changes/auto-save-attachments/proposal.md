# Propuesta: Biblioteca de Archivos con Búsqueda por IA

## Problema
Los archivos que se comparten en el grupo se pierden en el historial de Telegram. No hay forma de recuperar "la foto del perro que mandé hace unos días" sin hacer scroll manual.

## Solución
1. **Auto-guardado**: Todo archivo (foto, documento, video, audio, voz) se guarda automáticamente en `media/<senderName>/<fecha>_<filename>`
2. **Indexado con IA**: Imágenes se indexan con CLIP (embeddings) para búsqueda semántica
3. **Búsqueda natural**: "Ari, mándame la foto del perro" → Ari busca con CLIP → devuelve matches iterativos ("¿es esta?" → sí/no → siguiente)
4. **Organización por usuario**: Carpetas por senderName

## Impacto
- Archivos: `bot/index.ts`, `hermesBridge.ts` (nuevo tool para Ari)
- Nuevo: `lib/clip_index.py` (indexado y búsqueda CLIP)
- DB: SQLite en `media/<treeId>/index.db`
- Sandbox: archivos en `media/<treeId>/<senderName>/`
