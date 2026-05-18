# Specs: Skills por Árbol Evolutivas

## SPEC-1: Formato de skill en sandbox
Cada skill es 2 archivos:
- `skills/<nombre>.md` — contenido markdown (frontmatter + body)
- `skills/<nombre>.rating.json` — `{ "rating": 7, "ratedBy": "telegramId", "ratedAt": "ISO8601" }`

## SPEC-2: Formato de skill global
- `skills/<nombre>.usos.json` — `{ "usos": 47, "treeIds": ["id1","id2"] }`
- Skills globales en `~/.hermes/skills/trustmaker/`

## SPEC-3: Regla en system prompt de Ari
```
⚠️ REGLAS DE SKILLS:
- SOLO el usuario Leo (Telegram ID: configurable) puede usar skill_manage para skills GLOBALES.
- Cualquier usuario puede pedir crear skills LOCALES → Ari usa POST /api/trees/<treeId>/sandbox/write → skills/<nombre>.md + rating.json.
- Al iniciar conversación: leer skills del sandbox (POST .../sandbox/read skills/) y cargarlas como contexto.
- Cada 20 tareas completadas: evaluar si crear skill de patrones detectados.
```

## SPEC-4: Fitness score nocturno
```
fitness = (avg_rating × 0.4) + (usos × 0.6)
```
- avg_rating: promedio de ratings de todas las instancias de la skill en árboles distintos
- usos: contador en skills/<nombre>.usos.json
- Máximo 40 skills globales
- Si se llena: reemplazar la de menor fitness

## SPEC-5: Deduplicación por nombre
Normalizar nombres: lowercase, sin espacios, sin extensiones.
Si 2 árboles tienen "ventas-consultivas.md" → mismo nombre = misma skill. Promediar ratings.

## SPEC-6: Trigger de 20 tareas
Ari lleva contador interno por árbol. Al llegar a 20:
1. Revisa las últimas 20 interacciones
2. Detecta patrones, workflows, soluciones
3. Si hay algo reusable → propone crear skill (pide confirmación al usuario)
4. Si el usuario acepta → crea skill en sandbox
5. Reinicia contador
