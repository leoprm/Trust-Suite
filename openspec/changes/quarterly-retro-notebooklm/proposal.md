# Retrospectiva Trimestral + NotebookLM Obligatorio — Propuesta

## Why

Actualmente Ari hace retrospectiva mensual con NotebookLM opcional. Leo quiere:
1. NotebookLM **obligatorio** en cada informe (mensual y trimestral)
2. Informe **trimestral** por trimestres calendario (Q1=ene-mar, Q2=abr-jun, Q3=jul-sep, Q4=oct-dic)
3. El trimestral **reemplaza** al mensual cuando coinciden (mar, jun, sep, dic)

## What Changes

- **monthlyRetrospective.ts**: NotebookLM de opcional → obligatorio. Si falla el paso de NotebookLM, el informe igual se publica (el análisis de Hermes es el core, NotebookLM es enriquecimiento).
- **Nuevo `retroInstructionsQuarterly()`**: variante trimestral con secciones extra: "📈 Evolución del trimestre" y "📊 Comparativa vs trimestre anterior".
- **Nuevo cron trimestral**: se ejecuta el último día de mar, jun, sep, dic. Usa `concat_month.py` para concatenar 3 meses. El scheduler mensual se **suprime** cuando toca trimestral.
- **System prompts actualizados**: ambos incluyen el paso 4 de NotebookLM como obligatorio.

## Impact

- **Modificado**: `src/services/monthlyRetrospective.ts` — +80 líneas
- **Modificado**: `src/index.ts` — registro de cron trimestral
- **Sin cambios en DB**
- **Sin nuevos archivos**
