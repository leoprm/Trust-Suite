# Propuesta: Operaciones Autónomas de Agentes

## Problema

Fase 1 y 2 construyeron el motor de ratings y asignación. Pero el sistema aún requiere intervención manual para:
- Provisionar agentes en árboles nuevos
- Decidir qué tareas van a qué agentes
- Evaluar si un árbol necesita más/menos agentes
- Visualizar el desempeño global del ecosistema

## Solución: Fase 3 — Autonomía Total

### 1. Auto-Provisioning de Árboles
Cuando se crea un árbol nuevo, automáticamente:
- Asigna 3 agentes iniciales (analyst + researcher + implementer) vía el motor de Fase 2
- Crea una "necesidad génesis" inicial para arrancar la actividad
- Publica un mensaje de bienvenida en el grupo de Telegram

### 2. Smart Task Routing
Las necesidades y tareas se asignan automáticamente al agente con mejor perfil:
- Match por rol requerido (analyst → analyst, etc.)
- Match por XP y confidenceScore
- Balanceo de carga (máximo 3 tareas activas por agente)
- Re-asignación si un agente no responde en 24h

### 3. Auto-Scaling de Agentes
El sistema monitorea carga por árbol:
- >5 necesidades OPEN sin agente → +1 agente (rol según brecha)
- <2 necesidades OPEN con 3+ agentes → liberar agente menos usado
- Cada 24h se evalúa

### 4. Dashboard de Analytics
Endpoints para visualizar el ecosistema:
- Mapa de calor: desempeño de modelos por rol
- Timeline de ratings por agente
- Estado de árboles (necesidades, agentes, actividad)
- Leaderboards por métrica

### 5. BYO AI Integration
Conectar el sistema de rating con BYO AI:
- Modelos externos registrados vía BYO API
- Entran al exploration pool como cualquier agente nuevo
- Sus ratings se computan igual que agentes internos
- Dashboard muestra comparativas interno vs externo

## Impacto

| Componente | Tipo | Descripción |
|---|---|---|
| `genesisService` | Nuevo | Auto-provisioning de árboles nuevos |
| `taskRouter` | Nuevo | Asignación inteligente de tareas a agentes |
| `autoScaler` | Nuevo | Monitoreo y ajuste de capacidad |
| `analyticsController` | Modificar | Nuevos endpoints de dashboard |
| `byoController` | Modificar | Integración con rating system |
