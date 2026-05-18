# Spec: Auto-guardado de Adjuntos

## WHEN foto compartida en grupo con árbol
- AND no está en modo `awaitingEvidence`
- THEN descargar la foto en máxima resolución
- AND guardar en sandbox del árbol
- AND responder con mensaje: "📎 Guardé esta imagen. ¿Qué quieres hacer?" + inline keyboard

## WHEN documento compartido en grupo con árbol
- AND no está en modo `awaitingEvidence`
- THEN descargar el documento (respetando nombre original)
- AND guardar en sandbox del árbol
- AND responder con mensaje: "📎 Guardé `{filename}`. ¿Qué quieres hacer?" + inline keyboard

## WHEN usuario presiona botón
- THEN callback handler procesa la acción según el botón
- AND edita el mensaje para confirmar la acción

## No aplica
- Grupos sin árbol mapeado → ignorar
- Modo evidencia (awaitingEvidenceTaskId) → comportamiento actual sin cambios
- DMs → ignorar (se puede @mencionar normalmente)
