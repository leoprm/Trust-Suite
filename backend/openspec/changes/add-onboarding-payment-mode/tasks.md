# Tasks — Add Onboarding Payment Mode

- [ ] **A: i18n strings** — Agregar `payment_mode_question`, `payment_mode_centralized`, `payment_mode_individual`, `payment_mode_selected` en `locales/{es,en}/onboarding.json`
- [ ] **B: Step 3 handler** — Insertar step 3 en `handleOnboardingResponse()`: inline buttons [Centralizado] [Individual], guardar `Tree.paymentMode`, transicionar a next step según subárbol + modo
- [ ] **C: Callback handler** — Agregar `onboarding:payment_centralized` / `onboarding:payment_individual` en callback handler
- [ ] **D: Renumber steps** — Step 3→4 (código padre), step 4→5 (WhatsApp) en `handleOnboardingResponse()`, callbacks subtree, y cualquier referencia a `onboardingStep === 3` o `=== 4`
- [ ] **E: Centralized invoice** — Si paymentMode=CENTRALIZED, enviar `sendInvoice` al creador (onboardingInviterId) vía Stripe; guardar `sponsorId`
