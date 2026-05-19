# Tasks — Retrospectiva Trimestral + NotebookLM Obligatorio

## 1. NotebookLM Obligatorio en Mensual

- [ ] 1.1 Modificar `retroInstructions()` para cambiar "📓 4. NOTEBOOKLM — Después del informe, usa el notebook" → "📓 4. NOTEBOOKLM (OBLIGATORIO) — Sube archivos relevantes, genera análisis complementario con /ask, y guarda monthly-presentation-MES.md en el sandbox". Cambiar tono de opcional a obligatorio.

## 2. Prompt Trimestral

- [ ] 2.1 Crear `retroInstructionsQuarterly(treeName, quarterLabel, prevQuarterLabel?)` con secciones: PROBLEMAS, OPORTUNIDADES, SUGERENCIAS, EVOLUCIÓN DEL TRIMESTRE, COMPARATIVA vs trimestre anterior, NOTEBOOKLM (OBLIGATORIO). Concatenar 3 meses de conversaciones. Guardar como `quarterly-presentation-QN-YYYY.md`.

## 3. Cron Trimestral

- [ ] 3.1 Agregar `runQuarterlyRetrospective()` que detecta si es fin de trimestre (mar, jun, sep, dic), concatena 3 meses con `concat_month.py`, y llama al prompt trimestral. Si es fin de trimestre, suprime el mensual.
- [ ] 3.2 Registrar cron trimestral en `src/index.ts` con `setInterval` que chequea diariamente si es último día del trimestre.

## 4. Integration Test

- [ ] 4.1 Verificar que el prompt mensual exige NotebookLM obligatorio. Verificar que el prompt trimestral tiene las 5 secciones. Simular fin de trimestre y verificar que suprime mensual.
