# Trust Quest — Diseño Técnico

**Fecha:** 30 de mayo de 2026
**Estado:** Diseño inicial (no implementado)
**Repositorio:** Separado de Trust Maker (`leoprm/trust-quest`)

---

## 1. Arquitectura General

Trust Quest es una **API REST independiente** que envuelve Trust Maker agregando
mecánicas de juego. Se comunica con Trust Maker vía su API (puerto 3100) y webhooks.

```
┌─────────────────────────────────────────┐
│  Trust Quest (API)        Puerto 3101   │
│  · XP, logros, niveles                  │
│  · Misiones (quests)                    │
│  · Economía cross-tree (Seeds/Flowers) │
│  · Leaderboards                         │
│  · Ari NPC (diálogos contextuales)      │
├─────────────────────────────────────────┤
│  Trust Maker (infra)      Puerto 3100   │
│  · Árboles, miembros, votaciones        │
│  · Needs, tareas, sandbox               │
│  · Onboarding, Kanban                   │
└─────────────────────────────────────────┘
```

**Flujo de datos:**
1. Trust Maker emite eventos (webhook) → Trust Quest los consume
2. Trust Quest calcula XP, verifica logros, actualiza leaderboards
3. Trust Quest expone endpoints para consulta desde frontends/bots
4. Ari (Hermes Agent) consulta Trust Quest para diálogos contextuales

---

## 2. Stack Recomendado

| Componente | Tecnología | Justificación |
|-----------|-----------|--------------|
| Runtime | Node.js + TypeScript | Mismo ecosistema que Trust Maker |
| Framework | Express (o Fastify) | Liviano, familiar |
| ORM | Prisma | Mismo que Trust Maker, fácil compartir tipos |
| DB | PostgreSQL (o MySQL) | SQL para integridad de economía |
| Cache | Redis | Leaderboards en tiempo real, rate limiting |
| Background jobs | BullMQ + Redis | Quests diarias/semanales, decay de inactividad |
| Webhooks inbound | Express routes | Recibir eventos de Trust Maker |

**¿Por qué DB separada?** Trust Quest tiene tablas que no existen en Trust Maker
(quests, achievements, currency transactions). Compartir DB acoplaría los sistemas
al nivel más bajo. Una DB independiente permite migraciones libres sin riesgo.

**¿Por qué Redis?** Los leaderboards necesitan rankings ordenados en tiempo real.
Redis Sorted Sets (`ZADD`, `ZRANK`) son O(log N) vs queries SQL con ORDER BY + LIMIT
que se degradan con miles de usuarios. También sirve para rate limiting y caché
de consultas frecuentes (perfil de jugador, logros del árbol).

---

## 3. Modelo de Datos (tablas nuevas en Trust Quest)

### 3.1 Player (datos cross-tree del jugador)
```
Player {
  userId:         string (FK → Trust Maker User.id)
  currentLevel:   int (default 1)
  totalXp:        int (default 0)
  seeds:          int (default 0)   // moneda base
  flowers:        int (default 0)   // moneda premium
  title:          string?           // título equipado
  avatarConfig:   json?             // personalización visual
  joinedAt:       datetime
}
```
El Player existe una sola vez por userId. XP y monedas son cross-tree:
se acumulan sin importar en qué árbol se ganaron.

### 3.2 PlayerTree (datos por árbol del jugador)
```
PlayerTree {
  playerId:       string (FK → Player.id)
  treeId:         string (FK → Trust Maker Tree.id)
  treeXp:         int (default 0)
  treeLevel:      int (default 1)
  joinedAt:       datetime
  lastActivityAt: datetime
}
```
XP local del árbol (para leaderboards por comunidad).

### 3.3 Achievement (logros definidos)
```
Achievement {
  id:             string
  key:            string (unique, ej: "first_vote", "five_approved")
  name:           string
  description:    string
  icon:           string (emoji)
  category:       enum (VOTING, PROPOSING, COMMUNITY, ONBOARDING, CROSS_TREE)
  xpReward:       int
  seedReward:     int
  flowerReward:   int
  condition:      json // lógica de verificación
}
```

### 3.4 PlayerAchievement (logros desbloqueados)
```
PlayerAchievement {
  playerId:       string
  achievementId:  string
  treeId:         string? (null = cross-tree)
  unlockedAt:     datetime
  notifiedAt:     datetime?
}
```

### 3.5 Quest (misión definida)
```
Quest {
  id:             string
  key:            string (unique)
  name:           string
  description:    string
  type:           enum (DAILY, WEEKLY, TREE, CROSS_TREE, STORY)
  condition:      json // {action: "vote", count: 3, scope: "tree"}
  xpReward:       int
  seedReward:     int
  expiresAt:      datetime? (daily/weekly)
  treeId:         string? (null = cross-tree/general)
}
```

### 3.6 PlayerQuest (progreso de misión)
```
PlayerQuest {
  playerId:       string
  questId:        string
  treeId:         string? (contexto)
  progress:       int (default 0)
  target:         int
  status:         enum (ACTIVE, COMPLETED, CLAIMED, EXPIRED)
  startedAt:      datetime
  completedAt:    datetime?
  claimedAt:      datetime?
}
```

### 3.7 CurrencyTransaction (historial de monedas)
```
CurrencyTransaction {
  id:             string
  playerId:       string
  amount:         int
  currency:       enum (SEED, FLOWER)
  type:           enum (EARN, SPEND, GIFT, REWARD)
  source:         string (ej: "quest:first_vote", "achievement:pioneer")
  treeId:         string?
  createdAt:      datetime
}
```

### 3.8 AriDialog (diálogos contextuales del NPC)
```
AriDialog {
  id:             string
  trigger:        enum (IDLE_3D, FIRST_IDEA, VOTE_MILESTONE, CONFLICT, ...)
  template:       text // plantilla con variables {{playerName}}, {{treeName}}
  mood:           enum (HAPPY, CONCERNED, EXCITED, NEUTRAL)
  priority:       int
  cooldownHours:  int
}
```

---

## 4. API Endpoints (Trust Quest expone)

### 4.1 Player
```
GET    /api/players/:userId            → perfil completo (XP, nivel, monedas, logros)
GET    /api/players/:userId/trees      → actividad por árbol
GET    /api/players/:userId/achievements → logros desbloqueados
GET    /api/players/:userId/quests     → misiones activas y completadas
PUT    /api/players/:userId/title      → equipar título
PUT    /api/players/:userId/avatar     → personalizar avatar
```

### 4.2 Leaderboards
```
GET    /api/leaderboards/global        → ranking global (top 100)
GET    /api/leaderboards/trees/:treeId → ranking por árbol
GET    /api/leaderboards/weekly        → ranking semanal (Redis)
```

### 4.3 Quests
```
GET    /api/quests/available           → misiones disponibles para el jugador
POST   /api/quests/:questId/claim      → reclamar recompensa
GET    /api/quests/daily               → misión diaria actual
GET    /api/quests/weekly              → misión semanal actual
```

### 4.4 Shop (Capa 3 — futuro)
```
GET    /api/shop/themes                → temas disponibles
POST   /api/shop/purchase/:themeId     → comprar tema con Seeds
```

### 4.5 Ari NPC
```
GET    /api/ari/dialog/:treeId?userId= → diálogo contextual
GET    /api/ari/mood/:treeId           → estado actual del NPC en este árbol
```

---

## 5. Webhooks (Trust Quest recibe de Trust Maker)

Trust Maker debe configurarse para enviar eventos a Trust Quest. Propuesta: un
sistema de webhooks simple con reintentos.

| Evento | Payload | Acción en Trust Quest |
|--------|---------|----------------------|
| `member.joined` | `{treeId, userId, invitedBy}` | Otorgar XP por unirse, verificar logro "miembro activo" |
| `member.invited` | `{treeId, userId, invitedUserId}` | XP por invitar, quest "invita 2 miembros" |
| `vote.cast` | `{treeId, userId, needId}` | XP por votar, quest "3 votos esta semana" |
| `need.created` | `{treeId, userId, needId}` | XP por proponer, logro "5 ideas aprobadas" |
| `need.approved` | `{treeId, needId, approvedBy}` | XP extra al creador |
| `task.completed` | `{treeId, userId, taskId}` | XP por completar tarea |
| `cycle.closed` | `{treeId, stats}` | Evento de fin de ciclo, recalcular leaderboard |

Trust Maker solo necesita un endpoint genérico `/api/hooks/trust-quest` que
despache eventos. Se puede usar el `HooksController` existente extendido.

---

## 6. Flujo de Eventos (Ejemplo)

1. **Usuario vota** en Trust Maker (bot de Telegram)
2. Trust Maker registra el voto en su DB
3. Trust Maker emite webhook `vote.cast` → `POST http://localhost:3101/api/events`
4. Trust Quest recibe el evento, lo valida (firma HMAC)
5. Calcula: +10 XP, verifica quests activas (¿llegó a 3 votos?), verifica logros
6. Si completa quest/logro: notificación vía Trust Maker (webhook inverso o API)
7. Actualiza Redis leaderboard si el XP cambió posición en top 100

---

## 7. Ari como NPC

El NPC se implementa en dos capas:

**Trust Quest:** genera el *contexto* (mood, diálogos disponibles, datos del árbol).
Expone el endpoint `/api/ari/dialog/:treeId` que devuelve:

```json
{
  "mood": "excited",
  "dialog": "¡{playerName} acaba de conseguir 3 votos en su idea! 🌟",
  "availableQuests": ["daily_vote", "complete_profile"],
  "treeStats": { "activeNeeds": 5, "membersOnline": 12, "cycleDay": 3 }
}
```

**Hermes Agent (Ari):** consume ese endpoint y lo integra en su personalidad.
El system prompt de Ari incluye instrucciones para usar Trust Quest como fuente
de contexto. La respuesta textual la genera el LLM, no Trust Quest.

---

## 8. Plan de Implementación (Fases)

### Fase 1: Fundación (2 semanas)
- [ ] Repo `leoprm/trust-quest` con Express + TypeScript + Prisma + Redis
- [ ] Modelo Player, PlayerTree, CurrencyTransaction
- [ ] Sistema de XP básico: eventos → +XP
- [ ] Endpoint `/api/players/:userId`
- [ ] Trust Maker: webhook dispatch genérico

### Fase 2: Logros (1 semana)
- [ ] Modelo Achievement + PlayerAchievement
- [ ] ~15 logros iniciales (primer voto, 5 ideas, 10 miembros, etc.)
- [ ] Verificación en cada evento recibido

### Fase 3: Misiones (2 semanas)
- [ ] Modelo Quest + PlayerQuest
- [ ] Misiones diarias y semanales (generación automática)
- [ ] Cron job (BullMQ) para rotar misiones diarias
- [ ] Claim de recompensas

### Fase 4: Leaderboards (1 semana)
- [ ] Redis Sorted Sets para rankings globales y por árbol
- [ ] Rankings semanales (reset domingo)
- [ ] Endpoints de leaderboard

### Fase 5: Ari NPC (1 semana)
- [ ] Modelo AriDialog
- [ ] Endpoint `/api/ari/dialog/:treeId`
- [ ] Integración en system prompt de Ari
- [ ] Diálogos contextuales por hitos

### Fase 6: Capa 3 — Tienda (futuro, sin fecha)
- [ ] Temas visuales
- [ ] Compra con Seeds/Flowers
- [ ] Publicación comunitaria

---

## 9. Decisiones Técnicas Clave

### ¿Por qué repo separado y no un módulo en Trust Maker?

1. **Dominios distintos.** Trust Maker = mensajería + sandbox + votaciones.
   Trust Quest = gaming + economía + leaderboards. Juntos se acoplan innecesariamente.

2. **Stack independiente.** Trust Quest necesita Redis para leaderboards y BullMQ
   para misiones programadas. Agregar Redis a Trust Maker solo por gaming es
   contaminación de infraestructura.

3. **Escalado independiente.** Leaderboards y quests tienen patrones de tráfico
   distintos al bot de Telegram. Separados, cada uno escala según su carga.

4. **Equipos separables.** Si mañana alguien solo trabaja en quests, no necesita
   entender todo el pipeline de onboarding de Trust Maker.

### ¿DB compartida o separada?

**Separada.** Trust Quest no necesita acceso a las tablas de Trust Maker.
Los eventos webhook traen la información necesaria. Si Trust Quest necesita
datos extra (ej: nombre del árbol), consulta la API de Trust Maker, no la DB.

### ¿Webhooks o polling?

**Webhooks** de Trust Maker → Trust Quest para eventos en tiempo real (votos,
miembros nuevos). Con cola de reintentos (BullMQ, 3 intentos con backoff).

**Polling** de Trust Quest → Trust Maker solo para sincronización inicial o
recovery (ej: recalcular XP de todos los miembros de un árbol).

---

## 10. Preguntas Abiertas

1. **Seeds iniciales:** ¿Todos empiezan con 0 o damos un pack de bienvenida (50 seeds)?
2. **Decay de inactividad:** ¿Perdés XP/Seeds por inactividad prolongada?
3. **Economía cerrada:** Confirmado — sin compra fiat, sin retiro a dinero real.
4. **Moderación de temas:** Capa 3 — ¿quién aprueba temas visuales? ¿Comunidad vota?
