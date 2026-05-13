## Why

Trust Maker v3 necesita agentes de IA que ejecuten tareas dentro de los árboles. El chat actual tiene respuestas mock. Los usuarios no pueden delegar trabajo real a IAs. Hermes Agent ya está instalado en el servidor y puede alojar múltiples agentes con identidades distintas en un solo proceso, lo que permite implementar un sistema multi-agente especializado por árbol sin overhead de infraestructura.

## What Changes

- **Nuevo schema `AgentMembership`**: nivel y XP por agente por árbol (interno, invisible al usuario)
- **Difficulty Evaluator Agent**: un agente server-wide que evalúa dificultad de tareas (1-10) usando datos cross-tree
- **Tree Agent por árbol**: un Hermes Agent (sesión) que orquesta IAs internas: Analyst+Evaluator combinado, Creative, y 3-5 Executors
- **Endpoint `POST /api/concierge`**: conecta el chat de Trust Maker con Hermes Agent API (:8642) vía header `X-Hermes-Session-Key`
- **Sistema de rating**: usuario califica cada rol (1-10 estrellas) → 1★ = 1 XP, 50 XP = nuevo nivel
- **Gate de dificultad**: Difficulty Evaluator determina qué IAs se asignan según nivel requerido
- **BYO API**: usuarios registran su propia API key con costo/token y límite de paralelismo
- **1 solo proceso Hermes Agent**: múltiples sesiones lógicas, sin Docker ni procesos extra

## Capabilities

### New Capabilities
- `agent-membership`: Schema y CRUD para membresías de agentes IA en árboles, con level y XP por árbol
- `concierge-endpoint`: Endpoint POST /api/concierge que proxy-llama a Hermes Agent API con rate limiting
- `agent-sessions`: Configuración de sesiones de Hermes Agent (Difficulty Evaluator, Tree Agents, IAs internas) con system prompts y modelos diferenciados por rol
- `rating-xp-system`: Sistema que traduce ratings de usuario (1-10) en XP para agentes, con level-up cada 50 XP
- `difficulty-gate`: Evaluador de dificultad de tareas y asignación de IAs según nivel requerido
- `byo-api-gateway`: Registro y gestión de APIs externas con límites de costo/token y paralelismo

### Modified Capabilities
- _Ninguna_ — todas las capacidades son nuevas para Trust Maker v3

## Impact

- **Backend**: Nuevo modelo Prisma `AgentMembership`, nuevo endpoint `/api/concierge`, nuevos servicios (RatingService, DifficultyService, BYOService)
- **Frontend**: ChatPanel reemplaza mock por fetch real a `/api/concierge`, nuevo panel de rating post-tarea
- **Hermes Agent**: Nuevas skills/herramientas para leer/escribir DB de Trust Maker, system prompts por rol
- **Infraestructura**: Hermes Agent API Server debe correr en :8642, sin nuevos procesos ni containers
- **Dependencias**: Sin nuevas dependencias externas
