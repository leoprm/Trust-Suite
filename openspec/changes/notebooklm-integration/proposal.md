# NotebookLM Integration — Propuesta

## Why

Trust Maker necesita mostrar capacidades de "hablar con tus documentos" con IA para el concurso.
Google NotebookLM es la referencia del mercado. Usando `notebooklm-py` (cliente Python async no oficial
de la API interna de NotebookLM) podemos darle a cada árbol un espacio de conocimiento aislado donde
subir fuentes y hacer preguntas con respuestas citadas.

## What Changes

- **Nuevo servicio Python**: `notebooklm_service.py` que wrappea `NotebookLMClient` (notebooklm-py).
  Corre como child process del backend Node.js, comunicándose vía stdin/stdout JSON.
- **API sandbox**: nuevos endpoints `POST /api/trees/:treeId/notebooklm/ask` y `/podcast`.
- **Ciclo de vida del árbol**: al crear árbol → crea notebook `tm-{treeId}`. Al eliminar árbol → borra notebook.
- **Comandos de bot**: `/ask <pregunta>` y `/podcast` disponibles para miembros del árbol.
- **Skill de Ari**: skill `trust-notebooklm` para que Ari sepa usar los endpoints.

## Capabilities

1. **Tree-scoped notebooks**: cada árbol tiene su propio notebook aislado por naming convention (`tm-<treeId>`)
2. **Chat with docs**: `/ask` envía pregunta al notebook, devuelve respuesta con fuentes citadas
3. **Source ingestion**: al subir docs al sandbox, se añaden automáticamente al notebook
4. **Podcast generation**: `/podcast` genera audio overview del contenido del notebook
5. **Auth compartida**: una sola cuenta Google (Leo) para todos los árboles — demo/concurso
6. **Skill de Ari**: wrapper en el sandbox para que Ari pueda hacer ask/podcast/add-source

## Impact

- **Nueva dependencia**: `notebooklm-py` (Python ≥3.10) + `notebooklm login` (auth OAuth Google)
- **Nuevo archivo**: `services/notebooklm_service.py` (~150 LOC)
- **Modificados**: `controllers/sandboxController.ts` (+4 endpoints), `bot/index.ts` (+2 comandos),
  `src/index.ts` (tree lifecycle hooks)
- **Skill nuevo**: `~/.hermes/skills/trust-notebooklm/`
- **Sin cambios en DB**: sin nuevas tablas — el notebook ID es derivado del treeId
