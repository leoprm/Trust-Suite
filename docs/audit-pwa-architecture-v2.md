# Audit: PWA Architecture → Trust Lite v2

Fecha: 2026-05-12
Auditor: owl-alpha-3 (Hermes Agent)
Codebase: `/home/leo/Documentos/Trust Suite/frontend/`
Alcance: 6 flavors, 6 service workers, AppSwitcher SSO, MobileShell, Vite multi-mode

---

## Tabla de Decisiones

| # | Feature | Decisión | Justificación |
|---|---------|----------|---------------|
| 1 | **Sistema multi-flavor** (6 PWAs, Vite modes, `isTrustLite/isBranchOS/…`, `appConfig.ts` con 6 entries) | **ELIMINAR** (colapsar a 1) | v2 es UNA app. Los flavor-gates (`isTrustLite &&`, `isBranchOS &&`) son overhead puro si hay 1 solo target. El patrón de `APP_CONFIGS` se simplifica a 1 config estática. Los `.env.{flavor}` desaparecen — solo queda `.env`. |
| 2 | **Trust Lite** (5173, dashboard principal) | **QUEDA** como LA app única | Es el flavor más completo: Dashboard, People, Trees, Admin, Wallet, Career Path, Privacy, TreeDetail, TreeNetwork, CreateTree. Absorbe todo lo demás. Pasa de ser "un flavor" a ser "la app". |
| 3 | **Branch OS** (5174, operaciones de rama) | **ABSORBER** en Trust Lite | Solo tiene `BranchOSDashboard.tsx` + ruta `/tasks`. No justifica PWA separada. Su contenido (task board por rama) se convierte en una sección/pestaña dentro de TreeDetail o Dashboard. ~50 líneas de ruta en App.tsx. |
| 4 | **Trace Lite** (5175, perfil/reputación) | **ABSORBER** en Trust Lite | Tiene `TraceProfile`, `TalentHunter`, `CareerPath`, `PublicProfile` — componentes reutilizables. CareerPath ya está montado en Trust Lite (`/career-path/:treeId`). Las rutas de Trace se mueven a Trust Lite sin cambios. |
| 5 | **Trust Insight** (5176, radar cross-tree, métricas) | **ABSORBER** en Trust Lite | `TrustInsightDashboard.tsx` muestra radar de necesidades cross-tree. Útil como sección de analytics dentro de Trust Lite. No justifica PWA separada. Se convierte en ruta `/insight` o pestaña en Dashboard. |
| 6 | **Trust Landing** (5177, página pública corporativa) | **ARCHIVAR** (opcional, separado) | v2 necesita landing para la versión hosted, PERO no necesita ser parte de la misma app. Recomendación: sitio estático separado (HTML puro o Astro) sin React, sin auth, sin Vite — solo deploy de archivos estáticos. No comparte codebase con la app principal. Si se quiere mantener en el repo, que sea `frontend/landing/` como proyecto independiente. |
| 7 | **Cross-PWA SSO** (session-token, cross-login, AppSwitcher) | **ELIMINAR** | Con 1 sola app, el SSO entre PWAs es innecesario. Se elimina: `GET /auth/session-token`, `POST /auth/cross-login`, `AppSwitcher.tsx` (~87 líneas), `crossLogin()` en authStore, `ssoChecking` en App.tsx (~25 líneas), todas las `VITE_*_URL` en .env files. El token JWT sigue funcionando normalmente dentro de la app única. |
| 8 | **PWA features** (service workers, offline, install prompt) | **QUEDA** (simplificado) | 1 service worker en vez de 6 (`sw.js` único). Cache-first para assets estáticos. `beforeinstallprompt` se mantiene. Manifest único. Los íconos se reducen a 1 set (192+512). Sin cambios en la lógica — solo colapso de 6 SWs a 1. |
| 9 | **Vite preview vs dev** (problemas con túneles mobile) | **QUEDA** Vite, modo único | Vite sigue siendo la herramienta correcta. El problema HMR+WebSocket+túnel+mobile es conocido y tiene solución documentada (vite preview). Con 1 sola app: 1 build, 1 preview port, 1 túnel. Se elimina la complejidad de 6 builds + 6 previews + 6 túneles. El script `start-lan-servers.sh` pasa de 4 procesos Vite a 1. |
| 10 | **MobileShell** (matriz Crear/Hacer/Medir) | **QUEDA** (unificado) | Es el UX diferencial de Trust Suite en mobile. Con 1 app, la matriz unifica entidades que antes estaban segregadas por flavor: `arbol`, `necesidad`, `rama`, `tarea` todos en el mismo MobileShell. `matrixEntities` en `appConfig` se expande para incluir todas las entidades (`['arbol', 'necesidad', 'rama', 'tarea']`). El drawer de utilidad (`notifications`, `profile`, `privacy`, `directory`) también se unifica. |

---

## Propuesta de Arquitectura Frontend para Trust Lite v2

### Principio rector: 1 app, 1 build, 1 túnel, 0 flavor-gates

### Stack

```
React 19 + TypeScript + Vite 6
Zustand (auth, matrix)
React Router v7
lucide-react (íconos)
Recharts (gráficos)
react-i18next (es/en)
Axios (API client)
```

**No Next.js.** Justificación:
- Trust Lite v2 es SPA pura (no necesita SSR/SSG para su caso de uso)
- Self-hosted: Vite preview sirve archivos estáticos, cero infraestructura Node.js en producción
- El equipo ya domina Vite + React Router
- Next.js agregaría complejidad de deployment (Node server) que contradice "simple, self-hostable"
- Migrar 30+ componentes a Next.js App Router es reescritura costosa sin beneficio claro

### Estructura de archivos (post-colapso)

```
frontend/
├── index.html
├── vite.config.ts              # 1 solo puerto (5173 dev, 4173 preview)
├── .env                        # Variables únicas (sin .env.{flavor})
├── public/
│   ├── icon-192.png, icon-512.png
│   ├── manifest.json           # 1 solo manifest
│   └── sw.js                   # 1 solo service worker
├── src/
│   ├── main.tsx                # Sin cambios (registra SW único)
│   ├── App.tsx                 # Rutas unificadas, sin flavor-gates
│   ├── index.css
│   ├── config/
│   │   └── appConfig.ts        # Simplificado: 1 config, sin isTrustLite/…
│   ├── layouts/
│   │   └── MainLayout.tsx
│   ├── components/
│   │   ├── MobileShell.tsx     # Matriz unificada (árbol/necesidad/rama/tarea)
│   │   ├── TreeSidebar.tsx
│   │   ├── AppSwitcher.tsx     # ELIMINADO
│   │   ├── ConciergeChat.tsx
│   │   ├── … (resto sin cambios)
│   ├── pages/
│   │   ├── Dashboard.tsx       # Página principal + FinancialDashboard + EvaluatorDashboard
│   │   ├── TreeDetail.tsx
│   │   ├── BranchOSDashboard.tsx   # → sección de tareas dentro de TreeDetail
│   │   ├── TraceProfile.tsx        # → /profile
│   │   ├── TrustInsightDashboard.tsx → /insight
│   │   ├── LandingPage.tsx         # → proyecto separado (landing/)
│   │   └── … (resto sin cambios)
│   ├── store/
│   │   ├── authStore.ts        # Sin crossLogin()
│   │   ├── matrixStore.ts      # Sin cambios
│   │   └── treeStore.ts
│   ├── lib/
│   │   ├── api.ts
│   │   └── …
│   └── i18n.ts
└── dist/                       # 1 solo output (no subdirectorios por flavor)
```

### App.tsx unificado (pseudocódigo)

```tsx
<Routes>
  {/* Públicas */}
  <Route path="/login" element={!auth ? <Login /> : <Navigate to="/" />} />
  <Route path="/join/:token" element={<GuestJoin />} />
  <Route path="/add/:token" element={<ConnectPerson />} />
  <Route path="/p/:code" element={<PublicProfile />} />

  {/* Autenticadas */}
  <Route element={auth ? <MainLayout /> : <Navigate to="/login" />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/trees" element={<TreeNetwork />} />
    <Route path="/trees/list" element={<MyTreesList />} />
    <Route path="/trees/new" element={<CreateTree />} />
    <Route path="/trees/:id" element={<TreeDetail />} />
    <Route path="/people" element={<People />} />
    <Route path="/profile" element={<TraceProfile />} />
    <Route path="/talent" element={<TalentHunter />} />
    <Route path="/insight" element={<TrustInsightDashboard />} />
    <Route path="/career-path/:treeId" element={<CareerPath />} />
    <Route path="/needs/new" element={<NewNeed />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/trustcore" element={<TrustCoreAdminDashboard />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/wallet" element={<WalletPage />} />
  </Route>

  <Route path="*" element={<Navigate to="/" />} />
</Routes>
```

### Lo que se ELIMINA

| Artefacto | Razón |
|-----------|-------|
| `.env.trust-lite`, `.env.branch-os`, `.env.trace-lite`, `.env.trust-insight`, `.env.trust-landing`, `.env.trust-wallet` | 1 sola app |
| `isTrustLite`, `isBranchOS`, `isTraceLite`, `isTrustInsight`, `isTrustLanding`, `isTrustWallet` booleans | Sin flavor-gating |
| `APP_CONFIGS` con 6 entradas | 1 config estática |
| `AppSwitcher.tsx` (~87 líneas) | Sin múltiples PWAs |
| `crossLogin()` en `authStore.ts` (~15 líneas) | Sin SSO cross-PWA |
| `ssoChecking` + `?token` handling en `App.tsx` (~30 líneas) | Sin SSO |
| 5 service workers extra (`sw-branch-os.js`, `sw-trace-lite.js`, `sw-trust-insight.js`, `sw-trust-wallet.js`) | 1 SW único |
| 10+ manifest files extra | 1 manifest único |
| `getAppUrl()`, `getTrustLiteUrl()` en `appConfig.ts` | Sin cross-PWA navigation |
| `VITE_TRUST_LITE_URL`, `VITE_BRANCH_OS_URL`, `VITE_TRACE_LITE_URL`, `VITE_TRUST_INSIGHT_URL`, `VITE_TRUST_WALLET_URL` | Sin referencias cross-PWA |
| `BranchOSDashboard` como página raíz | Se convierte en sección de tareas en TreeDetail |
| `TrustWallet` como flavor separado | Ya integrado en Trust Lite (`/wallet`, `/deposit`, `/withdraw`, `/transfer`, `/transactions`) |

### MobileShell unificado

```
Matriz actual (Trust Lite):  árbol | necesidad | rama
Matriz unificada v2:         árbol | necesidad | rama | tarea

Crear: Tree → CreateTree, Necesidad → NewNeed, Rama → RamaCrear, Tarea → TaskCreate
Hacer: Tree → TreeDetail, Necesidad → NeedsBoard, Rama → BranchBoard, Tarea → TaskBoard
Medir: Tree → FinancialDashboard, Necesidad → InsightsPanel, Rama → BranchMetrics, Tarea → TaskMetrics
```

### Landing page (separado)

```
landing/
├── index.html        # HTML estático puro
├── style.css
├── icon-192.png
├── icon-512.png
├── manifest.json
└── sw.js
```

O alternativamente: `frontend/landing/` como mini-proyecto Vite independiente (solo 1 página, sin React si se quiere minimalista). Se deploya por separado. El botón "Ir al Dashboard" apunta a la URL de Trust Lite v2.

### Resumen de impacto

| Métrica | Antes (v1) | Después (v2) |
|---------|-----------|--------------|
| Flavors/PWAs | 6 | 1 (+ landing opcional separado) |
| Service workers | 6 | 1 |
| Manifest files | 6+ | 1 |
| Vite builds | 6 | 1 |
| Puertos | 6 dev + 6 preview = 12 | 1 dev + 1 preview = 2 |
| Túneles Cloudflare | 6 | 1 |
| `.env.*` files | 7 (.env + 6 flavor) | 1 |
| Líneas en App.tsx | ~210 (flavor-gated) | ~60 (unificado) |
| `appConfig.ts` | 210 líneas, 6 configs | ~20 líneas, 1 config |
| SSO complexity | session-token + cross-login + AppSwitcher | Eliminado |
| `start-lan-servers.sh` | 4 procesos Vite | 1 proceso Vite |

### Riesgos y mitigaciones

1. **Bundle size**: todas las páginas en un solo bundle → code splitting con `React.lazy()` por ruta
2. **MobileShell con 4 entidades**: más complejidad de estado en matrixStore → ya está diseñado para N entidades, solo se agrega 'tarea'
3. **Regresiones**: al quitar flavor-gates, rutas antes ocultas ahora visibles → testing exhaustivo de cada ruta

---

## Conclusión

Trust Lite v2 debe ser **1 sola SPA React + Vite**, absorbiendo Branch OS, Trace Lite, Trust Insight y Trust Wallet. El sistema multi-flavor se elimina completamente — los flavor-gates, el SSO cross-PWA, y los 6 service workers/manifests desaparecen. MobileShell se unifica con las 4 entidades. La landing page se externaliza como sitio estático separado. El resultado: 1 build, 1 túnel, 1 app, complejidad radicalmente reducida.
