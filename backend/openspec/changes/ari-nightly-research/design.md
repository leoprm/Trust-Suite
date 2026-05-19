# Design: Ari Nightly Research Agent

## Pipeline nocturno

```
00:00 Cron → Dispara por cada árbol activo
  │
  ├─ 1. Cargar conversación
  │     Lee conversations/backup-YYYY-MM.md (últimos 90 días)
  │
  ├─ 2. Extraer keywords
  │     Filtra términos relevantes al objetivo del árbol
  │     (descripción inicial + tags del Tree)
  │
  ├─ 3. Investigar (web_search por término)
  │     Máximo 5 términos más frecuentes
  │     Guarda top 3 resultados por término
  │
  ├─ 4. Escribir notas en obsidian/research/
  │     Formato: YAML frontmatter + cita del chat + referencia web
  │
  └─ 5. Generar resumen → obsidian/decisions/
        Oportunidades, riesgos, soluciones
```

## Estructura de archivos

```
sandbox/obsidian/research/
├── 2026-05-18-termino1.md
├── 2026-05-18-termino2.md
└── 2026-05-18-summary.md     ← resumen diario
```

## Formato de nota de investigación

```markdown
---
type: research
date: 2026-05-18
term: "inteligencia artificial"
objective: "Crear herramientas de IA para pymes"
frequency: 14  # menciones en 90 días
---

# inteligencia artificial

**Investigación web:**
- [Artículo 1](url) — resumen en 1 línea
- [Artículo 2](url) — resumen en 1 línea

**Menciones en el chat:**
- 2026-04-12 15:30 — "@Leo: necesitamos integrar IA" [ver en conversación](conversations/backup-2026-04.md#L1234)
- 2026-05-03 09:15 — "@Maria: la IA puede ayudar con..." [ver](conversations/backup-2026-05.md#L567)

**Archivos cercanos (±5 min):**
- `media/brief-ia.pdf` (2026-04-12 15:32)
- `media/propuesta.docx` (2026-05-03 09:18)
```

## Formato del resumen diario

```markdown
---
type: decision
date: 2026-05-18
---

# Resumen de Investigación — 2026-05-18

## Oportunidades
- [hallazgo basado en investigación + conversación]

## Riesgos
- [riesgo identificado en la conversación o fuentes externas]

## Soluciones
- [propuesta concreta]
```

## Keyword extraction

```
1. Tokenizar conversación (split por palabra, quitar stopwords)
2. Contar frecuencia
3. Cruzar con objetivo del árbol (cosine similarity simple)
4. Tomar top 5 términos con mayor score
5. Si un archivo fue enviado cerca de una mención, incluir su nombre como keyword adicional
```

## Web research

```
Para cada keyword:
  web_search(term + " " + objective context)
  → extraer top 3 URLs
  → web_extract cada URL → resumir en 1 línea
```

## Cron

```
Diario 00:00 UTC:
  Para cada Tree activo (telegramChatId not null):
    Spawnear agente Kanban "ari-researcher"
    Workspace = sandbox del árbol
```

## API endpoint (opcional)

```
POST /api/trees/:treeId/research/run  → dispara research manual
GET  /api/trees/:treeId/research/latest → último resumen
```
