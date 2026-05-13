## ADDED Requirements

### Requirement: Rating directo a XP
El sistema SHALL convertir rating de usuario (1-10 estrellas) en XP con relación 1:1.

#### Scenario: Usuario califica con 7 estrellas
- **WHEN** usuario asigna 7 estrellas al rol Creative
- **THEN** el agente Creative recibe +7 XP

#### Scenario: Usuario califica con 1 estrella
- **WHEN** usuario asigna 1 estrella al rol Executor
- **THEN** el agente Executor recibe +1 XP

### Requirement: Level up cada 50 XP
El sistema SHALL incrementar el nivel del agente cada 50 XP acumulados.

#### Scenario: Agente alcanza 50 XP exactos
- **WHEN** un agente con 45 XP recibe +5 XP (total: 50)
- **THEN** su nivel sube en 1 y su XP queda en 0

#### Scenario: Agente sobrepasa 50 XP
- **WHEN** un agente con 47 XP recibe +8 XP (total: 55)
- **THEN** su nivel sube en 1 y su XP queda en 5

### Requirement: Rating post-tarea
El sistema SHALL mostrar un formulario de rating al usuario después de completar una tarea.

#### Scenario: Formulario de rating por rol
- **WHEN** una tarea se completa
- **THEN** el usuario ve un formulario con los roles que participaron y estrellas (1-10) para cada uno

#### Scenario: Rating opcional
- **WHEN** usuario no quiere calificar
- **THEN** puede cerrar el formulario sin asignar estrellas (no se otorga XP)

### Requirement: XP y nivel solo para uso interno
El sistema SHALL usar XP y nivel exclusivamente para asignación de IAs y evaluación cross-tree, nunca expuestos al usuario final.

#### Scenario: Asignación por nivel
- **WHEN** se necesita un Executor para tarea dificultad 8
- **THEN** el sistema consulta niveles internamente y asigna solo Executors nivel ≥ 5
