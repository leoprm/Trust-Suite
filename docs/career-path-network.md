# Career Path Network — Análisis y Diseño

> Feature para Trust Suite / Trace Lite
>
> **Objetivo:** Dado un perfil de habilidades actual y una especialidad objetivo, trazar la ruta óptima entre especialidades considerando tiempo, ganancia económica y balance.

---

## 1. Resumen Ejecutivo

El **Career Path Network** es un grafo dirigido y ponderado de habilidades donde cada nodo es un `skillTag` y cada arista representa la transición de una habilidad a otra. El sistema usa **Dijkstra multi-ponderado** para encontrar rutas óptimas entre el perfil actual del usuario y su especialidad deseada, optimizando:

| Criterio | Peso en grafo | Significado |
|----------|--------------|-------------|
| 🕐 Menos saltos | `hopsWeight` | Tiempo estimado de aprendizaje (menos tareas) |
| 💰 Mayor ganancia | `profitWeight` | Ingreso promedio por tarea con ese skill |
| ⚖️ Balance | `combinedWeight` | Mezcla normalizada de tiempo + ganancia |

---

## 2. Modelo de Datos Actual ( Trust Suite)

### 2.1 Entidades relevantes

```
┌──────────────────────────────────────────────────────────────┐
│                         Tree                                  │
│  capacidades: JSON string[]   ← habilidades del árbol         │
│  skillInfluences: SkillInfluence[]                            │
│  fiatTransactions: FiatTransaction[]                          │
└────────────┬─────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌───────────────┐  ┌──────────────────────┐
│ TreeMember    │  │ SkillInfluence        │
│ skills: JSON[]│  │ skillTag: string       │
│ xp: float     │  │ greenAvgDifficulty    │
│ level: int    │  │ goldenAvgDifficulty   │
└───────┬───────┘  │ greenInfluence (20-80)│
        │          │ goldenInfluence(20-80)│
        │          │ finalInfluence         │
        ▼          └──────────────────────┘
┌──────────────────┐
│ UserSkillXP       │  ← no en schema.prisma pero sí en DB
│ userId            │
│ skillTag          │
│ treeId            │
│ accumulatedPoints │
│ completedTasks    │
│ cachedPercentile  │
└──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│ Task              │     │ TaskTag           │
│ assignedTo:userId │────▶│ taskId            │
│ difficulty:float  │     │ skillName: string │
│ completedAt       │     └──────────────────┘
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ FiatTransaction   │
│ createdById:userId│
│ amount: float     │
│ type: INCOME|...  │
│ date: datetime    │
└──────────────────┘

┌──────────────────────────┐
│ ExpertEndorsement         │
│ endorserId→TreeMember     │
│ endorsedId→TreeMember     │
│ expertise: string (skill) │
│ status: ACTIVE|SUCCESS... │
└──────────────────────────┘
```

### 2.2 Fuentes de datos para el grafo

| Dato | Fuente | Query |
|------|--------|-------|
| Nodos (skills) | `Tree.capacidades` JSON + `TreeMember.skills` JSON | Parsear arrays y deduplicar |
| XP por skill | `UserSkillXP` | `accumulatedPoints`, `completedTasks` |
| Dificultad | `SkillInfluence` | `greenAvgDifficulty`, `goldenAvgDifficulty` |
| Ingresos por skill | `FiatTransaction` JOIN `TaskTag` | Sumar `amount` WHERE `type=INCOME` agrupado por skillTag |
| Transiciones observadas | `TaskTag` + `Task.completedAt` | Secuencia temporal de skills por usuario |
| Co-ocurrencia | `TreeMember.skills` | Usuarios que tienen ambos skills A y B |
| Validación experta | `ExpertEndorsement` | Endorsements que confirman dominio de skill |

---

## 3. Modelo del Grafo

### 3.1 Definición formal

```
G = (V, E, W)

V = { skillTag | skillTag ∈ Tree.capacidades ∪ TreeMember.skills }

E = { (u → v) | ∃ transición observada de u a v, o co-ocurrencia significativa }

W(e) = {
    hopsWeight:     f(SkillInfluence.avgDifficulty, UserSkillXP.completedTasks)
    profitWeight:   g(avgIncome per task for target skill)
    combinedWeight: α · hopsWeight_norm + (1-α) · profitWeight_norm
}
```

### 3.2 Cálculo de pesos

#### hopsWeight — costo de aprendizaje

```
hopsWeight(skillA → skillB) = 
    baseDifficulty = SkillInfluence.greenAvgDifficulty[skillB] || 3.0
    
    // Si hay usuarios que migraron de A→B, usamos datos reales
    IF transitionData exists:
        avgTasksToAcquireB = AVG(UserSkillXP.completedTasks WHERE userId IN 
            (users who gained B after A))
        hopsWeight = avgTasksToAcquireB * baseDifficulty
    ELSE:
        hopsWeight = baseDifficulty * 5  // estimación conservadora: ~5 tareas
        
    // Normalizar a rango [1, 10]
    hopsWeight = CLAMP(hopsWeight, 1, 10)
```

#### profitWeight — ganancia esperada

```
profitWeight(skillB) = 
    avgIncome = AVG(FiatTransaction.amount) WHERE 
        FiatTransaction.createdById IN (
            SELECT userId FROM UserSkillXP WHERE skillTag = skillB
        )
        AND FiatTransaction.type = 'INCOME'
        AND FiatTransaction.date >= NOW() - 90 days
    
    // Invertir para minimización (Dijkstra minimiza pesos)
    // A mayor ganancia, menor peso
    profitWeight = 10 / (1 + log10(1 + avgIncome/1000))
    
    // Normalizar a rango [1, 10]
    profitWeight = CLAMP(profitWeight, 1, 10)
```

#### combinedWeight — balance

```
combinedWeight(A→B) = α · normalize(hopsWeight) + (1-α) · normalize(profitWeight)

Donde α = 0.5 por defecto (balance equitativo)
      α → 0 prioriza ganancia
      α → 1 prioriza velocidad

Normalize(x) = (x - min) / (max - min) en el contexto de todos los edges
```

### 3.3 Construcción de aristas

**Estrategia híbrida (estática + dinámica):**

1. **Aristas por co-ocurrencia** (estáticas, precomputadas):
   ```
   Para cada par (skillA, skillB) donde al menos 2 usuarios poseen ambos:
       crear arista A→B y B→A
       peso = basado en dificultad de skillB (o skillA para la inversa)
   ```
   Ventaja: no depende de datos temporales (simplicidad, siempre disponible)

2. **Aristas por transición** (dinámicas, cuando hay datos):
   ```
   Para cada usuario que adquirió skillA antes que skillB:
       crear arista A→B
       peso = basado en tiempo real entre adquisiciones
   ```
   Ventaja: más precisas (reflejan secuencia real de aprendizaje)

3. **Aristas por tasks relacionados**:
   ```
   Si existen tasks con ambos tags en secuencia (mismo branch, orden temporal):
       skillA → skillB cuando task con A precede a task con B
   ```

**Prioridad:** Si existen aristas de tipo 2 o 3, reemplazan las de tipo 1.

### 3.4 Grafo inicial (bootstrapping)

Para arrancar sin datos históricos de transiciones:

- Usar `Tree.capacidades` como vocabulario base de skills
- Crear aristas entre skills que co-ocurren en `TreeMember.skills`
- Peso inicial = `SkillInfluence.greenAvgDifficulty` del skill destino
- A medida que se acumulan datos de transiciones (tasks completados), refinar

---

## 4. Algoritmo de Pathfinding

### 4.1 Dijkstra multi-ponderado

Para cada criterio, se ejecuta Dijkstra clásico con ese peso. El usuario elige modo:

```
function findPath(sourceSkills: string[], targetSkill: string, mode: Mode): Path {
    graph = buildGraph(treeId)
    
    switch mode:
        case FASTEST:    weight = e => e.hopsWeight
        case PROFITABLE: weight = e => e.profitWeight  
        case BALANCED:   weight = e => e.combinedWeight
    
    // Múltiples fuentes (el usuario tiene varias skills)
    sourceNodes = sourceSkills ∩ graph.nodes
    
    return dijkstra(graph, sourceNodes, targetSkill, weight)
}
```

**Complejidad:** O((V + E) log V) con heap de Fibonacci → ~O(N log N) para N skills.

### 4.2 Optimización A* (opcional, para grafos grandes)

Si el grafo supera ~500 nodos, usar A* con heurística admisible:

```
heuristic(skill, target) = 
    // Distancia semántica: skills que comparten prefijo o categoría están más cerca
    IF sameCategory(skill, target): return 0.5 * avgEdgeWeight
    ELSE: return avgEdgeWeight
```

### 4.3 Cache y precomputación

- El grafo se reconstruye cada 1 hora (cron existente: `skillPercentile.ts` → extender)
- Pathfinding es en tiempo real sobre grafo en memoria
- Los pesos se recalculan con el grafo

### 4.4 Pseudocódigo del endpoint principal

```python
POST /api/career-path/find
Body: {
    treeId: string,
    targetSkill: string,
    mode: "fastest" | "profitable" | "balanced",
    alpha: float?         // solo para BALANCED, default 0.5
    maxHops: int?         // límite de saltos, default 10
}

Response: {
    path: [
        {
            skillTag: string,
            difficulty: float,
            avgIncome: float,
            estimatedTasks: int,
            percentile: int,       // tu percentil actual en este skill
            hasSkill: boolean      // si ya lo tienes
        }
    ],
    totalHops: int,
    totalEstimatedTasks: int,
    totalExpectedIncome: float,
    alternatives: [...]    // top 3 rutas alternativas
}
```

---

## 5. Arquitectura Propuesta

### 5.1 Backend — Nuevos archivos

```
backend/src/
├── controllers/
│   └── careerPathController.ts    ← NUEVO
├── routes/
│   └── careerPathRoutes.ts        ← NUEVO
├── services/
│   └── careerPathService.ts       ← NUEVO (grafo + pathfinding)
└── cron/
    └── careerPathGraphCron.ts     ← NUEVO (reconstrucción del grafo)
```

### 5.2 Backend — Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/career-path/find` | Encontrar ruta óptima entre skills |
| `GET` | `/api/career-path/graph/:treeId` | Obtener grafo completo (para visualización) |
| `GET` | `/api/career-path/skills/:treeId` | Listar todos los skills del árbol con stats |
| `GET` | `/api/career-path/stats/:treeId/:skillTag` | Stats detallados de un skill |
| `POST` | `/api/career-path/rebuild/:treeId` | Forzar reconstrucción del grafo (admin) |

### 5.3 CareerPathService — Diseño interno

```typescript
class CareerPathService {
    private graphCache: Map<treeId, SkillGraph>;
    
    // Construir grafo desde BD
    async buildGraph(treeId: string): Promise<SkillGraph> {
        const skills = await this.fetchSkills(treeId);
        const transitions = await this.fetchTransitions(treeId);
        const incomeData = await this.fetchIncomeBySkill(treeId);
        const difficulties = await this.fetchDifficulties(treeId);
        
        return this.constructWeightedGraph(skills, transitions, incomeData, difficulties);
    }
    
    // Pathfinding
    findPath(
        graph: SkillGraph,
        sourceSkills: string[],
        targetSkill: string,
        mode: PathMode
    ): CareerPath {
        const weightFn = this.getWeightFunction(mode);
        return dijkstraMultiSource(graph, sourceSkills, targetSkill, weightFn);
    }
    
    // Datos para frontend
    getGraphForVisualization(treeId: string): GraphData { ... }
    getSkillStats(treeId: string, skillTag: string): SkillStats { ... }
}
```

### 5.4 Cron de reconstrucción

```typescript
// careerPathGraphCron.ts
// Se ejecuta cada hora, igual que skillPercentile
cron.schedule('30 * * * *', async () => {
    const trees = await prisma.tree.findMany({ select: { id: true } });
    for (const tree of trees) {
        await careerPathService.buildGraph(tree.id);
    }
});
```

### 5.5 Modelo de grafo en memoria

```typescript
interface SkillNode {
    skillTag: string;
    difficulty: number;
    avgIncome: number;
    memberCount: number;     // cuántos miembros tienen este skill
    totalCompletedTasks: number;
}

interface SkillEdge {
    from: string;
    to: string;
    hopsWeight: number;      // costo de aprendizaje
    profitWeight: number;    // inverso de ganancia
    combinedWeight: number;  // balance normalizado
    confidence: number;      // 0-1, basado en cantidad de datos
    transitionCount: number; // usuarios que hicieron esta transición
}

interface SkillGraph {
    treeId: string;
    nodes: Map<string, SkillNode>;
    edges: Map<string, SkillEdge[]>;  // adjacency list
    builtAt: Date;
}
```

---

## 6. Frontend

### 6.1 Nuevos archivos

```
frontend/src/
├── pages/
│   └── CareerPath.tsx              ← NUEVO (página principal)
├── components/
│   ├── CareerPathNetwork.tsx       ← NUEVO (visualización del grafo)
│   ├── CareerPathResult.tsx        ← NUEVO (resultado de pathfinding)
│   ├── SkillNode.tsx               ← NUEVO (nodo individual)
│   └── PathTimeline.tsx            ← NUEVO (timeline de la ruta)
```

### 6.2 Componentes

```
┌─────────────────────────────────────────────────┐
│ CareerPath.tsx                                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ [Mis Skills: #dev #react #node]  [Objetivo] │ │
│ │ [Dropdown: seleccionar skill objetivo     ▼] │ │
│ │ Modo: (•) Más rápido ( ) Más rentable ( ) B.│ │
│ │ [                    BUSCAR RUTA           ] │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │            CareerPathResult                  │ │
│ │  #dev ──→ #backend ──→ #cloud ──→ #devops   │ │
│ │  ⚡ 3 saltos  📋 ~18 tareas  💰 +$450k/mes  │ │
│ │                                              │ │
│ │  Alternativas:                               │ │
│ │  · #dev → #fullstack → #devops (4 saltos)    │ │
│ │  · #dev → #sysadmin → #devops (2 saltos)     │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │         CareerPathNetwork (grafo SVG/Canvas) │ │
│ │     [nodos + aristas del grafo completo]     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 6.3 Integración con flavors

- **Trace Lite** (`VITE_APP_FLAVOR=trace-lite`): Página principal con perfil + career path
- **Trust Lite** (`VITE_APP_FLAVOR=trust-lite`): Accesible desde el dashboard del árbol
- Ruta: `/career-path/:treeId`

### 6.4 Flujo de usuario

1. Usuario ve su perfil (Trace Lite) o dashboard del árbol
2. Ve sus skills actuales con stats (dificultad, ingresos, percentil)
3. Selecciona un skill objetivo del dropdown (skills del árbol)
4. Elige modo (rápido / rentable / balanceado)
5. El sistema muestra:
   - Ruta óptima resaltada
   - Timeline de skills a adquirir
   - Estimación de tareas y tiempo
   - Ingreso esperado al completar
   - Rutas alternativas

---

## 7. Plan de Implementación

### Fase 1 — Fundación (1-2 días)

| # | Tarea | Asignación |
|---|-------|-----------|
| 1.1 | Crear `careerPathService.ts` con lógica de construcción de grafo desde BD | backend-eng |
| 1.2 | Implementar `dijkstraMultiSource()` con pesos configurables | backend-eng |
| 1.3 | Endpoint `POST /api/career-path/find` | backend-eng |
| 1.4 | Endpoints `GET /api/career-path/skills/:treeId` y stats | backend-eng |
| 1.5 | Cron de reconstrucción horaria del grafo | backend-eng |
| 1.6 | Tests unitarios del pathfinding | backend-eng |

### Fase 2 — Frontend (1-2 días)

| # | Tarea | Asignación |
|---|-------|-----------|
| 2.1 | Página `CareerPath.tsx` con selector de skills y modos | frontend-eng |
| 2.2 | Componente `CareerPathResult.tsx` (timeline de ruta) | frontend-eng |
| 2.3 | Componente `CareerPathNetwork.tsx` (visualización del grafo) | frontend-eng |
| 2.4 | Integrar en Trace Lite y Trust Lite | frontend-eng |

### Fase 3 — Pulido (1 día)

| # | Tarea | Asignación |
|---|-------|-----------|
| 3.1 | Optimización: cache en memoria, lazy loading del grafo | backend-eng |
| 3.2 | Visualización interactiva: hover tooltips, zoom, resaltado de ruta | frontend-eng |
| 3.3 | Métricas de uso y logging | backend-eng |

---

## 8. Consideraciones Técnicas

### 8.1 Rendimiento

- Grafo típico: 20-100 skills por árbol → Dijkstra es O(100 log 100) ≈ instantáneo
- Cache en `Map<string, SkillGraph>` en memoria del proceso Node
- Reconstrucción horaria (no por request)
- Si un árbol no tiene datos de transiciones, usar solo co-ocurrencia (fallback)

### 8.2 Cold start (árbol nuevo sin datos)

1. Skills iniciales vienen de `Tree.capacidades` (definidos al crear el árbol)
2. Sin `UserSkillXP` ni transiciones → grafo usa solo co-ocurrencia en `TreeMember.skills`
3. Pesos iniciales = `SkillInfluence.greenAvgDifficulty` (default 3.0)
4. A medida que se completan tasks, el grafo se refina automáticamente

### 8.3 Privacidad

- Los datos de ingresos se agregan: nunca se expone income individual
- Stats se muestran como promedios anónimos (mínimo 3 usuarios para mostrar)
- `PrivacySettings.traceProfileVisibility` controla visibilidad en búsquedas

### 8.4 Extensibilidad futura

- **Career paths entre árboles:** Usar `SkillMigration` para mostrar rutas cross-tree
- **Recomendaciones proactivas:** "Basado en tu perfil, te sugerimos aprender #devops"
- **Market demand:** Integrar `InsightSignal.requiredSkillTags` para mostrar demanda
- **Mentor matching:** Conectar con `ExpertEndorsement` para sugerir mentores en cada paso

---

## 9. Resumen de queries SQL necesarias

### 9.1 Obtener todos los skills de un árbol

```sql
-- De Tree.capacidades
SELECT id, capacidades FROM Tree WHERE id = :treeId;
-- Parsear JSON array

-- De TreeMember.skills
SELECT skills FROM TreeMember WHERE treeId = :treeId;
-- Parsear y deduplicar
```

### 9.2 Obtener dificultad por skill

```sql
SELECT skillTag, greenAvgDifficulty, goldenAvgDifficulty, finalInfluence
FROM SkillInfluence
WHERE treeId = :treeId;
```

### 9.3 Obtener ingresos por skill

```sql
SELECT tt.skillName,
       AVG(ft.amount) as avg_income,
       COUNT(DISTINCT ft.id) as tx_count
FROM FiatTransaction ft
JOIN Task t ON ft.taskId = t.id
JOIN TaskTag tt ON tt.taskId = t.id
WHERE ft.treeId = :treeId
  AND ft.type = 'INCOME'
  AND ft.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY tt.skillName;
```

### 9.4 Detectar transiciones entre skills

```sql
-- Usuarios que completaron tasks con skillA y después con skillB
SELECT DISTINCT a.userId, a.skillName as fromSkill, b.skillName as toSkill
FROM (
    SELECT tt.skillName, t.assignedTo as userId, MAX(t.completedAt) as lastA
    FROM Task t
    JOIN TaskTag tt ON tt.taskId = t.id
    WHERE t.status = 'COMPLETED' AND t.assignedTo IS NOT NULL
    GROUP BY tt.skillName, t.assignedTo
) a
JOIN (
    SELECT tt.skillName, t.assignedTo as userId, MAX(t.completedAt) as lastB
    FROM Task t
    JOIN TaskTag tt ON tt.taskId = t.id
    WHERE t.status = 'COMPLETED' AND t.assignedTo IS NOT NULL
    GROUP BY tt.skillName, t.assignedTo
) b ON a.userId = b.userId
WHERE a.skillName != b.skillName AND a.lastA < b.lastB;
```

### 9.5 Obtener UserSkillXP para un árbol

```sql
SELECT userId, skillTag, accumulatedPoints, completedTasks, cachedPercentile
FROM UserSkillXP
WHERE treeId = :treeId;
```

---

## 10. API Contract (OpenAPI parcial)

```yaml
/career-path/find:
  post:
    summary: Encontrar ruta óptima entre skills
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [treeId, targetSkill]
            properties:
              treeId: { type: string }
              targetSkill: { type: string }
              mode: { type: string, enum: [fastest, profitable, balanced], default: balanced }
              alpha: { type: number, default: 0.5 }
              maxHops: { type: integer, default: 10 }
    responses:
      200:
        content:
          application/json:
            schema:
              type: object
              properties:
                path:
                  type: array
                  items:
                    $ref: '#/components/schemas/PathStep'
                totalHops: { type: integer }
                totalEstimatedTasks: { type: integer }
                totalExpectedIncome: { type: number }
                alternatives:
                  type: array
                  items:
                    $ref: '#/components/schemas/CareerPath'

    PathStep:
      type: object
      properties:
        skillTag: { type: string }
        difficulty: { type: number }
        avgIncome: { type: number }
        estimatedTasks: { type: integer }
        percentile: { type: integer }
        hasSkill: { type: boolean }
```

---

## Conclusión

El Career Path Network aprovecha datos ya existentes en Trust Suite (skills, XP, transacciones, influencia) para construir un grafo de habilidades sin necesidad de nuevos modelos de datos. La implementación es ligera: un servicio en backend que construye y cachea el grafo, un endpoint de pathfinding con Dijkstra, y componentes frontend para visualización.

**No se requieren cambios en el schema de Prisma.** Todo se construye sobre los modelos actuales: `Tree.capacidades`, `TreeMember.skills`, `UserSkillXP`, `SkillInfluence`, `FiatTransaction`, `TaskTag` y `ExpertEndorsement`.
