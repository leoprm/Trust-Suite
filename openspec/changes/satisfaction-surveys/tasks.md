# Tasks — Encuestas de Satisfacción

## 1. Schema + Migración

- [ ] 1.1 Agregar modelo SatisfactionSurvey: id, treeId, targetUserId, skill, createdBy, announcedAt, closesAt, visible (bool). Modelo SurveyVote: id, surveyId, voterId (hash anónimo), score (1-10). @unique([surveyId, voterId]).
- [ ] 1.2 Agregar modelo SatisfactionScore: userId, skill, avgScore, totalSurveys. @unique([userId, skill]).

## 2. API Endpoints

- [ ] 2.1 POST /api/trees/:id/surveys — crear encuesta (admin). Body: { targetUserId, skill, closesAt }. Auto-set announcedAt = now.
- [ ] 2.2 POST /api/trees/:id/surveys/:surveyId/vote — votar anónimo. Body: { score }. Hash del voterId para anonimato.
- [ ] 2.3 GET /api/trees/:id/surveys/:surveyId/results — solo visible si closed + visible=true.

## 3. Bot Commands

- [ ] 3.1 /encuesta — admin crea encuesta interactiva (pregunta target, skill, duración).
- [ ] 3.2 /votar — miembro vota. El bot envía mensaje privado con escala 1-10.
- [ ] 3.3 Anuncio automático 3 días antes del cierre en el grupo.

## 4. Cron de Cierre

- [ ] 4.1 Cron diario: cerrar encuestas vencidas. Al cerrar, calcular avg, guardar en SatisfactionScore, publicar resultado en el grupo.

## 5. Integration Test

- [ ] 5.1 Crear encuesta → miembros votan → cerrar → verificar avg correcto y visibilidad.
