# Tasks — Ari Monthly Retrospective + NotebookLM

## 1. Skill Update

- [ ] 1.1 Actualizar `trust-notebooklm/SKILL.md` con workflow "Presentación Mensual": pasos detallados para que Ari revise sandbox, seleccione archivos relevantes, los suba a NotebookLM, cree prompt de presentación, genere contenido con `/notebooklm/ask`, y guarde resultado en el sandbox.

## 2. System Prompt Update

- [ ] 2.1 Modificar `retroInstructions()` en `src/services/monthlyRetrospective.ts` para añadir al final: "Después del informe, usa NotebookLM para enriquecer el análisis: sube los archivos relevantes del sandbox, haz preguntas analíticas al notebook, y guarda el resultado en `monthly-presentation-{mes}.md`."

## 3. Integration Test

- [ ] 3.1 Verificar que Ari puede seguir el nuevo flujo: leer skill → listar fuentes del sandbox → subir archivos → preguntar al notebook → guardar resultado.
