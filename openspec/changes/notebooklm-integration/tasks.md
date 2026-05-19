# Tasks — NotebookLM Integration

## 1. Python Service Wrapper

- [ ] 1.1 Crear `services/notebooklm_service.py` — wrapper async de NotebookLMClient con métodos: `create_notebook(treeId)`, `delete_notebook(treeId)`, `ask(notebookId, question)`, `add_source(notebookId, url/text/file)`, `generate_podcast(notebookId)`. Comunicación stdin/stdout JSON lines con el backend Node.js. Incluir `requirements.txt` con `notebooklm-py`.
- [ ] 1.2 Crear `services/notebooklmBridge.ts` — spawner del child process Python + tipado TypeScript para las respuestas JSON. Métodos: `createNotebook`, `deleteNotebook`, `ask`, `addSource`, `generatePodcast`.

## 2. Sandbox API Endpoints

- [ ] 2.1 Agregar `POST /api/trees/:treeId/notebooklm/ask` — recibe `{ question }`, llama a `notebooklmBridge.ask(treeId, question)`, devuelve respuesta con citations.
- [ ] 2.2 Agregar `POST /api/trees/:treeId/notebooklm/podcast` — dispara generación de podcast, devuelve `{ taskId }` para polling.
- [ ] 2.3 Agregar `POST /api/trees/:treeId/notebooklm/source` — recibe `{ url?, text?, filePath? }`, añade fuente al notebook. Llamado automáticamente al subir archivos al sandbox.
- [ ] 2.4 Agregar `GET /api/trees/:treeId/notebooklm/sources` — lista fuentes del notebook.

## 3. Tree Lifecycle Hooks

- [ ] 3.1 En `src/index.ts` o `services/treeService.ts`: al crear árbol (POST /api/trees), llamar `notebooklmBridge.createNotebook(treeId)`.
- [ ] 3.2 En `treeCleanupService.ts`: al eliminar árbol, llamar `notebooklmBridge.deleteNotebook(treeId)`.

## 4. Bot Commands

- [ ] 4.1 Registrar comando `/ask <pregunta>` en `bot/index.ts`. Llama a `POST /api/trees/:treeId/notebooklm/ask`. Responde con texto citando fuentes.
- [ ] 4.2 Registrar comando `/podcast` en `bot/index.ts`. Llama a `POST /api/trees/:treeId/notebooklm/podcast`. Notifica cuando esté listo con el archivo de audio.

## 5. Ari Skill

- [ ] 5.1 Crear skill `trust-notebooklm` en `~/.hermes/skills/trust-notebooklm/SKILL.md` con instrucciones para Ari: cómo usar los endpoints de NotebookLM vía sandbox API. Formato de ask, add source, podcast. Limitación: solo accede al notebook de su treeId.

## 6. Integration Test & Deploy

- [ ] 6.1 Probar flujo completo: crear árbol → verificar notebook creado → `/ask` desde Telegram → respuesta con fuentes → eliminar árbol → verificar notebook eliminado.
