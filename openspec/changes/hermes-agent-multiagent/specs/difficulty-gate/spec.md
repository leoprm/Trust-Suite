## ADDED Requirements

### Requirement: Evaluación de dificultad de tarea
El Difficulty Evaluator SHALL asignar una dificultad (1-10) a cada tarea nueva antes de su asignación.

#### Scenario: Tarea simple
- **WHEN** tarea es "cambiar texto de botón en landing page"
- **THEN** Difficulty Evaluator devuelve dificultad 1-2

#### Scenario: Tarea compleja
- **WHEN** tarea es "diseñar e implementar sistema de autenticación OAuth2 con múltiples providers"
- **THEN** Difficulty Evaluator devuelve dificultad 8-10

### Requirement: Gate de asignación por dificultad
El sistema SHALL asignar IAs según la dificultad de la tarea.

#### Scenario: Dificultad 1-3 — cualquiera
- **WHEN** dificultad es 2
- **THEN** se asigna cualquier IA libre, selección aleatoria

#### Scenario: Dificultad 4-6 — nivel ≥ 3
- **WHEN** dificultad es 5
- **THEN** solo se asignan IAs con nivel ≥ 3

#### Scenario: Dificultad 7-8 — nivel ≥ 5
- **WHEN** dificultad es 7
- **THEN** solo se asignan IAs con nivel ≥ 5

#### Scenario: Dificultad 9-10 — nivel ≥ 7
- **WHEN** dificultad es 9
- **THEN** solo se asignan IAs con nivel ≥ 7

### Requirement: Aprendizaje cross-tree del evaluador
El Difficulty Evaluator SHALL ajustar sus evaluaciones usando datos de todos los árboles.

#### Scenario: Ajuste por malos resultados históricos
- **WHEN** tareas de tipo "migración de base de datos" consistentemente reciben rating < 5
- **THEN** el Difficulty Evaluator incrementa la dificultad base para ese tipo de tarea
