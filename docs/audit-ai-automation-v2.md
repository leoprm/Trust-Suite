# Audit: AI & Automation → Trust Lite v2

**Fecha:** 2026-05-12
**Auditor:** owl-alpha-2
**Archivos revisados:** `backend/src/controllers/`, `services/`, `cron/`, `routes/`, `middleware/`, `prisma/schema.prisma`, `scripts/seed-ai-council.ts`

---

## Tabla de Decisiones

| # | Feature | Decisión | Justificación |
|---|---------|----------|---------------|
| 1 | **Hermes Bridge** (Task Matcher + AI Executor + AI Reputation + Protocolo Asimov) | **QUEDA — ampliar** | El núcleo de v2. Las IAs ganan XP completando tasks. Task Matcher por skill overlap funciona. Lo que falta: que las IAs no sean solo perfiles Hermes estáticos, sino modelos entrenables que mejoran con cada task completada. H1-H5 debe ser el backbone, no cambia. |
| 2 | **Hermes Concierge** (NL chat → crear árboles/needs/ramas) | **QUEDA — simplificar** | Útil para onboarding, especialmente para usuarios no técnicos. Pero el sistema actual de tutorial con fases (creator_intro → creator_financing → creator_configure) es demasiado rígido. Para v2: mantener el chat NL simple, eliminar el wizard de fases, dejar que Hermes Agent responda directamente con `tool_choice: 'none'` y que el frontend maneje los action buttons. |
| 3 | **AI Council Trees** (parlamento de IAs, votación 1-10, Moltbook, audit reports) | **ARCHIVAR** | Demasiado complejo para v2. La idea de IAs votando importancia 1-10 sobre necesidades del ecosistema es interesante pero: (a) duplica el sistema de gobernanza humano (Need → Idea → Vote → Podium); (b) el cron que lee memorias de perfiles Hermes y llama a Moltbook es frágil (depende de API keys externas, parsing JSON de LLM, falla silenciosamente); (c) el seed-ai-council.ts pesa 277 líneas para un feature que esencialmente es un ranking automático. En v2, las IAs compiten por tasks, no votan en un parlamento separado. Si se necesita priorización, que sea el sistema de SkillInfluence + necesidad urgente el que priorice. |
| 4 | **AIMemberConfig** (autonomyLevel, maxConcurrentTasks, autoClaimEnabled, allowedPhases, skillOverrides, aiFailCount) | **QUEDA — simplificar** | Necesario para dueños de IAs. Pero autonomyLevel L1/L2/L3 es prematuro: hoy solo L2 funciona (autoClaim + review). Para v2: colapsar a un solo booleano `autoClaimEnabled`. maxConcurrentTasks se queda. allowedPhases se queda. skillOverrides se queda. Eliminar autonomyLevel y aiFailCount/aiRateLimitedUntil — el rate-limiting lo maneja el sistema de billing (créditos/tokens), no un contador de fallos arbitrario. |
| 5 | **Cron jobs** (aiDailyInteractionCron, aiCouncilAuditCron) | **ELIMINAR** | aiDailyInteractionCron: 384 líneas de código que leen memorias de perfiles, llaman a Hermes Agent con JSON estructurado, parsean la respuesta, crean tasks/needs/votos, y recalculan scores. Es un Rube Goldberg machine. El resultado neto es que las IAs "piensan" diariamente y proponen cosas — pero en v2 las IAs ya están activas 24/7 compitiendo por tasks. aiCouncilAuditCron: solo genera reportes para AI_COUNCIL trees, que estamos archivando. Ambos se van. |
| 6 | **Kanban integration** (dispatcher → hermes kanban create) | **QUEDA — necesita cambios** | El AI Executor hace `execSync('hermes kanban create ...')` — esto funciona hoy pero es síncrono y bloquea el event loop de Express. Para v2: (a) cambiar a `spawn` async o usar la API interna de Hermes; (b) si las IAs corren como modelos locales (GGUF), el dispatch no debería ser via Kanban CLI sino via un worker queue (BullMQ o similar) que levante el proceso de inferencia; (c) la interfaz `AiExecution` debe registrar el modelo usado y la sesión de fine-tuning. |

---

## Arquitectura Propuesta para v2

### 1. Modelos Open-Source Descargables

**Formato:** GGUF (via llama.cpp)
**Distribución:** HuggingFace Hub como repositorio oficial de modelos Trust Suite

```
Arquitectura de Modelos:
┌─────────────────────────────────────────────┐
│  Trust Suite Model Registry                 │
│  huggingface.co/trustsuite/                 │
│                                             │
│  trust-lite-v2-base.Q4_K_M.gguf (base)     │
│  trust-lite-v2-coding.Q4_K_M.gguf (code)   │
│  trust-lite-v2-design.Q4_K_M.gguf (design) │
│  ...                                        │
│                                             │
│  Cada modelo tiene un config.json con:      │
│  - skills declarados                        │
│  - prompt template                          │
│  - context length                           │
│  - hardware requerido (RAM/VRAM)            │
└─────────────────────────────────────────────┘
```

**Descarga:** El dueño de una IA elige un modelo base desde el UI. El backend descarga el GGUF via `huggingface_hub` Python SDK (o huggingface-hub CLI) y lo almacena en `/home/leo/.trustsuite/models/<treeId>/<aiId>/`.

**Inferencia local:** llama.cpp server mode con `--port` dinámico. Una instancia por IA activa, con cola de requests. Si el dueño no tiene hardware, se cae a cloud inference (ver sección 3).

**Tecnologías:**
- `llama-cpp-python` (server mode, OpenAI-compatible API)
- `huggingface-hub` (descarga)
- Docker opcional para aislamiento

### 2. Fine-Tuning al Completar Tasks

**Framework:** Unsloth (fine-tuning eficiente con LoRA/QLoRA, 2-5x más rápido, menos VRAM)

```
Pipeline de Fine-Tuning:
┌──────────────────────────────────────────────────────┐
│  Task completada → Deliverable aceptado              │
│         ↓                                            │
│  Se acumulan ejemplos en un buffer por IA            │
│  (task.description → deliverable.output)             │
│         ↓                                            │
│  Cada N tasks completadas (configurable, default 10) │
│  → Se dispara fine-tuning session                    │
│         ↓                                            │
│  Unsloth QLoRA fine-tune sobre el GGUF base          │
│  → checkpoint LoRA mergeado → nuevo GGUF             │
│         ↓                                            │
│  El modelo mejorado reemplaza al anterior            │
│  → La IA "sube de nivel" no solo en XP,              │
│     sino en capacidad real                            │
└──────────────────────────────────────────────────────┘
```

**Dataset por IA:** Cada IA acumula pares `(prompt, completion)` de las tasks que completa exitosamente. El dataset se almacena en formato ShareGPT/JSONL. Esto hace que cada IA se especialice en lo que hace bien.

**Métricas de fine-tuning rastreadas:**
- Loss antes/después
- Win rate en tasks similares (A/B test con modelo anterior)
- XP gain post-fine-tune

**Schedule:** Fine-tuning corre en background, no bloquea la operación normal. Se usa `unsloth` con `max_steps=200` para ciclos rápidos (5-15 min en GPU).

### 3. API Keys + Billing

**Modelo de negocio propuesto:**

| Tier | Costo | Qué incluye |
|------|-------|------------|
| **Free** | $0 | 1 IA local (GGUF en tu hardware), max 5 tasks/día |
| **Pro** | $15/mes | 3 IAs locales, fine-tuning cada 10 tasks, acceso a modelos base premium |
| **Cloud** | $30/mes | 3 IAs en cloud (sin hardware local), fine-tuning, prioridad en cola |

**Implementación técnica:**
```
/api/ai/keys          → CRUD de API keys (un usuario puede tener varias)
/api/ai/usage         → Cuota consumida este mes (tasks, tokens, fine-tune sessions)
/api/ai/billing       → Integración con MercadoPago/Khipu (Chile)
```

**API Key flow:**
1. Usuario compra suscripción → se genera API key
2. API key se asocia a `AIMemberConfig.apiKey` (nuevo campo)
3. Cada vez que una IA ejecuta una task, se descuenta del crédito mensual
4. Límites: maxTasksPerDay, maxFineTunesPerMonth, tokenQuota

**Rate limiting por API key**, no por contador de fallos. Si se acaban los créditos, la IA pasa a `SUSPENDED_BY_QUOTA`.

### 4. Diagrama de Componentes v2

```
┌──────────────────────────────────────────────────────────────────┐
│                        TRUST LITE v2                              │
│                                                                   │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │ Concierge   │   │ Task Matcher │   │ AI Executor (v2)     │  │
│  │ (NL chat)   │   │ (skill match)│   │                      │  │
│  │             │   │              │   │  ┌────────────────┐  │  │
│  │ Hermes API  │   │ cron 5min    │   │  │ llama.cpp      │  │  │
│  │ tool_choice │   │              │   │  │ server (local) │  │  │
│  │ = none      │   │              │   │  │ :8081-8099     │  │  │
│  └─────────────┘   └──────────────┘   │  └────────────────┘  │  │
│                                        │  ┌────────────────┐  │  │
│  ┌─────────────┐   ┌──────────────┐   │  │ Cloud Fallback │  │  │
│  │ Billing     │   │ Unsloth      │   │  │ (Groq/DeepSeek)│  │  │
│  │ API keys    │   │ Fine-tune    │   │  └────────────────┘  │  │
│  │ quotas      │   │ pipeline     │   └──────────────────────┘  │
│  └─────────────┘   └──────────────┘                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ HuggingFace Hub: trustsuite/ (modelos GGUF oficiales)       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Cambios para v2

### Eliminar (código a borrar)
- `backend/src/controllers/aiCouncilController.ts` (407 líneas)
- `backend/src/routes/aiCouncilRoutes.ts`
- `backend/src/cron/aiCouncilAuditCron.ts`
- `backend/src/cron/aiDailyInteractionCron.ts` (384 líneas)
- `backend/src/scripts/seed-ai-council.ts` (277 líneas)
- Modelo `NeedImportanceVote` del schema Prisma
- Campo `treeType = AI_COUNCIL` del enum TreeType
- Campo `importanceScore` de Need (si solo lo usa AI Council)
- Referencias a Moltbook API key

### Simplificar (refactor)
- `AIMemberConfig`: eliminar `autonomyLevel` → un solo booleano `autoClaimEnabled`
- `AIMemberConfig`: eliminar `aiFailCount`, `aiLastFailedAt`, `aiRateLimitedUntil` → reemplazar con `quotaUsed`, `quotaLimit`, `apiKey`
- `Concierge`: eliminar wizard de fases (TutorialPhase), mantener chat NL simple

### Agregar (nuevo)
- `AIMemberConfig.modelPath` → ruta al GGUF descargado
- `AIMemberConfig.modelRepo` → huggingface repo (e.g., "trustsuite/trust-lite-v2-coding")
- `AIMemberConfig.apiKey` → API key para billing
- `AIMemberConfig.quotaUsed` / `quotaLimit` → tracking de uso
- Tabla `FineTuneSession`: id, aiMemberId, baseModel, loraPath, metrics, status
- Tabla `TrainingExample`: aiMemberId, taskId, prompt, completion, addedAt
- `backend/src/services/modelRegistry.ts` → descarga de GGUF, health check
- `backend/src/services/inferenceQueue.ts` → cola de requests a llama.cpp servers
- `backend/src/services/fineTunePipeline.ts` → Unsloth fine-tuning automation
- `backend/src/routes/billingRoutes.ts` → API keys, uso, suscripciones
- `backend/src/cron/fineTuneCron.ts` → dispara fine-tuning cuando buffer lleno

---

## Riesgos Identificados

1. **Hardware local:** No todos los dueños de IAs tienen GPU. Cloud fallback es esencial.
2. **Fine-tuning cost:** Unsloth QLoRA es eficiente pero igual consume GPU. ¿Quién paga el cómputo del fine-tune? → incluido en tier Cloud, en Local usa la GPU del usuario.
3. **Model staleness:** Si una IA nunca completa tasks, nunca se fine-tunea → OK, el modelo base ya es funcional.
4. **Seguridad del modelo:** Un GGUF descargable es un archivo binario. ¿Qué evita que alguien distribuya un modelo con malware? → firmar modelos con HMAC/SHA256 checksum desde HuggingFace.
