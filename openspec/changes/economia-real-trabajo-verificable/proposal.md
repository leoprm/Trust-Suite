# Economía Real con Trabajo Verificable

## ¿Qué?

Convertir Trust Maker en una economía real donde los miembros no solo proponen necesidades, sino que **trabajan, entregan evidencia y ganan reputación verificable**. El bot de Telegram se vuelve el notario y tesorero del árbol.

## ¿Por qué?

Actualmente Trust Maker organiza necesidades e ideas, pero no cierra el ciclo: no hay trabajo real, no hay dinero moviéndose, no hay reputación ganada con hechos. Sin este ciclo, es un tablero de ideas.

## ¿Cómo?

6 capacidades nuevas, en orden de dependencia:

### 1. Tasks con Presupuesto
- Miembros crean tasks vinculadas a necesidades, con presupuesto en CLP
- El creador del árbol aprueba tasks y asigna fondos
- Tasks pasan por estados: PENDING → ASSIGNED → IN_PROGRESS → EVIDENCE_SUBMITTED → VERIFIED → PAID

### 2. Skills por Trabajo Verificado
- Cada task completada otorga XP en skills específicas
- El bot infiere skills del tipo de task completada
- TaskRouter asigna nuevas tasks a miembros con skills demostradas (no solo AI agents)
- CareerPath Network se extiende a humanos

### 3. Evidencias y Disputas
- Miembros suben fotos/archivos al bot como prueba de trabajo
- El bot almacena y cataloga evidencias
- Cualquier miembro puede disputar con contra-evidencia
- Resolución por votación del árbol (quórum)

### 4. Cuota Mensual Dinámica
- Costo base: suscripción a Trust Maker (ya existe Paddle/Stripe)
- Costo variable: presupuestos de necesidades activas ÷ miembros del árbol
- El bot calcula y notifica la cuota mensual
- Solo miembros al día pueden interactuar con el bot

### 5. Gate de Pago
- Miembros con cuota impaga reciben mensaje genérico + link de pago
- Período de gracia: 7 días antes del bloqueo
- Miembros bloqueados pueden leer el grupo pero no interactuar con el bot
- Excepción: comandos públicos (/info, /lista) visibles para todos

### 6. Árboles Privados
- Por defecto, árboles nuevos son PRIVADOS (admissionPolicy=CLOSED)
- El bot solo muestra árboles públicos + los del usuario
- Invitación explícita requerida para unirse a árboles privados

## Impacto

- **Usuarios**: pasan de proponer ideas a trabajar y ganar reputación real
- **Creadores de árboles**: obtienen una herramienta de gestión de trabajo + pagos
- **Trust Maker**: monetización sostenible vía cuota por árbol + transacciones
