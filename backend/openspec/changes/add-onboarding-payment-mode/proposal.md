# Add Onboarding Payment Mode (Step 3)

## Why
El onboarding actual llega hasta WhatsApp sin definir quién paga. Insertamos la selección de modo de pago (centralizado vs individual) como paso 3, entre sub-árbol y el resto.

## What
- **Step 3**: inline buttons [Centralizado] [Individual]
- Centralizado: guarda `paymentMode=CENTRALIZED`, invoice al creador
- Individual: guarda `paymentMode=INDIVIDUAL`, invoice por miembro al unirse
- Renumerar: step 3→4 (código padre), step 4→5 (WhatsApp)

## Files
| File | Change |
|------|--------|
| `src/bot/index.ts` | Insert step 3 handler + callbacks; renumber 3→4, 4→5 |
| `locales/es/onboarding.json` | `payment_mode_*` strings |
| `locales/en/onboarding.json` | `payment_mode_*` strings |

## Flow
```
Step 2 callback → payment mode (inline)
  [Centralizado] → save → sponsor invoice
  [Individual]   → save → next step
→ subtree_yes → parent code (step 4)
→ subtree_no  → WhatsApp (step 5)
```

## Risks
- Step renumbering en todas las referencias
- Bot necesita Stripe configurado con @BotFather
- Individual: invoice diferido (otro change)
