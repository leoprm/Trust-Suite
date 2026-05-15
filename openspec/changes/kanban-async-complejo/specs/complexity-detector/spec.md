## ADDED Requirements

### Requirement: Detectar complejidad de consulta
El bot SHALL clasificar cada consulta como "simple" (respuesta en línea) o
"compleja" (derivar a Kanban) según heurísticas.

#### Scenario: Consulta simple
- **WHEN** el usuario pregunta "¿cuántos miembros tiene el árbol?"
- **THEN** se responde en línea vía concierge (timeout 10 min)

#### Scenario: Consulta compleja — SSH
- **WHEN** el usuario pide "instala Docker en mi servidor" o "ejecuta apt update en el VPS"
- **THEN** se deriva a Kanban y se responde "⏳ Procesando en background. Tarea t_xxx"

#### Scenario: Consulta compleja — múltiples pasos
- **WHEN** la consulta contiene más de 2 verbos de acción (instalar, configurar, crear, ejecutar, desplegar)
- **THEN** se deriva a Kanban

### Requirement: Heurísticas de complejidad
El detector SHALL usar estas reglas:
1. Contiene `ssh_exec` o mención de servidor → complejo
2. Contiene palabras clave de instalación (instalar, descargar, clonar, deploy, build, compilar, ejecutar en, configurar en) → complejo
3. El mensaje tiene más de 300 caracteres → complejo
4. En caso contrario → simple (concierge en línea)
