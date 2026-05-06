# Trust Suite — Arquitectura Técnica

> Stack, estructura de código, modelo de datos, API y despliegue.

---

## 1. Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Backend** | Node.js + Express 5 | TypeScript |
| **ORM** | Prisma | 5.14+ |
| **Base de datos** | MySQL | 8.0 |
| **Auth** | JWT (jsonwebtoken) + bcryptjs | — |
| **Uploads** | Multer | 2.x |
| **Tareas programadas** | node-cron | 4.x |
| **Imágenes** | Sharp | 0.34 |
| **Frontend** | React 19 + Vite 7 | TypeScript |
| **Ruteo** | React Router 7 | — |
| **Estado** | Zustand 5 | — |
| **UI** | Lucide React icons + Tailwind CSS | — |
| **Gráficos** | Recharts 3 | — |
| **Grafos** | react-force-graph-2d | — |
| **QR** | react-qr-code + html5-qrcode | — |
| **i18n** | i18next + react-i18next | — |
| **Animaciones** | Framer Motion 12 | — |
| **Build** | Vite 7 con múltiples modos | — |

---

## 2. Estructura del proyecto

```
Trust Suite/
├── README.md                     # Documentación principal
├── docs/                         # Documentación formal
│   ├── TRUST-DNA.md              # ADN constitucional
│   ├── ARCHITECTURE.md           # Este documento
│   ├── trust-adn-implementation-context.md
│   ├── chatgpt-trust-evaluation-synthesis.md
│   ├── fiat-ledger-separation.md
│   ├── autosustento-branches-v0.1.md
│   ├── external-needs-v0.1.md
│   ├── scope-preferences-v0.1.md
│   ├── solution-proposals-budget-v0.1.md
│   └── exports-v0.1.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Modelo de datos completo
│   │   └── migrations/           # Historial de migraciones
│   ├── src/
│   │   ├── index.ts              # Entry point (Express app)
│   │   ├── config/
│   │   │   └── database.ts       # Conexión Prisma
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verification
│   │   │   ├── eventLog.ts       # EventLog automático
│   │   │   └── privacy.ts        # Control de visibilidad
│   │   ├── routes/
│   │   │   ├── userRoutes.ts     # Auth, perfil, usuarios
│   │   │   ├── treeRoutes.ts     # CRUD de Trees
│   │   │   ├── branchRoutes.ts   # Branches y fases
│   │   │   ├── taskRoutes.ts     # Tareas y evidencia
│   │   │   ├── evidenceRoutes.ts # Archivos de evidencia
│   │   │   ├── fiatRoutes.ts     # Ledger fiat legacy
│   │   │   ├── fiatTransactionRoutes.ts  # Ledger fiat moderno
│   │   │   ├── berryFlowRoutes.ts        # Circulación de Berries
│   │   │   ├── externalNeedRoutes.ts     # Necesidades externas
│   │   │   ├── autosustentoBranchRoutes.ts # Ramas de autosustento
│   │   │   ├── insightRoutes.ts          # Trust Insight
│   │   │   ├── exportRoutes.ts           # Exportación
│   │   │   ├── eventLogRoutes.ts         # Auditoría de eventos
│   │   │   ├── privacySettingsRoutes.ts  # Config de privacidad
│   │   │   ├── recruitmentRoutes.ts      # Talent Hunter
│   │   │   ├── skillRoutes.ts            # Skills y expertise
│   │   │   ├── notificationRoutes.ts     # Notificaciones
│   │   │   ├── uploadRoutes.ts           # Subida de archivos
│   │   │   ├── migrationRoutes.ts        # Migración entre Trees
│   │   │   ├── contactRoutes.ts          # Contactos entre usuarios
│   │   │   ├── discoveryRoutes.ts        # Descubrimiento geográfico
│   │   │   ├── geoRoutes.ts              # Geolocalización
│   │   │   ├── bonusRoutes.ts            # Bonos
│   │   │   ├── p2pRoutes.ts              # Promesas P2P
│   │   │   └── plantillaArbolRoutes.ts   # Plantillas de Tree
│   │   └── scripts/
│   │       ├── seed-demo.ts      # Datos demo
│   │       └── test-api.ts       # Tests de API
│   └── uploads/                  # Archivos subidos (no en git)
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts            # Multi-build por modo PWA
│   ├── index.html                # HTML con variables de entorno
│   ├── public/
│   │   ├── icon-*-192.png        # Iconos PWA 192px
│   │   ├── icon-*-512.png        # Iconos PWA 512px
│   │   ├── icon-*-raw.svg        # Iconos SVG originales
│   │   ├── manifest-*.json       # Manifiestos PWA por app
│   │   └── sw.js                 # Service Worker
│   └── src/
│       ├── App.tsx               # Ruteo principal
│       ├── main.tsx              # Entry point
│       ├── api/
│       │   └── api.ts            # Cliente Axios compartido
│       ├── store/
│       │   └── authStore.ts      # Estado de autenticación (Zustand)
│       ├── config/
│       │   └── appConfig.ts      # Config por modo PWA
│       ├── layouts/
│       │   └── MainLayout.tsx    # Layout con lógica condicional PWA
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx     # Dashboard principal
│       │   ├── TreeDetail.tsx
│       │   ├── BranchOSDashboard.tsx
│       │   ├── TraceProfile.tsx
│       │   ├── TrustInsightDashboard.tsx
│       │   ├── TalentHunter.tsx
│       │   ├── PublicProfile.tsx
│       │   ├── PrivacyPage.tsx
│       │   └── ...
│       └── components/           # Componentes reutilizables
│
├── start-lan-servers.sh          # Script de despliegue local
├── stop-lan-servers.sh           # Detener servidores
├── setup-local-mysql.sh          # Configurar MySQL local
└── run-logs/                     # Logs de servidores
```

---

## 3. Modelo de datos

### 3.1 Diagrama conceptual

```
User ──┬── TreeMember ──┬── Tree ──┬── Need (via NeedTree)
       │                 │          ├── Branch ──┬── Task
       │                 │          │             ├── BranchMember
       │                 │          │             ├── AutosustentoBranchConfig
       │                 │          │             └── SustainabilitySplit
       │                 │          ├── ExternalNeed ──┬── ExternalAgent
       │                 │          │                   ├── ScopePreference
       │                 │          │                   └── SolutionProposal
       │                 │          ├── InsightSignal
       │                 │          ├── ExpertEndorsement
       │                 │          ├── FiatTransaction
       │                 │          ├── BerryTransaction
       │                 │          └── EventLog
       │                 ├── EvidenceFile
       │                 ├── PrivacySettings
       │                 └── Trace (via XP, skills, badges)
       │
       └── Contact, Notification, Skill, ConnectionToken...
```

### 3.2 Entidades principales

| Entidad | Descripción | Relaciones clave |
|---------|-------------|-----------------|
| **User** | Persona registrada | Memberships, Needs, Ideas, Tasks, XP |
| **Tree** | Comunidad autónoma | Members, Needs, Branches, Economy, Governance |
| **TreeMember** | Membresía en Tree | XP, nivel, rol, bayasBalance, skills |
| **Need** | Necesidad priorizada | Creator, Fundings, Ideas, TreeLinks |
| **Idea** | Propuesta de solución | Need, Creator, Branch |
| **Branch** | Unidad de trabajo (8 fases) | Tree, Idea, Tasks, Members, Phase |
| **Task** | Unidad atómica de trabajo | Branch, asignee, difficulty, evidence |
| **EvidenceFile** | Archivo de evidencia | Uploader, Task, visibility, checksum |
| **EventLog** | Registro de auditoría | Actor, Tree, action, entity, severity |
| **FiatTransaction** | Transacción fiat externa | Tree, Branch, ExternalNeed, creator |
| **BerryTransaction** | Transacción de Berries | Tree, fromUser, toUser, lot |
| **ExternalNeed** | Necesidad de cliente externo | Tree, Agents, ScopePreferences, Solutions |
| **InsightSignal** | Señal de necesidad no resuelta | Need, Tree, status, persistenceScore |
| **ExpertEndorsement** | Aval entre expertos | Endorser, endorsed, resolver |

### 3.3 Enums clave

| Enum | Valores |
|------|---------|
| **TreeEconomyMode** | NO_ECONOMY, LEGACY_FIAT, BERRIES_LATENT, BERRIES_ACTIVE, TRUST_FULL |
| **BranchType** | NORMAL, HASHTAG, AUTOSUSTENTO, EXTERNAL_CONTRACT |
| **BranchPhase** | GENERATION, INVESTIGATION, DEVELOPMENT, PRODUCTION, DISTRIBUTION, MAINTENANCE, RECYCLING, COMPLETED |
| **TaskStatus** | OPEN, IN_PROGRESS, COMPLETED |
| **EvidenceVisibility** | PRIVATE, TASK_PARTICIPANTS, TREE_ONLY, TRUST_NETWORK, PUBLIC_METADATA, PUBLIC |
| **EventSeverity** | INFO, WARNING, CRITICAL |
| **MemberStatus** | UNVERIFIED, VERIFIED, BANNED |
| **MembershipRole** | ADMIN, MEMBER |

---

## 4. API REST

### 4.1 Estructura de endpoints

Todos los endpoints siguen el patrón REST bajo `/api/`. Autenticación vía JWT en header `Authorization: Bearer <token>`.

### 4.2 Grupos de endpoints

| Grupo | Prefijo | Propósito |
|-------|---------|-----------|
| **Auth/Users** | `/api/auth/*`, `/api/users/*` | Registro, login, perfil, contactos |
| **Trees** | `/api/trees/*` | CRUD de comunidades, miembros, economía |
| **Needs** | `/api/needs/*`, `/api/trees/:treeId/needs` | Necesidades, priorización, funding |
| **Ideas** | `/api/ideas/*` | Propuestas, likes |
| **Branches** | `/api/branches/*`, `/api/trees/:treeId/branches` | Ramas, fases, miembros |
| **Tasks** | `/api/branches/:branchId/tasks/*` | Tareas, evidencia, dificultad, completitud |
| **Evidence** | `/api/evidence/*` | Archivos, visibilidad, checksums |
| **Fiat** | `/api/fiat/*`, `/api/trees/:treeId/fiat-ledger/*` | Ledger externo |
| **Berries** | `/api/trees/:treeId/berries/*` | Circulación interna |
| **ExternalNeed** | `/api/trees/:treeId/external-needs/*` | Necesidades externas |
| **Autosustento** | `/api/trees/:treeId/autosustento-branches/*` | Ramas comerciales |
| **Insight** | `/api/trees/:treeId/insight/*` | Señales y oportunidades |
| **Exports** | `/api/exports/*` | Exportación de datos |
| **EventLog** | `/api/event-log/*` | Auditoría de eventos |
| **Privacy** | `/api/privacy-settings/*` | Config de privacidad |
| **Skills** | `/api/skills/*` | Habilidades y expertise |
| **Recruitment** | `/api/recruitment/*` | Talent Hunter |

### 4.3 Middleware

| Middleware | Función |
|-----------|---------|
| `auth` | Verifica JWT, inyecta `req.user` |
| `eventLog` | Registra acciones sensibles en EventLog |
| `privacy` | Aplica reglas de visibilidad por capa |

### 4.4 Formato de respuesta

Éxito:
```json
{ "data": { ... }, "meta": { ... } }
```

Error:
```json
{ "error": "mensaje", "code": "ERROR_CODE" }
```

---

## 5. Frontend — Arquitectura PWA

### 5.1 Monorepo multi-modo

Un solo código base React compilado 4 veces con diferentes modos de Vite:

| Modo | PWA | Puerto | .env |
|------|-----|--------|------|
| `trust-lite` | Trust Lite | 5173 | `.env.trust-lite` |
| `branch-os` | Branch OS | 5174 | `.env.branch-os` |
| `trace-lite` | Trace Lite | 5175 | `.env.trace-lite` |
| `trust-insight` | Trust Insight | 5176 | `.env.trust-insight` |

Cada modo define:
- `VITE_APP_NAME` — nombre visible
- `VITE_APP_SHORT_NAME` — nombre corto PWA
- `VITE_APP_DESCRIPTION` — descripción
- `VITE_APP_ICON` — ruta del icono
- `VITE_APP_COLOR` — color del tema
- `VITE_API_URL` — backend proxy (`/api`)

### 5.2 Ruteo condicional

`MainLayout.tsx` adapta navegación y UI según el modo activo:

- **Trust Lite:** navegación completa (Trees, Needs, Ideas, Branches, Tasks, XP, Berries, Gobernanza).
- **Branch OS:** enfocado en tareas, evidencia, fiat, presupuestos, autosustento.
- **Trace Lite:** perfil, badges, skills, exportación, visibilidad.
- **Trust Insight:** señales, openings, matches, referrals.

### 5.3 Estado global (Zustand)

```ts
authStore: {
  isAuthenticated: boolean
  user: User | null
  token: string | null
  login(credentials): Promise<void>
  logout(): void
}
```

### 5.4 Cliente API

```ts
// api.ts
const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: apiBaseUrl })
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

---

## 6. Despliegue local

### 6.1 Script principal

`start-lan-servers.sh`:
1. Verifica que MySQL esté corriendo en `127.0.0.1:3306`.
2. Inicia backend en `:3100` con `npx tsx watch`.
3. Inicia 4 Vites en `:5173..:5176`.
4. Crea túneles cloudflared para acceso externo efímero.
5. Registra PID y URLs para gestión.

### 6.2 Requisitos

- Node.js 20+
- MySQL 8.0
- `cloudflared` (para túneles externos)
- Puertos disponibles: 3100, 5173-5176

### 6.3 Variables de entorno

Archivo `backend/.env`:
```env
DATABASE_URL=mysql://trust_suite:password@127.0.0.1:3306/trust_web
JWT_SECRET=<secreto>
PORT=3100
NODE_ENV=development
```

Archivos `.env.*` del frontend: ver §5.1.

---

## 7. Seguridad

### 7.1 Checklist producción

Antes de exponer a usuarios reales:

- CORS restringido a dominios oficiales (no `*`)
- JWT secrets fuertes y rotación
- HTTPS obligatorio
- Rate limiting en endpoints sensibles
- Helmet / security headers
- Logs sin secretos ni datos personales
- Uploads con permisos y sin ejecución
- Backups automatizados de BD
- Debug y stack traces desactivados
- Separación dev / staging / prod

### 7.2 CORS por entorno

```env
# Desarrollo
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://192.168.1.103:5173,http://192.168.1.103:5174,http://192.168.1.103:5175,http://192.168.1.103:5176

# Producción
NODE_ENV=production
CORS_ALLOWED_ORIGINS=https://trustlite.example.com,https://branchos.example.com,https://tracelite.example.com,https://trustinsight.example.com
```

### 7.3 Firewall económico

- Fiat nunca compra XP, nivel, votos ni autoridad (aplicado en middleware y rutas).
- Toda transacción fiat deja EventLog.
- Intentos de modificar reputación vía fiat son bloqueados y registrados como `FIAT_REPUTATION_EFFECT_BLOCKED`.

---

## 8. EventLog

Sistema de auditoría estructural que registra toda acción sensible:

```
EventLog {
  actorId, action, entityType, entityId,
  beforeJson, afterJson, metadataJson,
  ipAddress, severity, source, createdAt
}
```

Eventos clave registrados:
- `USER_LOGIN`, `USER_REGISTER`, `USER_LOGOUT`
- `TREE_CREATED`, `TREE_ECONOMY_MODE_UPDATED`
- `NEED_CREATED`, `NEED_FUNDED`
- `BRANCH_CREATED`, `BRANCH_PHASE_CHANGED`
- `TASK_CREATED`, `TASK_COMPLETED`, `TASK_AUDITED`
- `EVIDENCE_UPLOADED`, `EVIDENCE_VISIBILITY_CHANGED`
- `FIAT_TRANSACTION_CREATED`, `FIAT_REPUTATION_EFFECT_BLOCKED`
- `BERRY_TRANSACTION`, `BERRY_CYCLE_PROCESSED`
- `AUTOSUSTENTO_BRANCH_CREATED`, `AUTOSUSTENTO_BRANCH_ACTIVATED`
- `INSIGHT_SIGNAL_CREATED`, `INSIGHT_OPENING_CREATED`
- `EXPORT_REQUESTED`
- `PRIVACY_SETTINGS_UPDATED`

---

## 9. Dependencias entre capas

```
┌──────────────────────────────────────────────┐
│                  Frontend                     │
│  4 PWAs (React + Vite) sobre código base     │
│              compartido                       │
└──────────────┬───────────────────────────────┘
               │ HTTP REST + JWT
               ▼
┌──────────────────────────────────────────────┐
│               Backend API                     │
│  Express 5 + TypeScript                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Routes  │ │Middleware│ │   Services    │  │
│  │ (REST)   │ │(auth,    │ │ (business     │  │
│  │          │ │ eventLog,│ │  logic)       │  │
│  │          │ │ privacy) │ │               │  │
│  └──────────┘ └──────────┘ └──────┬───────┘  │
│                                    │          │
│                            ┌───────▼───────┐  │
│                            │    Prisma     │  │
│                            │  (ORM +       │  │
│                            │   migrations) │  │
│                            └───────┬───────┘  │
└────────────────────────────────────┼──────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │     MySQL 8.0    │
                            │   (trust_web)    │
                            └──────────────────┘
```

---

**Documento de arquitectura de Trust Suite.**  
*Actualizado según el estado del repositorio a mayo 2026.*
