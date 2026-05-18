# Tasks: Skills por Árbol Evolutivas

- [ ] **T1 — Reglas de skills en system prompt** (30 min)
  Modificar `buildSystemPrompt()` en `src/bot/hermesBridge.ts`:
  - Agregar reglas SPEC-3 (solo Leo skills globales, usuarios skills locales)
  - Al iniciar conversación: leer `skills/` del sandbox y mostrar lista
  - Incluir en el prompt: "skills disponibles en este árbol: <lista>"
  - Contador de tareas por árbol (Map<treeId, number>)

- [ ] **T2 — Handler de skills en sandboxController** (20 min)
  Agregar endpoint `POST /api/trees/:treeId/sandbox/read dir=skills`
  ya existe — verificar que funcione para listar skills.
  Si no, agregar soporte para listar directorios.

- [ ] **T3 — Trigger 20 tareas** (45 min)
  Agregar en `hermesBridge.ts` o `index.ts`:
  - Contador `taskCounters: Map<treeId, number>`
  - Después de cada `routeToHermes` exitoso → incrementar
  - Al llegar a 20 → inyectar mensaje especial: "Has completado 20 tareas. Revisa si hay patrones que merezcan ser skills."
  - Ari decide si crear o no → si crea, usa sandbox write
  - Reiniciar contador

- [ ] **T4 — Formato de skill (.md + .rating.json)** (20 min)
  Crear `src/lib/skillFormat.ts`:
  - `generateSkillMarkdown(name, description, content, author)` → string .md
  - `generateRatingJson(rating, ratedBy)` → string JSON
  - `parseSkillMarkdown(mdContent)` → metadata object

- [ ] **T5 — Contador de usos globales** (25 min)
  Crear `src/lib/skillUsage.ts`:
  - `incrementUsage(skillName, treeId)` → lee/escribe usos.json
  - Llamar cada vez que Ari carga una skill global en system prompt
  - Skills globales viven en `~/.hermes/skills/trustmaker/`

- [ ] **T6 — Servicio de evolución nocturna** (60 min)
  Crear `src/services/skillEvolution.ts`:
  - `nightlyScan()` — escanea todos los árboles
  - `computeFitness(avgRating, usos)` → number
  - `normalizeSkillName(name)` → string
  - `deduplicateAndMerge(skills)` → merged list
  - `promoteToGlobal(skill)` → copia a `~/.hermes/skills/trustmaker/`
  - `evictLowest(globalSkills)` → elimina la de menor fitness
  - Máximo 40 skills globales

- [ ] **T7 — Cron nocturno en scheduler** (15 min)
  Agregar en `src/bot/scheduler.ts`:
  - Cron `0 3 * * *` (03:00)
  - Llamar `skillEvolution.nightlyScan()`
  - Log: `[Scheduler] 🧬 Evolución de skills completada: N promovidas, M eliminadas`

- [ ] **T8 — Admin ID configurable** (10 min)
  Agregar `TRUSTMAKER_ADMIN_TELEGRAM_ID` en `.env`
  Usar en lugar de hardcodear el ID de Leo.
  Fallback a valor por defecto.
