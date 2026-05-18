# Tasks: @TrustManagerBot

- [ ] **T1 — Instancia del bot y handler /start** (30 min)
  Crear `src/bot/trustManagerBot.ts`:
  - Inicializar bot con `TRUST_MANAGER_BOT_TOKEN` de .env
  - Handler `/start <treeId>`: verificar árbol, iniciar onboarding
  - Menú inline principal con 4 opciones
  - Agregar en `src/index.ts`: inicializar trustManagerBot si el token existe

- [ ] **T2 — Flujo de onboarding** (45 min)
  En `trustManagerBot.ts`:
  - Paso 1: mostrar términos legales con botones Aceptar/Rechazar
  - Paso 2: selección de método de pago (Stripe, Paddle, "Por ahora no")
  - Paso 3: confirmación y registro como TreeMember en la DB
  - Link de invitación desde Ari: `t.me/TrustManagerBot?start=<treeId>`

- [ ] **T3 — Términos legales** (15 min)
  Crear `src/bot/menus/terms.md`:
  - Texto legal base de Trust Maker
  - Variable `<treeName>` para personalizar

- [ ] **T4 — Menú de opciones pre-escritas** (20 min)
  En `trustManagerBot.ts`:
  - 📋 Ver mis árboles (consulta DB)
  - 💳 Gestionar método de pago (placeholder)
  - ❓ Preguntas frecuentes (carga desde faq.md)
  - 📞 Hablar con TrustManager (inicia modo conversacional)

- [ ] **T5 — Modo conversacional con límite 20 turnos/mes** (45 min)
  Crear `src/services/supportSessionService.ts`:
  - Contador por userId: `{ turnsUsed, month }`
  - Guardar en `data/supportSessions.json`
  - Reset automático al cambiar de mes
  - Sin límite diario

- [ ] **T6 — Integración con Hermes Agent readonly** (30 min)
  En `trustManagerBot.ts`:
  - Handler de mensajes en modo conversacional
  - Llamar a Hermes Agent con system prompt restrictivo:
    "Eres TrustManager, soporte de Trust Maker. NO tienes acceso al servidor. Solo respondes preguntas sobre la plataforma."
  - Tools deshabilitados: terminal, skill_manage, file write, sandbox

- [ ] **T7 — Link de invitación desde Ari** (15 min)
  Modificar buildSystemPrompt en `hermesBridge.ts`:
  - Agregar: "Cuando un usuario pregunte cómo unirse, comparte: t.me/TrustManagerBot?start=<treeId>"
  - Ari NO maneja registro — solo deriva al TrustManagerBot

- [ ] **T8 — FAQ markdown** (10 min)
  Crear `src/bot/menus/faq.md`:
  - ¿Cómo cambio mi método de pago?
  - ¿Cómo invito a alguien a mi árbol?
  - ¿Cómo reporto un problema?
  - ¿Cuánto cuesta Trust Maker?
  - ¿Qué son los puntos diarios?
