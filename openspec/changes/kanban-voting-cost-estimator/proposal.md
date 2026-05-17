# Kanban Voting + Cost Estimator

## Why

Los miembros del árbol nunca usan su poder de decisión sobre el gasto en Kanban porque Ari ejecuta tareas automáticamente sin consultar. Cada derivación a Kanban tiene un costo real en tokens de API. Los miembros deben aprobar ese gasto antes de que se ejecute.

## What

Sistema de votación para que los miembros del árbol aprueben o rechacen derivaciones a Kanban, con un estimado de costo visible antes de votar.

### Flujo

1. Usuario pide algo a Ari en el grupo
2. Ari evalúa si requiere derivar a Kanban (tareas de código, investigación, etc.)
3. Si requiere Kanban, Ari:
   - Descompone en tareas
   - Evalúa dificultad de cada tarea (1=Fácil, 2=Media, 3=Difícil)
   - Consulta `KanbanCostLog` para obtener costo promedio histórico por dificultad
   - Calcula: `estimado = Σ(dificultad_i × costo_promedio[dificultad_i])`
   - Convierte USD → CLP usando tasa de cambio (actualizada cada 6h)
4. Ari envía la propuesta por **DM a cada miembro activo** (que haya activado DM) con botones [Sí] [No]:
   ```
   📋 Propuesta Kanban — Árbol X
   Tareas: 3 (2× dif.2, 1× dif.3)
   Costo estimado: ~450 CLP
   ¿Aprueban derivar a Kanban?
   [Sí] [No]
   ```
   Los miembros que NO hayan activado DM no reciben la propuesta (no votan).
5. **Solo el resultado final se publica en el grupo.**
6. Los miembros votan desde su DM (1 voto por miembro). Máximo 1 hora.
6. Al cumplirse 1 hora, se cierra la votación:
   - Si votó <33% de miembros activos → **Rechazado** por falta de quórum
   - Si votó ≥33% y Sí > No → **Aprobado**: Ari crea las tareas Kanban
   - Si votó ≥33% y No ≥ Sí → **Rechazado**: Ari informa y sugiere alternativas
7. Si aprobado, Ari crea las tareas en Kanban y las ejecuta normalmente.
8. Al completar las tareas, el costo real (tokens usados) se registra en `KanbanCostLog` para mejorar estimaciones futuras.

### Onboarding de DM

Para que un miembro pueda recibir propuestas de votación por DM, debe activar el chat privado:
- Al final del mensaje de **bienvenida del árbol** y del mensaje de **bienvenida individual** (cuando alguien nuevo se une), se agrega en MAYÚSCULAS:
  > PARA PODER VOTAR MÁNDAME UN DM QUE DIGA "activo"
- Cuando un usuario manda "activo" por DM al bot, se marca `TreeMember.dmActivated = true`
- Solo los miembros con `dmActivated = true` reciben propuestas de votación

### Modelos nuevos

- **KanbanProposal**: propuesta de derivación (treeId, messageId, status, tareas planeadas, dificultad, costo estimado, votos sí/no, createdAt, resolvedAt)
- **KanbanCostLog**: registro histórico de costos reales (taskId externo, treeId, difficulty, tokensUsed, costUSD, costCLP, exchangeRate, createdAt)

### Endpoints nuevos

- `POST /api/trees/:id/kanban/propose` — Ari crea propuesta de votación
- `POST /api/trees/:id/kanban/vote/:proposalId` — Miembro vota Sí/No
- `GET /api/trees/:id/kanban/cost-stats` — Promedios de costo por dificultad
- `POST /api/trees/:id/kanban/cost-log` — Registrar costo real post-ejecución

### Tasa de cambio

Cron cada 6 horas consulta API de tasa de cambio (USD→CLP) y guarda en config o variable global. Fuente sugerida: `https://api.exchangerate-api.com/v4/latest/USD` (gratis, sin key).

### System prompt de Ari

Actualizar para que:
- Detecte cuándo una solicitud requiere Kanban
- Evalúe dificultad 1-3 de las tareas planeadas
- Consulte `/api/trees/:id/kanban/cost-stats` para el estimado
- Publique propuesta con botones en vez de derivar directo
- Espere resultado de votación antes de crear tareas
