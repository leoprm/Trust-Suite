# Trust Maker v4

**Comunidades que se organizan solas — desde Telegram, con conversación natural e inteligencia artificial.**

Trust Maker v4 es la evolución chat-first del ecosistema **Trust**: un marco socioeconómico descentralizado donde las comunidades expresan necesidades, las transforman en trabajo verificable y construyen reputación confiable. Todo desde Telegram, conversando con @TrustMakerBot como si hablaras con un colega.

Es un fork evolutivo del [Trust original](https://github.com/TrustFirstUser/Trust) — toma su ADN constitucional y lo convierte en software autónomo impulsado por Hermes Agent.

---

## 🧬 Trust DNA

Trust parte de una premisa simple: **las necesidades reales deben ser el punto de partida de la economía, la política y el trabajo**, no la especulación ni la captura por capital.

Sus axiomas constitucionales son cuatro:

- **Transparencia** — sin ella no hay confianza. Procesos, votaciones, presupuestos y reglas deben ser auditables.
- **Eficiencia** — sin ella no hay futuro. Reducir duplicación, desperdicio y fricción innecesaria.
- **Autonomía** — sin ella no hay libertad. Cada comunidad (Tree) tiene soberanía real bajo reglas claras.
- **Adaptabilidad** — sin ella no hay verdadera comprensión. Trust evoluciona por crítica, evidencia y votación.

> *"Este sistema no se impondrá por la fuerza ni por la revolución. Se adoptará de forma gradual y orgánica por conveniencia."* — Trust DNA

[Leer DNA completo →](docs/TRUST-DNA.md)

---

## 🏗️ Arquitectura v4

Trust Maker v4 es una **aplicación chat-first** con un único backend Express + una SPA, orquestada por Hermes Agent.

```
┌──────────────────────────────────────────────────┐
│  Telegram @TrustMakerBot (chat-first)            │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │ Comandos /  │  │ Conversación natural       │ │
│  │ /info       │  │ "¿qué necesidades hay?"    │ │
│  │ /crea       │  │ "asigna esto a un agente"  │ │
│  │ /vota       │  │ "¿cómo va mi árbol?"       │ │
│  └──────┬──────┘  └──────────┬─────────────────┘ │
└─────────┼────────────────────┼───────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────────────────────────────────────┐
│  Trust Maker API (:3000)                         │
│  Express + Prisma + MySQL                        │
│                                                  │
│  /api/concierge ←→ Hermes Agent (:8642)          │
│  /api/ratings    ←→ Rating cross-árbol IA        │
│  /api/agents     ←→ Auto-provisioning            │
│  /api/tasks      ←→ Smart routing                │
│  /api/billing    ←→ Paddle / Stripe              │
│  /api/analytics  ←→ Dashboard ecosistema         │
└──────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────┐
│  Hermes Agent — Multi-Agente Inteligente         │
│                                                  │
│  Difficulty Evaluator · Tree Agents · Analyst    │
│  Researcher · Implementer · Reviewer · Mediator  │
│                                                  │
│  Auto-scaling · Smart routing · XP decay         │
│  Rating cross-árbol · Exploration pool           │
└──────────────────────────────────────────────────┘
```

### Canales de interacción

| Canal | Propósito |
|-------|-----------|
| **Telegram @TrustMakerBot** | Chat-first: comandos `/` y conversación natural |
| **SPA web** | Dashboard, analytics, billing, admin |
| **API REST** | Integraciones, BYO AI, automatización |

### Motor multi-agente

Trust Maker v4 despliega un ecosistema de agentes IA especializados por árbol:

| Rol | Función |
|-----|---------|
| **Analyst** | Analiza necesidades del árbol y propone soluciones |
| **Researcher** | Investiga, documenta y contextualiza |
| **Implementer** | Ejecuta tareas técnicas verificables |
| **Reviewer** | Revisa y valida resultados con evidencia |
| **Mediator** | Facilita consensos entre miembros |

**Operaciones autónomas:**
- **Auto-provisioning**: al crear un árbol se asignan 3 agentes iniciales + necesidad génesis
- **Smart task routing**: las tareas se asignan al agente con mejor perfil (rol, XP, confidenceScore)
- **Auto-scaling**: el sistema ajusta agentes según carga (>5 necesidades sin agente → +1, <2 con 3+ agentes → libera)
- **XP cross-árbol con decaimiento**: los agentes acumulan reputación verificable entre árboles, con decaimiento exponencial por inactividad
- **Exploration pool**: agentes nuevos rotan para evitar estancamiento de los establecidos

---

## 🔄 Ciclo mínimo

El flujo que define el MVP funcional:

```
Necesidad → Idea → Rama → Tarea → Evidencia → Auditoría → XP → Trace
```

Y para casos comerciales:

```
Cliente externo → Necesidad Externa → Solución + Presupuesto → Tareas → Evidencia → Auditoría → Entrega → XP → Trace
```

---

## 💰 Reglas económicas

Trust Maker separa estrictamente tres formas de valor:

| Capa | Rol | Regla |
|------|-----|-------|
| **Fiat** | Ledger externo | Financia recursos, infraestructura y suscripciones. **No compra autoridad.** |
| **Berries** | Circulación interna | Coordinan trabajo y recursos dentro del Tree. Caducan a 12 meses. |
| **XP** | Reputación verificable | Certifica contribución real. Se gana con trabajo, no se compra. |

**Prohibiciones constitucionales:**

- Fiat no compra XP, nivel, votos, reputación ni autoridad política.
- XP no se vende.
- Berries no se convierten directamente en poder político.

## 🛡️ Invariantes que el código protege

1. Fiat no compra autoridad.
2. XP no se vende.
3. Berries no son fiat.
4. Necesidades Externas no usan poder político interno.
5. Evidencia cruda no es pública por defecto.
6. Toda acción sensible deja EventLog.
7. La exportabilidad es garantía política, no feature secundaria.
8. Trace muestra contribución verificable, no autopromoción.

---

## 🌳 Actores principales

| Actor | Definición |
|-------|------------|
| **Persona** | Participante individual. Expresa necesidades, vota, contribuye, gana XP. |
| **Tree** | Comunidad autónoma. Unidad organizativa central. |
| **Branch** | Unidad de trabajo/proyecto. Resuelve necesidades mediante 8 fases. |
| **Agent IA** | Miembro no-humano con rol, nivel y XP. Ejecuta, analiza, revisa. |
| **External Agent** | Cliente, sponsor o contacto externo. Trae necesidades/fiat, no autoridad. |
| **Auditor** | Revisor de tareas y evidencia. Genera confianza verificable. |
| **Expert** | Persona con credenciales Trace validadas. Pondera decisiones técnicas. |

---

## 💳 Modelo de suscripción

Trust Maker v4 usa un modelo de suscripción dinámica con economías de escala reales:

- **Paddle**: checkout y gestión de suscripciones (web)
- **Stripe Connect**: payouts a creadores de árboles
- **Precio dinámico**: `costo_user(n) = costo_base / (n/n_base)^e` — a más usuarios, menor costo por usuario
- **BYO API Keys**: los usuarios pueden registrar sus propias API keys de LLMs externos para reducir costos de inferencia

**Nota:** Paddle y Stripe requieren keys de producción. En desarrollo usan placeholders que retornan errores esperados.

---

## 📁 Estructura del proyecto

```
TrustMaker/
├── backend/              # Trust Maker API (Express + Prisma + MySQL)
│   ├── prisma/           # Schema y migraciones SQLite/MySQL
│   └── src/
│       ├── bot/          # Telegram @TrustMakerBot (grammy)
│       │   ├── index.ts      # Polling, comandos, conversación natural
│       │   ├── commands.ts   # /info, /crea, /vota, etc.
│       │   ├── messages.ts   # Handler de conversación natural
│       │   ├── analyzer.ts   # Análisis pasivo de feedback en grupos
│       │   ├── voting.ts     # Votación por reacciones
│       │   └── scheduler.ts  # Cierre diario, resúmenes
│       ├── controllers/  # Request handlers (auth, tree, need, concierge, etc.)
│       ├── services/     # Lógica de negocio (taskRouter, autoScaler, genesisService)
│       ├── routes/       # Endpoints REST
│       ├── middleware/    # Auth JWT, rate limiting
│       └── config/       # Rate limiter, prompts
├── docs/                 # Documentación, auditorías, reportes
├── openspec/             # Propuestas y especificaciones de cambios
└── README.md
```

---

## 🔒 Aislamiento por Árbol

Cada comunidad (árbol) puede generar sus propias aplicaciones — frontends, scripts, agentes. Para evitar colisiones, fugas de seguridad y consumo descontrolado de recursos, Trust Maker implementa **aislamiento por directorio** (Fase 1), con ruta de crecimiento a Docker (Fase 2).

### Estructura de directorios

Cada árbol tiene su workspace aislado en el filesystem:

```
/home/leo/trees/
  {treeId}/
    apps/       # Aplicaciones del árbol (frontends, scripts)
    data/       # Datos persistentes (uploads, exports, DB local)
    logs/       # Logs de aplicaciones
```

El sandbox se crea automáticamente al crear un árbol cuya `admissionPolicy` no sea `CLOSED`.

### API de sandboxes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/trees/:id/sandbox` | Crear sandbox (directorios + puerto) |
| `GET` | `/api/trees/:id/sandbox` | Obtener estado del sandbox |
| `DELETE` | `/api/trees/:id/sandbox` | Destruir sandbox (libera directorios y puerto) |
| `GET` | `/api/trees/:id/sandbox/health` | Health check del sandbox |

Crear y destruir requieren autenticación JWT.

**Ejemplo — crear sandbox:**
```bash
curl -X POST http://localhost:3000/api/trees/abc123/sandbox \
  -H "Authorization: Bearer $TOKEN"
```
**Respuesta:**
```json
{
  "treeId": "abc123",
  "port": 4100,
  "workspacePath": "/home/leo/trees/abc123",
  "status": "IDLE",
  "createdAt": "2026-05-14T12:00:00Z"
}
```

**Ejemplo — destruir sandbox:**
```bash
curl -X DELETE http://localhost:3000/api/trees/abc123/sandbox \
  -H "Authorization: Bearer $TOKEN"
```

### Pool de puertos

Cada sandbox recibe un puerto TCP del rango **4100–4999** (900 puertos disponibles). El servicio `TreeSandbox` asigna el menor puerto libre secuencialmente, evitando colisiones consultando la tabla `TreeSandbox` en base de datos. Si el pool se agota, la API retorna `507 Insufficient Storage`.

| Propiedad | Valor |
|-----------|-------|
| Rango | 4100 – 4999 |
| Capacidad | 900 puertos |
| Asignación | Secuencial, menor libre primero |
| Agotado | Error 507 |

### Modelo de datos

```prisma
model TreeSandbox {
  id        String   @id @default(uuid())
  treeId    String   @unique
  port      Int      @unique
  status    String   @default("IDLE")  // IDLE | RUNNING | ERROR
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tree Tree @relation(fields: [treeId], references: [id], onDelete: Cascade)
}
```

### Servicio TreeSandbox

`backend/src/services/treeSandbox.ts` abstrae las operaciones de filesystem y puertos:

```typescript
class TreeSandbox {
  static async create(treeId: string): Promise<SandboxInfo>;
  static async destroy(treeId: string): Promise<void>;
  static async get(treeId: string): Promise<SandboxInfo | null>;
  static async list(): Promise<SandboxInfo[]>;
  static async health(treeId: string): Promise<boolean>;
}
```

### Plan de migración a Docker (Fase 2)

La interfaz `TreeSandbox` está diseñada para que los consumers (API routes, bot) no cambien al migrar. En Fase 2:

| Operación | Fase 1 (hoy) | Fase 2 (Docker) |
|-----------|-------------|-----------------|
| `create` | `mkdir` + asignar puerto | `docker compose up` con volumen montado |
| `destroy` | `rm -rf` + liberar puerto | `docker compose down` |
| `health` | `GET localhost:{port}/health` | `docker ps` + healthcheck HTTP |
| `list` | `SELECT * FROM TreeSandbox` | Sin cambios |

**Beneficios de Fase 2:**
- Aislamiento real de procesos (cgroups, namespaces)
- Límites de CPU/memoria por árbol
- Reinicio automático de apps caídas
- Sin cambios en el código que consume `TreeSandbox`

> **Nota:** Fase 1 es ligera — no requiere Docker instalado. Las apps corren en el mismo proceso Node.js pero con contexto aislado por árbol. Ideal para prototipado y pilotos controlados.

---

## 🚀 Inicio rápido

```bash
cd backend

# 1. Instalar dependencias
npm install

# 2. Configurar .env con TELEGRAM_BOT_TOKEN, DATABASE_URL, JWT_SECRET
cp .env.example .env

# 3. Iniciar (Telegram Bot + API + Hermes Agent)
npx tsx src/index.ts
```

Accesos:
- **API**: `http://localhost:3000`
- **Telegram Bot**: `@TrustMakerBot` (buscar en Telegram)
- **Hermes Agent API**: `http://localhost:8642`

---

## 📜 Documentación

| Documento | Contenido |
|-----------|-----------|
| [TRUST-DNA.md](docs/TRUST-DNA.md) | DNA constitucional completo: axiomas, economía, gobernanza, ciclo de trabajo, actores |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack técnico, estructura del código, API, modelo de datos, despliegue |
| [security-audit.md](docs/security-audit.md) | Auditoría de seguridad: hallazgos, severidades, fixes |
| [e2e-test-report.md](docs/e2e-test-report.md) | Reporte de pruebas end-to-end |
| [openspec/](openspec/) | Propuestas de cambios: bot conversacional, multi-agente, rating cross-árbol, auto-scaling |

---

## 📍 Estado actual

Trust Maker v4 está en **fase de prototipo funcional**. El bot de Telegram (@TrustMakerBot) opera con comandos estructurados y conversación natural vía Hermes Agent. El motor multi-agente con rating cross-árbol, smart routing y auto-scaling está implementado.

Próximos hitos: pilotos controlados con comunidades reales en Telegram.

---

**Trust Maker v4** es un fork del [Trust original](https://github.com/TrustFirstUser/Trust) por [TrustFirstUser](https://github.com/TrustFirstUser).  
Licencia: MIT (heredada del proyecto original).
