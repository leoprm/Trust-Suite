# Puente de Contratación Fase 2 — Propuesta

## Why

La Fase 1 (C3/C4) define el puente básico con 3 métricas. Leo quiere extenderlo con:
- 2 datos extra: startDate y endDate (estimadas por Ari), location
- Sistema de postulación: candidatos reciben DM con botón "Postular"
- Resultado final: lista de postulantes + top 3 recomendados

## What Changes

- **hiring-request.json extendido**: { minSkillLevel, minSatisfactionPersonal, minSatisfactionGrupal, startDate, endDate, location }
- **hiringBridge.ts actualizado**: pasa 6 datos al support agent (antes 3)
- **hiring-evaluator.py Fase 2**: 
  1. Filtra candidatos que cumplen TODOS los mínimos
  2. Envía DM a cada uno con detalles del trabajo + botón "Postular"
  3. Espera deadline (endDate) o N postulaciones
  4. Genera hiring-result.json con { applicants, recommendedTop3 }
- **Bot callback**: `postular_{taskId}` — candidato presiona y se suma a la lista
- **hiring-result.json extendido**: incluye lista completa de postulantes

## Impact

- **Modificado**: hiringBridge.ts (+campos), hiring-evaluator.py (+notificación + postulación)
- **Modificado**: bot/index.ts (+callback postular_)
- **Skill Ari**: actualizar con fechas estimadas y ubicación
