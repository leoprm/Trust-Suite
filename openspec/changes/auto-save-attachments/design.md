# Design: Auto-guardado de Adjuntos

## Flujo

```
Usuario comparte foto/documento en grupo
    │
    ▼
Handler message:photo / message:document
    │
    ├─ ¿session.awaitingEvidenceTaskId? → flujo actual (evidencia)
    │
    └─ NO → ¿es grupo con árbol?
         │
         ├─ NO → return (ignorar)
         │
         └─ SÍ → 
              1. Download file vía Telegram API (getFile)
              2. POST al sandbox del árbol → guardar
              3. Reply con inline keyboard:
                 [Vincular a tarea] [Analizar] [Solo guardar] [Descartar]
```

## Botones y acciones

| Botón | Acción |
|-------|--------|
| 🔗 Vincular a tarea | Preguntar nombre/ID de tarea → asociar archivo |
| 🔍 Analizar | Enviar a Hermes para descripción/análisis |
| 💾 Solo guardar | Confirmar "Guardado en sandbox" |
| 🗑 Descartar | Eliminar del sandbox |

## Callback data
- `attach:link:{treeId}:{filePath}`
- `attach:analyze:{treeId}:{filePath}`
- `attach:keep:{treeId}:{filePath}`
- `attach:discard:{treeId}:{filePath}`

## Sandbox endpoint
Usar `POST /api/trees/:treeId/sandbox/write` con el archivo (ya existente o nuevo).
