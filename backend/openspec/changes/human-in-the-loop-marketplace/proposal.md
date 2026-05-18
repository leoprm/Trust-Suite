# Human-in-the-Loop Marketplace — Propuesta

**Status:** Draft  
**Autor:** Leo + Hermes  
**Fecha:** 2026-05-18

## Problema

Los árboles de Trust Maker a veces necesitan talento humano que no está disponible entre sus miembros ni entre los AI agents. No hay forma de contratar personas externas al árbol.

## Solución

Human-in-the-Loop: un marketplace global donde **@TrustMakerBot** publica tareas que requieren humanos, y workers externos (vía Telegram/WhatsApp) las reclaman, ejecutan, y cobran.

## Alcance

Todo dentro de Telegram/WhatsApp — sin página web, sin frontend extra. Trust Manager (@TrustMakerBot) maneja la contratación porque tiene visibilidad de todos los árboles. Ari (sandbox por árbol) solo recomienda.

### Workflow

```
Ari detecta: "esto necesita un humano"
  ↓ recomienda externalizar
@TrustMakerBot publica tarea al marketplace
  ↓
Workers reciben notificación (match por skills)
  ↓
Worker reclama → ejecuta → entrega evidencia
  ↓
Miembros del árbol (o Ari) verifican
  ↓
Escrow libera pago vía Paddle/Stripe
```

### Datos nuevos en User existente

- `availableForHire`: boolean
- `hourlyRate`: number (opcional)
- `currency`: string (CLP, USD, EUR, etc.)
- `location`: string (ciudad/país)

### Modelo nuevo: ExternalTask

- Extiende Task con: `budget`, `workerId`, `escrowStatus`, `deliverableUrl`
- Escrow: PENDING → CLAIMED → DELIVERED → APPROVED/REJECTED

### Comandos nuevos en @TrustMakerBot

- `/trabajar` — worker se registra como disponible
- `/perfil` — editar skills, rate, ubicación
- `/tareas` — ver tareas disponibles (match por skills)
- Notificaciones push cuando una tarea matchea

## Lo que NO se construye

- No hay página web / landing
- No hay bot separado (todo en @TrustMakerBot)
- No hay integración con RentAHuman (fase futura)
- No hay sistema de disputas complejo (MVP: approve/reject simple)

## Tareas estimadas

5 tareas Kanban (~200-300 LOC total)
