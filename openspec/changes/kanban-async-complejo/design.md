# Diseño: Kanban Async para Consultas Complejas

## Contexto

Trust Maker v4 procesa todo vía concierge en línea. Consultas complejas (SSH,
instalación) exceden el timeout. El usuario se queda esperando sin feedback.

## Objetivos

- **Sí**: Derivar consultas complejas a Kanban para procesamiento async
- **Sí**: Notificar progreso cada 2:30 min mientras la tarea corre
- **Sí**: Notificar resultado final al completar
- **Sí**: Múltiples consultas simultáneas (cada una con su watchdog)
- **No**: Cambiar el flujo de consultas simples (siguen en línea)

## Decisiones

### 1. Detección de complejidad: heurísticas locales

**Alternativas:**
- Preguntar a la IA "¿esto es complejo?": agrega latencia, consume tokens.
- Heurísticas de palabras clave: instantáneo, 0 tokens.

**Decisión:** Heurísticas locales en `complexityDetector.ts`:
- Palabras clave de acción: instalar, descargar, ejecutar en, configurar, build, deploy, ssh, servidor
- Longitud > 300 chars
- Mención de `ssh_exec`

### 2. Creación de tareas: exec CLI de Kanban

**Alternativas:**
- API de Hermes Agent: más limpio pero requiere auth y parseo.
- `child_process.exec('hermes kanban create ...')`: ya funciona, stdout parseable.

**Decisión:** `child_process.exec` al CLI de Kanban. Timeout de 10s para la creación.
Si falla, fallback a concierge en línea.

### 3. Watchdog: cron jobs dinámicos

**Alternativas:**
- Un solo cron que monitorea TODAS las tareas: más simple pero acoplado.
- Un cron por tarea: aislado, se auto-limpia.

**Decisión:** Un solo cron job (`every 2m30s`) que itera sobre tareas activas originadas
por el bot. Cada iteración verifica estado de cada tarea y notifica si cambió.
Usa un registro en DB (`KanbanTask` con chatId, status, lastNotifiedAt).

### 4. Notificación: API de Telegram desde el cron

El cron job usa el token del bot para enviar mensajes al chatId original.
No depende del concierge ni de Hermes Agent — es directo.

## Riesgos

- **Race condition**: Si el usuario manda múltiples consultas complejas rápido,
  el `hermes kanban create` podría solaparse. Mitigación: cola en memoria.
- **Cron zombie**: Si una tarea se archivea sin que el watchdog lo detecte.
  Mitigación: el watchdog verifica existencia de la tarea antes de notificar.

## Plan de migración

Nuevo archivo `kanbanBridge.ts` + modificación de `messages.ts`. Nueva tabla
`KanbanTask` (o usar la tabla de cron jobs existente). Sin cambios breaking.
