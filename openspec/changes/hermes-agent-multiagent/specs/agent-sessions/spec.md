## ADDED Requirements

### Requirement: Difficulty Evaluator Agent
El sistema SHALL tener un agente server-wide que evalúa dificultad de tareas (1-10) usando datos de todos los árboles.

#### Scenario: Evaluar dificultad de tarea nueva
- **WHEN** Tree Agent consulta "Evalúa dificultad de: migrar base de datos MySQL a PostgreSQL"
- **THEN** Difficulty Evaluator responde con { difficulty: 7, reasoning: "..." }

#### Scenario: Aprender de ratings históricos
- **WHEN** tareas similares consistentemente reciben bajos ratings
- **THEN** Difficulty Evaluator ajusta dificultad al alza para tareas similares futuras

### Requirement: Tree Agent por árbol
Cada árbol SHALL tener un Tree Agent (sesión de Hermes Agent) que orquesta sus IAs internas.

#### Scenario: Tree Agent asigna ejecutores
- **WHEN** Tree Agent recibe tarea con dificultad 7
- **THEN** asigna solo ejecutores con nivel ≥ 5

#### Scenario: Tree Agent consulta Difficulty Evaluator
- **WHEN** llega una nueva tarea al árbol
- **THEN** Tree Agent consulta al Difficulty Evaluator antes de asignar IAs

### Requirement: IAs internas con roles fijos
Cada Tree Agent SHALL gestionar: 1 Analyst+Evaluator, 1 Creative, y 3-5 Executors.

#### Scenario: Analyst+Evaluator analiza y evalúa
- **WHEN** se requiere análisis de tarea
- **THEN** el Analyst+Evaluator desglosa la tarea y luego evalúa calidad del output

#### Scenario: Creative genera ideas
- **WHEN** se necesita brainstorming para una necesidad
- **THEN** el Creative propone 3-5 enfoques alternativos

#### Scenario: Executors trabajan en paralelo
- **WHEN** hay 3 tareas pendientes
- **THEN** 3 Executors distintos las ejecutan simultáneamente

### Requirement: Modelos diferenciados por rol
El sistema SHALL usar modelos baratos para Analyst, Creative, Evaluator y modelos potentes para Executors.

#### Scenario: Executor usa modelo potente
- **WHEN** se asigna tarea a un Executor
- **THEN** la llamada a LLM usa modelo potente (Claude/GPT-4)

#### Scenario: Analyst usa modelo barato
- **WHEN** Analyst analiza una tarea
- **THEN** la llamada a LLM usa modelo barato (DeepSeek)
