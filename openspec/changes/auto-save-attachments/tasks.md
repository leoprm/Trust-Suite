# Tasks: Biblioteca de Archivos con Búsqueda IA

- [ ] **T1 — Guardado automático silencioso** (30 min)
  Modificar handlers photo/document/video/audio/voice en `bot/index.ts`.
  Guardar en `media/<treeId>/<senderName>/<YYYY-MM-DD>_<filename>`.
  Sin preguntar ni botones. Siempre guardar (fire-and-forget).
  Reemplazar el flujo actual de auto-forward + inline keyboard.

- [ ] **T2 — Script CLIP de indexado** (45 min)
  Crear `lib/clip_index.py` — script Python con transformers CLIP.
  `python clip_index.py index <treeId>` — indexa todas las imágenes nuevas.
  `python clip_index.py search <treeId> "<query>"` — busca top-5 matches.
  Guarda embeddings en SQLite `media/<treeId>/index.db`.

- [ ] **T3 — Endpoint de búsqueda en sandbox** (30 min)
  Agregar `POST /api/trees/:treeId/sandbox/media-search` en sandboxRoutes.
  Body: `{query: "foto del perro", limit: 5}`.
  Response: `[{path, senderName, date, score}]`.
  Llama a `clip_index.py search`.

- [ ] **T4 — Auto-indexado al guardar** (20 min)
  En el handler de photo (T1), después de guardar, llamar `clip_index.py index <treeId>`.
  Fire-and-forget, non-blocking.

- [ ] **T5 — Herramienta de búsqueda para Ari** (20 min)
  Agregar en `buildSystemPrompt()` (hermesBridge.ts) la herramienta de búsqueda de archivos.
  Ari puede llamar `POST /api/trees/:treeId/sandbox/media-search` para buscar archivos.

- [ ] **T6 — Flujo de confirmación iterativa** (15 min)
  Ari responde con el match #1: envía el archivo + "¿Es esta?"
  Si usuario dice "no" → match #2, etc.
  Si usuario dice "sí" → confirma.
  Si se acaban los matches → "No encontré más coincidencias."
