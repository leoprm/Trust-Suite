# Decisiones de Diseño

## 1. Tasks como entidad separada de Needs

**Decisión**: Nueva entidad `Task` vinculada a `Need`, no reutilizar el modelo existente.

**Por qué**: Las tasks actuales son para AI agents. Las tasks humanas tienen presupuesto, evidencia, disputas — un lifecycle distinto. Mantenerlas separadas evita contaminar el pipeline de AI.

## 1.5. Tasks creadas por conversación natural

**Decisión**: El método principal para crear tasks es lenguaje natural con @TrustMakerBot, no comandos rígidos.

**Por qué**: Reduce fricción. Decir "@TrustMakerBot necesito que alguien rediseñe el hero, 15 lucas" es más natural que recordar sintaxis de comandos.

**Implementación**: El mensaje se envía al concierge (Hermes Agent), que extrae: título, descripción, presupuesto, necesidad relacionada. Si falta algún campo, el bot pregunta.

## 2. Skills matcheadas con existentes, no inferencia libre

**Decisión**: Al verificar una task, el bot primero revisa las skills que el usuario YA tiene. Si la task calza con una → suma XP ahí. Si no calza con ninguna → crea UNA nueva skill.

**Por qué**: Evita listas interminables de skills por usuario. Principio Trust DNA: "XP se gana con trabajo verificado". Un usuario que hace 50 tasks de frontend debe tener `frontend: 500`, no 50 skills distintas.

**Implementación**: 
- 10 categorías predefinidas: design, frontend, backend, data, ops, writing, research, coordination, marketing, finance
- Al verificar task, se extraen keywords del título + descripción
- Se comparan contra las skills existentes del usuario
- Si hay match semántico → XP a esa skill
- Si no → se crea una nueva (máx ~8-10 skills por usuario)

## 3. Votación para disputas, no arbitraje central

**Decisión**: Las disputas se resuelven por votación del árbol, no por un admin o el sistema.

**Por qué**: Consistente con el modelo de gobernanza Trust. El árbol es soberano.

**Quórum**: 30% de miembros activos. Mayoría simple. Si no hay quórum en 48h, la evidencia se considera ACEPTADA por default.

## 4. Cuota dinámica anclada a Paddle/Stripe existente

**Decisión**: No construir un sistema de pagos nuevo. Usar Paddle/Stripe ya integrados.

**Flujo**: 
- El creador del árbol configura presupuesto mensual base (suscripción Paddle)
- Las tasks con presupuesto se suman a la cuota del mes siguiente
- TrustMaker cobra automáticamente vía Paddle/Stripe
- Los pagos de tasks se hacen manualmente (transferencia) por ahora — automatizar en fase futura

## 5. Período de gracia obligatorio

**Decisión**: 7 días de gracia para todo miembro nuevo. No se puede desactivar.

**Por qué**: Reduce fricción de adopción. Si el primer mensaje es "paga para hablar", la gente se va.

## 6. Árboles privados por defecto

**Decisión**: `admissionPolicy: CLOSED` para nuevos árboles. Solo invitación explícita.

**Por qué**: Seguridad y privacidad. Un grupo de Telegram ≠ comunidad pública. Cada árbol decide a quién deja entrar.

## 7. Bot como notario, no como juez

**Decisión**: El bot almacena y cataloga evidencias, pero no decide si son válidas.

**Por qué**: La validación es humana (votación). El bot es el repositorio confiable, no la autoridad.

## 8. TaskRouter unificado para humanos + AI

**Decisión**: Extender el TaskRouter existente (AI-only) para incluir humanos.

**Implementación**: 
- Query unificada: `SELECT miembros con skills relevantes, ordenados por XP`
- AI agents incluidos en la query si `user.isAI = true`
- Prioridad: humanos primero si hay disponibilidad, AI como fallback
