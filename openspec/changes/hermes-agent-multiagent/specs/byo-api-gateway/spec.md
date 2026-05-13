## ADDED Requirements

### Requirement: Registro de API externa
El sistema SHALL permitir registrar APIs externas con clave, proveedor, costo por token y paralelismo máximo.

#### Scenario: Usuario registra su API
- **WHEN** usuario envía POST /api/byo/register con { provider: "openai", apiKey: "sk-...", costPerToken: 0.00002, maxParallel: 5 }
- **THEN** el sistema almacena la API encriptada y la asocia al usuario

### Requirement: Límite de paralelismo
El sistema SHALL respetar maxParallel al asignar tareas a una API externa.

#### Scenario: API saturada
- **WHEN** una API tiene maxParallel=3 y ya hay 3 requests en curso
- **THEN** nuevas tareas para esa API se encolan hasta que haya un slot libre

#### Scenario: API con capacidad
- **WHEN** una API tiene maxParallel=5 y solo 2 requests en curso
- **THEN** se aceptan hasta 3 requests adicionales en paralelo

### Requirement: Protección ante saturación
El sistema SHALL reducir temporalmente el paralelismo si la API devuelve errores 429 o timeouts.

#### Scenario: API devuelve rate limit
- **WHEN** una API externa devuelve 429 en 3 requests consecutivos
- **THEN** el sistema reduce su maxParallel efectivo a la mitad por 5 minutos

#### Scenario: Recuperación automática
- **WHEN** pasan 5 minutos sin errores 429
- **THEN** el sistema restaura el maxParallel original

### Requirement: Traqueo de costo
El sistema SHALL registrar el costo acumulado por uso de API externa para facturación.

#### Scenario: Registro de costo por request
- **WHEN** una API externa procesa un request de 1000 tokens
- **THEN** el sistema registra costo = 1000 × costPerToken en el historial del usuario
