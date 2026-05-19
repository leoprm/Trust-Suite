# Encuestas de Satisfacción — Propuesta

## Why

Cuando un miembro completa un trabajo y genera resultados, el árbol debe poder evaluar
la calidad del entregable. Encuesta anónima, privada, 1-10. Resultado agregado visible solo
al cerrar (24h después). Anuncio 3 días antes. Promedios por habilidad y por árbol.

## What Changes

- **Nueva tabla SatisfactionSurvey**: id, treeId, targetUserId, skill, createdBy, score(1-10),
  announcedAt, closesAt, visible. Encuesta anónima (no se revela quién votó qué).
- **Nueva tabla SatisfactionScore**: userId, skill, avgScore, totalSurveys — caché de promedios.
- **Nuevo servicio surveyService.ts**: crear encuesta, votar, cerrar y revelar resultado.
- **Bot commands**: /encuesta (admin crea), /votar (miembro vota anónimo).
- **Anuncio automático**: 3 días antes del cierre, el bot anuncia en el grupo fecha y tema.
- **Skill de Ari**: al completar trabajo, Ari dispara creación de encuesta vía API.

## Impact

- **2 nuevas tablas**: SatisfactionSurvey, SatisfactionScore
- **Nuevo archivo**: src/services/surveyService.ts (~100 LOC)
- **Modificado**: bot/index.ts (+2 comandos), controllers/ (+CRUD endpoints)
- **Cero tokens LLM** — matemática pura
