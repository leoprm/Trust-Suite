# Trust Maker — E2E Test Report

**Fecha:** 2026-05-12  
**Entorno:** Backend :3000, Frontend :5173  
**Tester:** backend-eng (Hermes Agent)

---

## Tabla de Resultados

| # | Feature | Backend (curl) | Frontend (browser) | Estado |
|---|---------|---------------|-------------------|--------|
| 1 | Registro → Login | ✅ 201/200 | ✅ Renderiza dashboard | FUNCIONA |
| 2 | Suscripción (costo) | ✅ /current-cost 200 | ⚠️ /billing redirige a dashboard | PARCIAL |
| 3 | Suscripción (checkout) | ⚠️ Error Paddle (keys placeholder) | ⚠️ /billing redirige | PARCIAL |
| 4 | Modelos (listar) | ✅ POST /models 200 | ⚠️ /models redirige | PARCIAL |
| 5 | Modelos (descargar) | ✅ POST /models/download 200 | — | FUNCIONA |
| 6 | Inferencia (run) | ✅ POST /inference/run 200 | — | FUNCIONA |
| 7 | Fine-tune (create) | ✅ POST /finetune/create 201 | ⚠️ /finetune redirige | FUNCIONA* |
| 8 | BYO AI (register) | ✅ POST /byo/register 201 | — | FUNCIONA |
| 9 | BYO AI (savings) | ✅ GET /byo/savings 200 | — | FUNCIONA |
| 10 | Stripe Connect | ❌ 500 (keys placeholder) | — | BLOQUEADO |
| 11 | Admin Dashboard | ✅ GET /admin/stats 200 | ✅ Tabla completa | FUNCIONA |
| 12 | Admin Users | ✅ GET /admin/users 200 | ✅ Lista 14 usuarios | FUNCIONA |
| 13 | Insight (list) | ✅ GET /trees/:id/insights 200 | — | FUNCIONA |
| 14 | Insight (create) | ✅ POST /trees/:id/insights 201 | — | FUNCIONA |
| 15 | Concierge (chat) | ❌ Timeout 15s+ | ❌ No carga | ROTO |
| 16 | Concierge (search-trees) | ❌ Error interno | — | ROTO |

*Fine-tune create funciona pero el job se auto-ejecutó y falló por falta de `unsloth` (esperado).

---

## Errores Encontrados

### 1. 🔴 CRÍTICO: Primer usuario no se crea como ADMIN
**Endpoint:** `POST /api/auth/register`  
**Esperado:** El primer usuario (count=0) debe tener rol `ADMINISTRATOR`  
**Realidad:** Se crea como `PERSON`  
**Causa raíz:** `prisma.user.count()` probablemente retorna >0 porque hay usuarios preexistentes en la DB compartida `trust_web`.  
**Fix sugerido:** Verificar count real o usar migración/seed que garantice admin inicial.

### 2. 🔴 CRÍTICO: Fine-tune routes NO registradas en index.ts
**Endpoint:** Todas las rutas `/api/finetune/*`  
**Estado:** **ARRÉGLADO** durante este test.  
**Fix aplicado:** Se agregó `import finetuneRoutes` + `app.use('/api/finetune', authenticateJWT, finetuneRoutes)` en `backend/src/index.ts`.

### 3. 🟡 MEDIO: Frontend redirige al dashboard para todas las rutas nuevas
**Rutas afectadas:** `/models`, `/finetune`, `/subscription`, `/billing`, `/billing/payout`  
**Comportamiento:** Navegar a cualquiera de estas URLs muestra el Dashboard en vez de la página correspondiente.  
**Causa probable:** El `MainLayout` o un guard de ruta redirige si el usuario no pertenece a ningún árbol. El usuario de prueba no tiene membresías (`memberships: []`).  
**Recomendación:** Agregar al usuario a un árbol durante el registro, o hacer que estas páginas no requieran membresía.

### 4. 🟡 MEDIO: createCheckout requiere userId en el body
**Endpoint:** `POST /api/billing/create-checkout`  
**Problema:** Requiere `{ userId }` en el body en vez de tomarlo de `req.user.id` del JWT.  
**Fix:** Cambiar `const { userId, priceId, successUrl } = req.body` por `const userId = req.user!.id`.

### 5. 🟡 MEDIO: Concierge timeout (15s+)
**Endpoint:** `POST /api/concierge`  
**Comportamiento:** No responde, probablemente esperando respuesta de Hermes Agent que no está configurado.  
**Causa:** `handleConcierge` en `conciergeController.ts` intenta llamar a un LLM externo.  
**Recomendación:** Agregar timeout de 5s con fallback "Agente no disponible".

### 6. 🟡 MEDIO: Concierge search-trees error interno
**Endpoint:** `POST /api/concierge/search-trees`  
**Respuesta:** `{"error":"Error interno al buscar árboles."}`  
**Causa probable:** `searchPublicTrees` falla porque no hay árboles públicos configurados.

### 7. 🟢 BAJO: Checkout Paddle falla con keys placeholder
**Endpoint:** `POST /api/billing/create-checkout`  
**Error:** `Paddle error 404: invalid_url`  
**Esperado:** Las keys en `.env` son placeholders. El endpoint funciona estructuralmente.

### 8. 🟢 BAJO: Stripe Connect falla con keys placeholder
**Endpoint:** `POST /api/billing/connect-onboarding`  
**Error:** `Invalid API Key provided: sk_test_*******lder`  
**Esperado:** Mismo caso que Paddle.

### 9. 🟢 BAJO: Backend Trust Suite y TrustMaker compiten por puerto :3100
**Problema:** Ambos tienen `PORT=3100` en `.env`. Trust Suite tiene auto-restart y recupera el puerto.  
**Fix aplicado:** TrustMaker se levantó en `PORT=3000`.

### 10. 🟢 BAJO: Model download retorna "already registered"
**Endpoint:** `POST /api/models/download`  
**Comportamiento:** Si el modelo ya existe en DB, retorna `{ message: "Model already registered" }` con el modelo existente. Funciona correctamente pero el mensaje podría ser más claro (ej: "already exists").

---

## Resumen de Endpoints Backend Testeados

| Endpoint | Método | HTTP | Estado |
|----------|--------|------|--------|
| /api/auth/register | POST | 201 | ✅ |
| /api/auth/login | POST | 200 | ✅ |
| /api/billing/current-cost | GET | 200 | ✅ |
| /api/billing/subscription | GET | 200 | ✅ |
| /api/billing/create-checkout | POST | 500 | ⚠️ (Paddle placeholder) |
| /api/billing/connect-onboarding | POST | 500 | ⚠️ (Stripe placeholder) |
| /api/billing/connect-status | GET | 404 | ✅ (esperado sin cuenta) |
| /api/models | POST | 200 | ✅ |
| /api/models/download | POST | 200 | ✅ |
| /api/inference/run | POST | 200 | ✅ |
| /api/inference/jobs/:id | GET | 200 | ✅ |
| /api/finetune/create | POST | 201 | ✅ (fix aplicado) |
| /api/finetune/jobs | GET | 200 | ✅ (fix aplicado) |
| /api/byo/register | POST | 201 | ✅ |
| /api/byo/my-ais | GET | 200 | ✅ |
| /api/byo/savings | GET | 200 | ✅ |
| /api/admin/stats | GET | 200 | ✅ |
| /api/admin/users | GET | 200 | ✅ |
| /api/trees/:id/insights | GET | 200 | ✅ |
| /api/trees/:id/insights | POST | 201 | ✅ |
| /api/concierge | POST | timeout | ❌ |
| /api/concierge/search-trees | POST | 500 | ❌ |

---

## Recomendaciones

### Inmediatas
1. **Arreglar Concierge** — timeout de 15s bloquea la feature completa. Agregar timeout + fallback.
2. **Arreglar frontend routing** — páginas nuevas redirigen al dashboard. Verificar requisito de membresía a árbol.
3. **Quitar userId del body en createCheckout** — usar `req.user.id`.

### Corto plazo
4. **Credenciales reales de Stripe/Paddle sandbox** para probar el flujo de pago completo.
5. **Seed de datos** — crear un script que siembre usuarios demo, árboles y membresías para tests E2E.
6. **Separar DB de Trust Suite y TrustMaker** o usar prefijos/tablas diferentes.

### UX
7. El mensaje "Model already registered" debería decir "Model already exists" para ser más claro.
8. Agregar indicador visual de que las páginas requieren membresía a un árbol.

---

## Fixes Aplicados Durante el Test

1. `backend/src/index.ts`: Agregado `import finetuneRoutes` + `app.use('/api/finetune', authenticateJWT, finetuneRoutes)` (fine-tune no estaba registrado).
2. Backend levantado en `PORT=3000` por conflicto con Trust Suite en :3100.
3. Usuario e2e actualizado a rol `ADMINISTRATOR` vía SQL directo para probar admin endpoints.
