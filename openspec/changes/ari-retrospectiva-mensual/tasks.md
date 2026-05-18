# Tasks: Ari Retrospectiva Mensual

- [ ] **T1 — Archivo diario de conversaciones** (45 min)
  Agregar en `bot/index.ts` (handler de mensajes de grupo) guardar cada mensaje en:
  `conversations/<treeId>/<YYYY-MM-DD>.txt`
  Formato: `[HH:MM] Usuario: mensaje` (append al archivo)
  Para audio: `[HH:MM] [🎤 audio] Usuario: transcripción`
  Incluir mensajes ya transcritos por el handler de voice (línea ~1868)

- [ ] **T2 — Auto-limpieza de archivos viejos** (15 min)
  Función en `bot/scheduler.ts` que corre cada noche:
  Elimina archivos `.txt` de `conversations/<treeId>/` con más de 90 días.
  Usar fs.readdir + fs.unlink.

- [ ] **T3 — Script de concatenación mensual** (20 min)
  Script `lib/concat_month.py`:
  `python concat_month.py <treeId> <YYYY-MM>`
  Concatena todos los `.txt` del mes en orden cronológico → `conversations/<treeId>/monthly/<YYYY-MM>.txt`
  Devuelve path del archivo concatenado + estadísticas (# mensajes, # usuarios únicos)

- [ ] **T4 — Servicio de retrospectiva mensual** (45 min)
  `services/monthlyRetrospective.ts`:
  - `runMonthlyRetrospective(treeId)` → concatena → envía a Ari vía `routeToHermes()`
  - System prompt especial: "eres Ari haciendo retrospectiva mensual. Lee TODA la conversación..."
  - Ari decide si emitir informe o callar
  - Si emite: formato con secciones (problemas, oportunidades, sugerencias)
  - Postea resultado en el grupo vía `ctx.api.sendMessage`

- [ ] **T5 — Cron job fin de mes** (15 min)
  Agregar en `bot/scheduler.ts`:
  El último día de cada mes a las 23:00, para cada árbol activo:
  `monthlyRetrospective.runMonthlyRetrospective(treeId)`
  Rate limit: 1 árbol cada 5 minutos para no saturar la API

- [ ] **T6 — Audio: guardar transcripción en archivo diario** (20 min)
  Modificar handler de voice (línea ~1868): después de transcribir,
  guardar en archivo diario independientemente de si menciona a Ari.
  Formato: `[HH:MM] [🎤 audio] Usuario: transcripción`
