# Worker Levels + XP + Decay — Propuesta

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18  

## Problema

Los workers humanos del marketplace no tienen progresión ni especialización. Cualquiera puede tomar cualquier tarea sin importar su experiencia real. No hay incentivo para mejorar ni penalización por inactividad.

## Solución

Un sistema de **niveles por skill** con XP que sube al completar tareas y **decae con el tiempo** (porcentaje creciente por nivel). Ari evalúa tanto la dificultad de las tareas (1-10) como la calidad de las entregas. El nivel determina qué tareas puede tomar un worker y multiplica su tarifa base.

## Principios de diseño

1. **Nivel por skill, no global** — un diseñador nivel 5 puede ser programador nivel 1
2. **Evaluación centralizada por Ari** — misma vara para todos los árboles
3. **Workers sin árbol** — los workers de Telegram/WhatsApp no pertenecen a ningún árbol, su progresión es cruza-árboles
4. **Matching con margen** — `worker.nivel(skill) >= tarea.dificultad - 2` (puede tomar desafíos)
5. **Precio × dificultad** — tarifa base del worker × multiplicador por dificultad
6. **Decaimiento progresivo** — a mayor nivel, mayor % de XP perdido por día (incentiva actividad constante)

## Fórmulas

```
XP ganado = dificultad × 10 × calidad (0.0–1.0)
Nivel = floor(XP / 50) + 1
Tarifa efectiva = tarifa base × (1 + (dificultad - 1) × 0.15)
Decay diario = XP × (nivel × 0.5)%  (ej: nivel 4 = 2% diario)
```

## Componentes nuevos

1. **Schema**: `WorkerSkill` (xp, nivel por skill) + `WorkerLevelHistory` (auditoría)
2. **LevelingService**: calcular XP, detectar level-up, computar decay
3. **Ari auto-evaluación**: difficulty al crear tarea, quality al recibir entrega
4. **Decay cron**: job diario que aplica decay a todos los workers activos
5. **Matching por nivel**: filtro adicional en matchingService.ts
6. **Precio dinámico**: multiplicador por dificultad en la tarifa

## Tareas estimadas

7 tareas Kanban (~350-400 LOC total)
