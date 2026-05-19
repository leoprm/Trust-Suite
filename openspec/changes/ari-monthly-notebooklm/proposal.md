# Ari Monthly Retrospective + NotebookLM — Propuesta

## Why

Ari ya hace retrospectiva mensual (monthlyRetrospective.ts) con un system prompt de 3 secciones.
Pero no usa NotebookLM para enriquecer el análisis con los archivos del sandbox ni para crear
presentaciones. Leo quiere que Ari use NotebookLM en su flujo mensual.

## What Changes

- **Skill `trust-notebooklm`**: agregar workflow "Presentación Mensual" con pasos:
  1. Revisar archivos del sandbox y seleccionar los relevantes
  2. Subirlos al notebook vía `/notebooklm/source`
  3. Crear un prompt de presentación explicando lo que se quiere comunicar
  4. Usar `/notebooklm/ask` para generar contenido analítico
  5. Guardar el resultado en el sandbox como `monthly-presentation-{mes}.md`
- **monthlyRetrospective.ts**: modificar `retroInstructions()` para añadir paso de NotebookLM:
  instruir a Ari que después del informe, suba archivos relevantes a NotebookLM y
  genere un análisis complementario usando el notebook del árbol.

## Impact

- **Modificado**: `~/.hermes/skills/trust-maker/trust-notebooklm/SKILL.md` (+40 líneas)
- **Modificado**: `src/services/monthlyRetrospective.ts` — función `retroInstructions` (+8 líneas)
- **Sin cambios en DB**
