## 1. Schema & Database

- [ ] 1.1 Crear modelo AgentMembership en schema.prisma (agentId, treeId, level, xp, status, role, timestamps)
- [ ] 1.2 Migración de DB y regenerar Prisma client
- [ ] 1.3 Seed demo v3 actualizado: 2 agentes con membresías en TechMakers y SaludDigital, niveles 1-5

## 2. Agent Sessions (Hermes Agent)

- [ ] 2.1 Crear system prompts para Difficulty Evaluator, Tree Agent, Analyst+Evaluator, Creative, Executor
- [ ] 2.2 Crear skill de Hermes Agent (tools.py) para leer/escribir DB de Trust Maker (needs, ideas, trees)
- [ ] 2.3 Script de inicialización de sesiones al levantar servidor

## 3. Concierge Endpoint

- [ ] 3.1 Crear endpoint POST /api/concierge con rate limiting (30 req/min)
- [ ] 3.2 Implementar proxy a Hermes Agent API (:8642/v1/chat/completions) con X-Hermes-Session-Key
- [ ] 3.3 Manejo de timeouts (30s) y errores (retry, fallback)

## 4. Rating & XP System

- [ ] 4.1 Endpoint POST /api/ratings para registrar rating de usuario (1-10 por rol)
- [ ] 4.2 Service RatingService: traduce rating → XP, calcula level-up (cada 50 XP)
- [ ] 4.3 Actualizar AgentMembership con nuevos XP/level post-rating

## 5. Difficulty Evaluator & Gate

- [ ] 5.1 Service DifficultyService: consulta al Difficulty Evaluator Agent vía concierge
- [ ] 5.2 Service AssignmentGate: asigna IAs según dificultad de tarea (1-3→cualquiera, 4-6→≥3, 7-8→≥5, 9-10→≥7)
- [ ] 5.3 Integrar gate en flujo de creación de tarea: evaluar → asignar → ejecutar

## 6. BYO API Gateway

- [ ] 6.1 Modelo ByoApiKey en schema (userId, provider, apiKey encriptada, costPerToken, maxParallel)
- [ ] 6.2 Endpoints CRUD: POST/GET/DELETE /api/byo/keys
- [ ] 6.3 Service ByoBackpressure: trackear requests en curso, reducir paralelismo ante 429

## 7. Frontend

- [ ] 7.1 Reemplazar mock de ChatPanel.tsx por fetch real a POST /api/concierge
- [ ] 7.2 Componente RatingForm: estrellas 1-10 por cada rol participante post-tarea
- [ ] 7.3 Indicador de "escribiendo..." mientras Hermes Agent procesa
