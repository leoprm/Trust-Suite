# Design: @TrustManagerBot

## Arquitectura

```
┌──────────────────────────────────────┐
│           Telegram Platform          │
│  ┌──────────┐    ┌───────────────┐   │
│  │ @Trust   │    │ @TrustManager │   │
│  │ MakerBot │    │ Bot           │   │
│  │  (Ari)   │    │ (Soporte)     │   │
│  └────┬─────┘    └──────┬────────┘   │
│       │                 │            │
└───────┼─────────────────┼────────────┘
        │                 │
┌───────┴─────────────────┴────────────┐
│         TrustMaker Backend :3100     │
│                                      │
│  ┌────────────────────────────┐      │
│  │  src/bot/trustManagerBot.ts│      │
│  │  - /start <treeId>        │      │
│  │  - onboarding flow        │      │
│  │  - inline menu            │      │
│  │  - support chat (Hermes)  │      │
│  └────────────────────────────┘      │
│  ┌────────────────────────────┐      │
│  │  src/services/             │      │
│  │  supportSessionService.ts  │      │
│  │  - turn counter (20/mo)    │      │
│  └────────────────────────────┘      │
│  ┌────────────────────────────┐      │
│  │  Hermes Agent (readonly)   │      │
│  │  - sin tools de escritura  │      │
│  │  - sin skill_manage        │      │
│  │  - sin terminal            │      │
│  └────────────────────────────┘      │
└──────────────────────────────────────┘
```

## Flujo: Onboarding vía deep-link
1. Ari en grupo: "¿Quieres participar? [Participar](t.me/TrustManagerBot?start=<treeId>)"
2. Usuario presiona link → Telegram abre @TrustManagerBot con `/start <treeId>`
3. TrustManager verifica árbol → muestra términos
4. Usuario acepta → método de pago → "Por ahora no" → registrado
5. "Habla con @TrustManagerBot para cualquier duda"

## Flujo: Soporte conversacional
1. Usuario: "📞 Hablar con TrustManager"
2. Bot: "Escribe tu consulta (te quedan 18 turnos este mes)"
3. Usuario: "¿Cómo cambio mi método de pago?"
4. Bot → Hermes Agent (readonly, sin tools de escritura)
5. Hermes responde → se envía al usuario
6. turnosRestantes--
