# Tasks: Ari Nightly Research Agent

- [ ] **R1: Keyword Extractor — extraer términos del chat por relevancia al objetivo**
  - Leer conversations/backup-YYYY-MM.md (últimos 90 días)
  - Tokenizar, quitar stopwords, contar frecuencia
  - Cruzar con objetivo del árbol (descripción + tags)
  - Top 5 términos con mayor score
  - Si hay archivos cercanos (±5 min), incluir su nombre
  - ~60 LOC

- [ ] **R2: Web Researcher — buscar términos en internet**
  - Para cada keyword del extractor: web_search(term + " " + objective)
  - Extraer top 3 URLs por término
  - web_extract cada URL → resumen de 1 línea
  - Guardar resultados estructurados
  - ~50 LOC

- [ ] **R3: Note Writer — escribir notas en obsidian/research/**
  - Formato: YAML frontmatter (type: research, term, frequency, date)
  - Cuerpo: definición, referencias web, citas del chat con timestamp, archivos cercanos
  - Links a [[otras-notas]] relacionadas
  - ~50 LOC

- [ ] **R4: Summary Generator — resumen diario de oportunidades/riesgos/soluciones**
  - Consolidar hallazgos de todas las notas del día
  - Generar 3 secciones: oportunidades, riesgos, soluciones
  - Escribir en obsidian/decisions/YYYY-MM-DD-summary.md
  - ~40 LOC

- [ ] **R5: Cron Job — disparar pipeline cada medianoche por árbol**
  - Crear cron en src/cron/nightlyResearchCron.ts
  - Query trees activos (telegramChatId not null)
  - Spawnear agente Kanban "ari-researcher" por árbol
  - Workspace = sandbox del árbol
  - Loggear resultados
  - ~50 LOC
