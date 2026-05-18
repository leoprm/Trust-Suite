# Design: Ari Obsidian Vaults

## Estructura de archivos

```
/home/trustmaker/trees/<treeId>/obsidian/
├── .obsidian/
│   └── app.json          # config mínima
├── assets/               # notas sobre archivos del sandbox
│   ├── logo-cliente.md
│   └── brief-rebranding.md
├── decisions/            # notas sobre decisiones del árbol
│   └── 2026-05-18-prioridad-features.md
├── people/               # notas sobre miembros/workers
│   └── maria-perez.md
└── index.md              # punto de entrada, links a secciones

/home/trustmaker/workers/<userId>/obsidian/
├── .obsidian/
├── tasks/                # historial de tareas completadas
├── evaluations/          # evaluaciones de Ari (quality, XP)
└── skills/               # progresión por skill
```

## Formato de nota

```markdown
---
tags: [tag1, tag2]
date: 2026-05-18
type: asset | decision | person | task | evaluation
source: nombre-del-archivo-original
path: /home/trustmaker/trees/<treeId>/media/logo-cliente.png  # REQUERIDO para type=asset
---

# Título de la nota

Contenido en markdown. Ari describe qué es, contexto, relaciones.

**File:** `/home/trustmaker/trees/<treeId>/media/logo-cliente.png`
**Links:** [[otra-nota]] [[persona-relacionada]]
```

## Config `.obsidian/app.json`

```json
{
  "newFileLocation": "current",
  "newLinkFormat": "shortest",
  "attachmentFolderPath": "./attachments",
  "showUnsupportedFiles": true
}
```

## Flujo: Ari escribe nota

1. **Evento:** se crea/modifica archivo en sandbox
2. Ari recibe la notificación vía API sandbox (ya existente)
3. Ari escribe `obsidian/assets/<nombre>.md` con frontmatter
4. Si la nota referencia a otra existente, usa `[[wikilink]]`

## Flujo: Ari consulta notas

1. **Evento:** humano pregunta algo en el chat del árbol
2. Antes de responder, Ari ejecuta `search_files` en `obsidian/`
3. Si encuentra notas relevantes, las incluye como contexto en su respuesta
4. Si no encuentra, responde normalmente

## System prompt update

Agregar a `SOUL.md` de Ari y/o al system prompt en `hermesBridge.ts`:

```markdown
## Obsidian Vault

You have an Obsidian vault at `{SANDBOX}/obsidian/`. Use it as your long-term memory.

### When to write notes
- A file is created or modified in the sandbox → write a note in `assets/`
- A decision is made (task priority, budget, design choice) → write in `decisions/`
- A member does something notable → update their note in `people/`
- A worker completes a task → write in `tasks/` and `evaluations/`

### Note format
Always use YAML frontmatter with tags, date, and type. Link related notes with [[wikilinks]].

### When to search notes
- Before answering any question about files, decisions, or people
- When the user asks "what was..." or "do you remember..."
- Search with grep/rg in the obsidian/ directory
```

## API endpoints (opcional, futuro)

```
GET  /api/trees/:treeId/obsidian/search?q=...  → buscar notas
GET  /api/trees/:treeId/obsidian/notes          → listar notas
GET  /api/trees/:treeId/obsidian/notes/:name    → leer nota
GET  /api/trees/:treeId/obsidian/graph          → datos del grafo (links)
```

No necesarios para MVP — Ari usa la sandbox API directamente.
