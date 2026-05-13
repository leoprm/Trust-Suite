## Context

Trust Maker v3 tiene un chat mock que no ejecuta trabajo real. Hermes Agent está instalado en el servidor y expone un API server OpenAI-compatible en `:8642` que soporta múltiples sesiones lógicas vía header `X-Hermes-Session-Key`. Cada sesión puede tener su propio system prompt, personalidad y herramientas. Esto permite alojar N agentes especializados en un solo proceso Python.

El usuario final interactúa con Trust Maker vía chat. El backend debe proxy-llamar a Hermes Agent para que los agentes IA ejecuten tareas reales: analizar necesidades, proponer ideas, generar output.

## Goals / Non-Goals

**Goals:**
- Conectar el chat de Trust Maker con Hermes Agent API vía endpoint `/api/concierge`
- Implementar schema `AgentMembership` con level/XP por agente por árbol
- Configurar sesiones de Hermes Agent: 1 Difficulty Evaluator + N Tree Agents con IAs internas
- Sistema de rating post-tarea: usuario califica roles (1-10), backend traduce a XP
- Gate de dificultad: Difficulty Evaluator determina qué IAs ejecutan según nivel
- BYO API: registro de APIs externas con límites de paralelismo y costo
- Todo en 1 solo proceso de Hermes Agent, sin Docker ni procesos extra

**Non-Goals:**
- Master Agent (diferido para fase futura)
- Competencia entre IAs por tareas (futuro)
- UI de administración de agentes (solo API por ahora)
- Fine-tuning de modelos (fuera de alcance)

## Decisions

### 1. Hermes Agent como runtime, Trust Maker como orquestador

**Decisión:** Trust Maker backend maneja la lógica de negocio (schema, auth, rating, asignación). Hermes Agent solo ejecuta inferencia de LLM.

**Alternativa considerada:** Hermes Agent maneja toda la lógica. Descartado porque:
- Trust Maker ya tiene la DB, auth, y endpoints
- Separación clara: datos en Trust Maker, inteligencia en Hermes Agent
- Si cambiamos de runtime de IA, solo cambia la capa de Hermes Agent

### 2. Una sesión por agente lógico, no por LLM call

**Decisión:** Cada IA (Difficulty Evaluator, Tree Agent, Analyst, Creative, Executor) es una sesión persistente de Hermes Agent con su propio system prompt, identificada por `X-Hermes-Session-Key`.

**Alternativa considerada:** Una sesión única que cambia de system prompt según contexto. Descartado porque:
- El historial de conversación se mezclaría entre roles
- La memoria de un rol contaminaría a otro
- Más simple auditar y debugear sesiones separadas

### 3. XP directo (1:1) sin fórmula compleja

**Decisión:** 1 estrella = 1 XP. 50 XP = nuevo nivel.

**Alternativa considerada:** Fórmula logarítmica o con pesos. Descartado porque:
- Transparencia: el sistema es auditable
- Sin sorpresas: el usuario sabe que 7 estrellas = 7 XP
- La complejidad está en el gate de dificultad, no en la fórmula de XP

### 4. Analyst + Evaluator combinados

**Decisión:** Una sola IA hace ambos roles, con distinto prompt según el momento (análisis vs evaluación).

**Alternativa considerada:** Dos IAs separadas. Descartado porque:
- Comparten la misma habilidad base (entender profundamente)
- Menos sesiones = menos overhead
- El rating del usuario evalúa ambos aspectos por separado de todas formas

### 5. BYO API con backpressure automático

**Decisión:** El sistema trackea requests en curso por API externa y aplica backpressure cuando se alcanza `maxParallel`. Si hay errores 429, reduce temporalmente el límite.

**Alternativa considerada:** Rate limiting fijo sin adaptación. Descartado porque:
- Las APIs externas tienen límites variables
- Sin adaptación, un pico de uso puede saturar la API del usuario
- El backpressure automático protege al usuario sin intervención manual

## Risks / Trade-offs

- **[Riesgo] Latencia:** Cada request al chat → backend → Hermes Agent → LLM provider. ~3-5s mínimo.
  → **Mitigación:** Mostrar indicador de "escribiendo..." en el chat, timeout de 30s.

- **[Riesgo] Sesiones huérfanas:** Si el backend se reinicia, las sesiones de Hermes Agent quedan sin referencias.
  → **Mitigación:** Las sesiones son stateless (Hermes Agent no guarda estado crítico). El backend reconstruye el contexto desde la DB.

- **[Riesgo] Costo de LLM:** Múltiples agentes haciendo inference simultánea puede ser caro.
  → **Mitigación:** Modelos baratos para roles no críticos (DeepSeek). Solo Executors usan modelos potentes. BYO API traslada costo al usuario.

- **[Trade-off] 1 proceso vs N procesos:** Un solo proceso de Hermes Agent es más eficiente pero si crashea, todos los árboles se quedan sin agente.
  → **Aceptado:** La simplicidad operativa pesa más que el riesgo. Reinicio automático con systemd.

## Open Questions

- ¿Cuántos Executors por árbol es el default? Decisión pendiente: 3 para empezar.
- ¿El Difficulty Evaluator necesita acceso a la DB completa o solo a un resumen de ratings históricos?
- ¿Las sesiones de Hermes Agent se crean bajo demanda o se pre-inicializan al levantar el servidor?
