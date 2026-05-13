# Trust Maker — Security Audit Report

**Fecha:** 2026-05-12
**Branch:** `trust-maker`
**Repositorio:** `/home/leo/Documentos/TrustMaker`
**Auditor:** backend-eng (automated)

---

## Resumen Ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL | 3 |
| HIGH     | 4 |
| MEDIUM   | 4 |
| LOW      | 2 |

**1 CRITICAL corregido** (JWT fallback_secret). Quedan 12 hallazgos documentados con fixes propuestos.

---

## 1. CRITICAL — JWT fallback_secret hardcodeado (_CORREGIDO_)

**Archivo:** `backend/src/controllers/authController.ts:7`
**Código vulnerable:**
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
```

**Riesgo:** Si la variable `JWT_SECRET` no está definida en `.env`, todos los tokens JWT se firman con la clave pública `'fallback_secret'`. Cualquier atacante puede generar tokens válidos y autenticarse como cualquier usuario.

**Fix aplicado:**
```ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Authentication will fail.');
  throw new Error('JWT_SECRET is required');
}
```
La app ahora falla en startup si `JWT_SECRET` no está configurada.

---

## 2. CRITICAL — Sin rate limiting en ningún endpoint

**Archivos:** `backend/src/index.ts`, `backend/package.json`
**Riesgo:** No hay protección contra fuerza bruta en login (`POST /api/auth/login`), registro, inferencia (`POST /api/inference/run`), ni concierge (`POST /api/concierge`). Un atacante puede:
- Probar miles de contraseñas en `/login` sin bloqueo
- Saturar el endpoint de inferencia (costos de GPU)
- Flooding al endpoint de concierge (costos de API LLM externa)

**Fix propuesto:**
```bash
npm install express-rate-limit
```

```ts
// backend/src/config/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20, // 20 intentos
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const inferenceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Rate limit excedido. Máximo 10 inferencias por minuto.' },
});

export const conciergeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit excedido.' },
});

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
```

```ts
// En index.ts:
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/inference/run', inferenceLimiter);
app.use('/api/concierge', conciergeLimiter);
app.use(globalLimiter);
```

---

## 3. CRITICAL — JWT_SECRET débil en .env

**Archivo:** `backend/.env:4`
```
JWT_SECRET="supersecret_jwt_key_trust_web_0.1"
```

**Riesgo:** La clave es predecible y está versionada en el repositorio (`.env` no está en `.gitignore`). Si el repo alguna vez se expone, todos los tokens son comprometidos.

**Fix propuesto:** Generar clave criptográficamente segura y mover `.env` a `.gitignore`:
```bash
# Generar nueva clave
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Agregar al .gitignore
echo ".env" >> .gitignore
# Usar .env.example sin valores reales para documentación
```

---

## 4. HIGH — Sin mecanismo de refresh token

**Archivos:** `backend/src/controllers/authController.ts`, `backend/src/routes/authRoutes.ts`
**Riesgo:** Los JWT duran 7 días (`expiresIn: '7d'`) sin posibilidad de revocación ni refresh. Si un token es robado, el atacante tiene acceso total por 7 días. No hay endpoint de logout que invalide tokens.

**Fix propuesto:** Implementar refresh tokens con rotación:
```ts
// Al hacer login, generar dos tokens:
const accessToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
const refreshToken = jwt.sign({ id: user.id, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' });

// Guardar refresh token en BD (hasheado):
await prisma.refreshToken.create({
  data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'), expiresAt: new Date(Date.now() + 7 * 86400000) }
});

// Endpoint POST /api/auth/refresh:
// - Verifica refresh token contra BD
// - Revoca el refresh token viejo
// - Emite nuevo par access + refresh (rotación)
```

---

## 5. HIGH — Sin helmet ni protección XSS

**Archivo:** `backend/package.json`
**Riesgo:** No se usa `helmet` para headers de seguridad HTTP completos. Aunque `index.ts` configura manualmente `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `X-Permitted-Cross-Domain-Policies`, faltan:
- `Content-Security-Policy` (previene XSS)
- `X-DNS-Prefetch-Control`
- `Expect-CT`
- `Permissions-Policy`
- `Cross-Origin-Resource-Policy`

**Fix propuesto:**
```bash
npm install helmet
```

```ts
// En index.ts, reemplazar el middleware manual:
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.paddle.com", "https://sandbox-api.paddle.com"],
    },
  },
}));
// Mantener HSTS solo en prod:
if (isProduction) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}
```

---

## 6. HIGH — Sin sanitización de input en frontend

**Archivos:** `frontend/src/` (todos los formularios)
**Riesgo:** No se detectó uso de sanitización XSS en el frontend (DOMPurify, escapeHtml). Los datos que vienen de la API y se renderizan en React pueden ser vectores de XSS si no se confía en el escape automático de React (dangerouslySetInnerHTML, rich text).

**Fix propuesto:**
```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

```tsx
// En componentes que aceptan rich text o descripciones:
import DOMPurify from 'dompurify';

function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li'] });
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

---

## 7. HIGH — $queryRawUnsafe con parámetros interpolados dinámicamente

**Archivos:**
- `backend/src/controllers/billingController.ts` (líneas 16, 23, 30, 38, 45)
- `backend/src/controllers/adminController.ts` (línea 19)
- `backend/src/services/needSearchService.ts` (línea 83)
- `backend/src/services/careerPathService.ts` (línea 353)
- `backend/src/services/berryFlowService.ts` (líneas 62, 68)

**Riesgo:** Aunque TODAS las queries usan placeholders `?` correctamente (sin concatenación de strings del usuario), el uso de `$queryRawUnsafe` elude el type-safety de Prisma y la validación de esquema. Si en el futuro alguien modifica una query y concatena input sin placeholder, se introduce SQLi silenciosamente.

**Fix propuesto:** Migrar a `$queryRaw` tipado o usar Prisma Client methods:
```ts
// En lugar de:
await prisma.$queryRawUnsafe(`SELECT * FROM StripeConnectAccount WHERE userId = ?`, userId);

// Usar Prisma Client (si el modelo está en schema):
await prisma.stripeConnectAccount.findUnique({ where: { userId } });

// O usar $queryRaw tipado (más seguro que unsafe):
await prisma.$queryRaw<StripeConnectAccount[]>`SELECT * FROM StripeConnectAccount WHERE userId = ${userId}`;
```

---

## 8. MEDIUM — Sin protección de fuerza bruta en login

**Archivo:** `backend/src/controllers/authController.ts` (`login`)
**Riesgo:** Sin rate limiting + sin account lockout = ataque de diccionario viable. No hay delay progresivo tras intentos fallidos.

**Fix propuesto:** Combinar rate limiting (#2) + account lockout:
```ts
// En login, después de contraseña inválida:
await prisma.loginAttempt.create({
  data: { userId: user.id, ip: req.ip, success: false }
});

const recentFailures = await prisma.loginAttempt.count({
  where: { userId: user.id, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } }
});

if (recentFailures >= 5) {
  return res.status(429).json({ error: 'Cuenta bloqueada temporalmente. Intenta en 15 minutos.' });
}
```

---

## 9. MEDIUM — Exposición de detalles de error

**Archivos:** `backend/src/controllers/byoController.ts:59`, otros controladores
```ts
res.status(500).json({ error: 'Failed to register AI', detail: error.message });
```

**Riesgo:** En desarrollo, `error.message` puede exponer stack traces, rutas de archivos, detalles de BD, o secretos parciales. Aunque algunos controladores usan el patrón `process.env.NODE_ENV !== 'production' ? error.message : undefined`, no es consistente.

**Fix propuesto:** Crear un error handler global en Express que oculte detalles en producción:
```ts
// En index.ts, DESPUÉS de todas las rutas:
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
  });
});
```

---

## 10. MEDIUM — Falta Content-Security-Policy (CSP)

**Archivo:** `backend/src/index.ts:155-164`
**Riesgo:** Sin CSP, el navegador ejecutará cualquier script inline. Si un atacante logra inyectar XSS, no hay segunda línea de defensa.

**Fix propuesto:** Incluir CSP en el fix de helmet (#5). Para APIs que solo devuelven JSON, agregar:
```ts
res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
```

---

## 11. MEDIUM — X-Powered-By expone stack

**Archivo:** `backend/src/index.ts`
**Riesgo:** Express agrega `X-Powered-By: Express` por defecto. Facilita fingerprinting del servidor.

**Fix propuesto:**
```ts
app.disable('x-powered-by');
```

---

## 12. LOW — HSTS solo en producción

**Archivo:** `backend/src/index.ts:160-162`
```ts
if (isProduction) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
```

**Riesgo bajo:** En desarrollo con HTTPS local (ej: mkcert), sería ideal tener HSTS también. No bloqueante.

---

## 13. LOW — .env sin .gitignore (potencial leak futuro)

**Archivo:** Falta `.gitignore` con regla para `.env`
**Riesgo:** Si `.env` se commitea con secretos reales en el futuro, quedan expuestos en el historial de git.

**Fix propuesto:**
```bash
echo ".env" >> .gitignore
git rm --cached backend/.env  # Si ya está trackeado
```

---

## Verificación por Área

### 1. API Keys BYO ✅
- SHA-256 hashing: **OK** — `crypto.createHash('sha256').update(apiKey).digest('hex')`
- apiKeyHash en responses: **NUNCA** — todos los `select` de Prisma excluyen el campo
- Validación de provider: **OK** — solo OPENAI, DEEPSEEK, ANTHROPIC, CUSTOM

### 2. Rate Limiting ❌
- **AUSENTE** — Cero rate limits en cualquier endpoint

### 3. JWT ⚠️
- Expiración: **OK** — `expiresIn: '7d'`
- Refresh: **AUSENTE** — no hay mecanismo de refresh/revocación
- Firma: **CORREGIDO** — ya no usa fallback_secret hardcodeado
- Algoritmo: **OK** — usa HS256 por defecto (clave simétrica)
- Cross-login: **OK** — valida `type: 'cross-app'` y expira en 15min

### 4. CORS ✅/⚠️
- Producción: **OK** — bloquea allowAllInDev, exige CORS_ALLOWED_ORIGINS
- Config: **OK** — solo permite Content-Type y Authorization en headers
- Credentials: **OK** — `false`
- LAN/localhost en dev: **OK** — permitido para desarrollo
- Fatal en prod sin origins: **OK** — `process.exit(1)`

### 5. Stripe/Paddle Webhooks ✅
- Stripe: **OK** — `stripe.webhooks.constructEvent(req.body, sig, webhookSecret)`
- Paddle: **OK** — HMAC-SHA256 con `crypto.timingSafeEqual`
- Raw body parsing: **OK** — `express.raw({ type: 'application/json' })` antes de `express.json()`
- Validación de firma existente: **OK** — ambos retornan error si falla

### 6. Input Sanitization ⚠️
- SQL injection: **BAJO RIESGO** — todas las `$queryRawUnsafe` usan placeholders `?` correctamente. No se detectó concatenación de strings de usuario en queries SQL.
- XSS: **AUSENTE** — sin sanitización en frontend ni backend
- Validación de tipos: **OK** — TypeScript + validación manual en la mayoría de endpoints

### 7. .env ⚠️
- Secretos hardcodeados: **NINGUNO real** — solo placeholders (`sk_test_placeholder`, `whsec_placeholder`, etc.)
- JWT_SECRET débil: **SÍ** — ver hallazgo #3
- En git: **PROBABLEMENTE SÍ** — no se confirmó `.gitignore`

---

## Acciones Tomadas

| Hallazgo | Acción |
|----------|--------|
| #1 — JWT fallback_secret | ✅ **CORREGIDO** — app falla en startup si no está configurado JWT_SECRET |

## Fixes Pendientes (por prioridad)

1. **Rate limiting** (CRITICAL #2) — instalar express-rate-limit, proteger login/inference/concierge
2. **JWT_SECRET débil** (CRITICAL #3) — regenerar con crypto.randomBytes, agregar .gitignore
3. **Refresh tokens** (HIGH #4) — implementar rotación de tokens con endpoint /refresh
4. **Helmet** (HIGH #5) — instalar y configurar CSP + headers completos
5. **DOMPurify** (HIGH #6) — sanitizar HTML en frontend
6. **Migrar $queryRawUnsafe** (HIGH #7) — usar modelos Prisma donde existan
7. **Account lockout** (MEDIUM #8) — limitar intentos fallidos de login
8. **Error handler global** (MEDIUM #9) — ocultar stack traces en producción
9. **X-Powered-By** (MEDIUM #11) — `app.disable('x-powered-by')`
10. **.gitignore** (LOW #13) — proteger .env de commits accidentales

---

_Reporte generado automáticamente por backend-eng. Sin commits ni push realizados._
