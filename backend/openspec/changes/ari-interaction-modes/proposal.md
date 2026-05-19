# Ari Interaction Modes

## Problem

Ari actualmente responde con **interacción máxima**: cuando la tagean, la nombran, le hacen reply, o cuando el LLM decide que puede aportar (`shouldAriRespond` + conversation window). No hay forma de reducir su nivel de participación sin modificar código.

## Solution

Tres niveles configurables por árbol, controlados por el Bridge:

| Nivel | @tag | Reply | Nombrada | Conv Window | shouldAriRespond |
|-------|------|-------|----------|-------------|-------------------|
| **MAXIMUM** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MEDIUM** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **MINIMUM** | ✅ | ✅ | ❌ | ❌ | ❌ |

- **MAXIMUM** = comportamiento actual (default)
- **MEDIUM** = solo interacción directa (tag, reply, nombre), sin inferencia
- **MINIMUM** = solo cuando la invocan explícitamente (tag o reply)

## Components

1. Schema: `Tree.interactionMode` enum
2. Handler: gate en `bot/index.ts` según `tree.interactionMode`
3. Comando: `/modo <maxima|media|minima>` para admin
4. System prompt: informar a Ari del modo actual
5. E2E test

## Estimated tasks

5 Kanban tasks, ~150 LOC.
