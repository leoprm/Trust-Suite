# OpenSpec: Sistema de Necesidades por Ciclos

**Fecha:** 2026-05-29
**Estado:** Diseño
**Autor:** Leo + Hermes

---

## Resumen

Sistema de pipeline continuo de 2 fases (recolectar → votar) en ciclos de 4 horas.
Cada 4h se puede generar una solución. Las necesidades no votadas en 2 rondas
se eliminan automáticamente (revivibles).

---

## 1. Puntos

- Cada miembro recibe **25 puntos cada 4 horas** (6 ciclos/día = 150 puntos/día).
- Los puntos **no se acumulan** entre ciclos. Se resetean al inicio de cada ciclo.
- Un miembro reparte sus 25 puntos entre las necesidades en votación.
- Reemplaza el sistema anterior de 1000 puntos mensuales + `dailyPoints`.

**DB:**
- Eliminar `TreeMember.dailyPoints`
- Agregar `TreeMember.cyclePoints` (INT, default 25)
- Nuevo campo `TreeMember.cyclePointsRefillAt` (DateTime)

---

## 2. Pipeline de 2 fases

Cada ciclo de 4h tiene dos fases que corren en paralelo desfasado:

```
Ciclo N (0h-4h):   Recolectar necesidades → van a Votación en Ciclo N+1
Ciclo N+1 (4h-8h): Votar necesidades del Ciclo N  +  Recolectar para Ciclo N+2
```

| Hora | Fase |
|---|---|
| 0:00 | Inicio recolección A |
| 4:00 | Fin recolección A, inicio votación A + recolección B |
| 8:00 | Fin votación A → solución A elegida. Inicio votación B + recolección C |
| ... | ... |

---

## 3. Necesidades (Needs)

### 3.1 Estados

```
PROPOSED → VOTING → APPROVED → IN_PROGRESS → SATISFIED
                ↘ REJECTED (2 rondas sin ganar)
```

- `PROPOSED`: recién creada, esperando inicio de ciclo de votación
- `VOTING`: en votación activa durante 4h
- `APPROVED`: ganó la votación, Ari la ejecuta
- `REJECTED`: perdió 2 rondas → eliminada (revivible si se vuelve a proponer)
- `IN_PROGRESS` / `SATISFIED` / `CLOSED`: igual que ahora

### 3.2 Nuevos campos en Need

```prisma
model Need {
  // ... existentes
  cyclePhase        String?        // "collect" | "vote"
  votingEndsAt      DateTime?      // cuándo cierra la votación
  roundNumber       Int            @default(1)  // 1 o 2
  previousRoundId   String?        // ID de la necesidad en ronda anterior (carry-over)
  difficultyAvg     Float?         // promedio de ratings de dificultad
  pointsAllocation  Json?          // {"userId": points, ...}
  totalPoints       Int            @default(0)
}
```

### 3.3 Votación anónima

```prisma
model NeedVote {
  id        String   @id @default(uuid())
  needId    String
  userId    String
  points    Int      // cuántos de sus 25 puntos asigna
  createdAt DateTime @default(now())
  // SIN referencia al User en el JSON público — anónimo para el grupo

  need      Need     @relation(fields: [needId], references: [id], onDelete: Cascade)
  
  @@unique([needId, userId])
}
```

---

## 4. Detección de necesidades (Ari)

### 4.1 Comportamiento por modo de interacción

| Modo | Comportamiento |
|---|---|
| MAXIMUM | Ari analiza el chat y propone necesidades cada ciclo |
| MEDIUM | Ari propone solo si detecta algo claro (umbral más alto) |
| MINIMUM | Solo reacciona a 👍 explícitos de usuarios |
| Todos | Ari puede detectar necesidades en cualquier modo |

### 4.2 Detección automática

- Ari analiza los mensajes del grupo cada ~15-30 min (o al final de cada hora).
- Si detecta un posible need, reacciona con ❓ al mensaje origen.
- Al final del ciclo de recolección, Ari resume las necesidades detectadas.

### 4.2.1 Contraste con objetivo global

Cada árbol tiene un campo `objectives` (@db.Text) definido en su creación
y modificable en cualquier momento. Ari DEBE usarlo como filtro:

- **Alineación:** mensajes que avanzan hacia el objetivo → posible necesidad
  (ej: objetivo = "lanzar MVP", mensaje = "necesitamos pasarela de pago" → need)
- **Desviación:** mensajes que se alejan del objetivo → Ari lo señala
  (ej: objetivo = "productividad", mensaje = "hagamos un juego" → pregunta si es prioridad)
- **Sin objetivo definido:** Ari pide al grupo que defina uno antes de detectar necesidades
  (primer mensaje de onboarding: "¿Cuál es el objetivo de este grupo?")
- **Objetivo modificado:** al cambiar `objectives`, Ari reinicia su contexto de detección

El contraste se hace en cada análisis. Ari responde con frases como:
- "Esto se alinea con nuestro objetivo de X. ¿Lo convierto en necesidad?"
- "Esto se desvía de nuestro objetivo de X. ¿Quieren redefinir el objetivo?"

### 4.3 Grupos pequeños (≤3 miembros)

- Ari pregunta **abiertamente en el grupo**: "¿Convierto X en necesidad?"
- Los miembros responden con 👍/👎 o texto.
- Si hay consenso rápido, se crea la necesidad de inmediato.
- La dificultad se pregunta por **DM anónimo** a cada miembro (1-10).

### 4.4 Árboles individuales

- Sin votación.
- Ari detecta y ejecuta directamente.
- No se asignan puntos de ciclo.

---

## 5. Flujo de votación

1. Al inicio del ciclo de votación (hora 4, 8, 12, 16, 20, 0), Ari publica en el grupo:
   > "📋 Necesidades para votar (cierra a las XX:00):"
   > Lista numerada de necesidades con descripción breve

2. Cada miembro recibe **25 puntos**. Vota asignando puntos a una o varias necesidades.

3. Las necesidades de **ronda 2** (carry-over del ciclo anterior) se marcan como `roundNumber: 2`.

4. Al cerrar la votación (4h después):
   - **1er lugar**: pasa a APPROVED → Ari la ejecuta
   - **2do lugar**: pasa a la siguiente ronda (`roundNumber: 2`)
   - **Resto**: si es ronda 2 → REJECTED. Si es ronda 1 → pasa a ronda 2.

5. Una necesidad REJECTED puede ser repropuesta por cualquier miembro o por Ari.

---

## 6. Habilitación por DM

Los bots de Telegram no pueden iniciar conversaciones por DM. Para que un
miembro pueda recibir encuestas, debe iniciar él la conversación.

### 6.1 Onboarding inicial
Cuando Ari entra al grupo por primera vez, su presentación incluye:
> "📩 Para participar en las votaciones, envíame un mensaje de 'hola' por DM: https://t.me/TrustMakerBot"

### 6.2 Bienvenida a nuevos miembros
Cuando un usuario se une al grupo:
- Ari da la bienvenida con @username
- Incluye link al DM
- Explica que debe enviar "hola" para poder votar

### 6.3 Handler de DM
- Al recibir "hola" (case-insensitive) → marca `TreeMember.dmEnabled = true`
- Responde confirmación: "✅ ¡Listo! Ahora podrás votar..."
- El resto de mensajes en DM se ignoran (sin consumir tokens de Ari)

### 6.4 Nuevo campo
- `TreeMember.dmEnabled` Boolean @default(false)
- Solo miembros con dmEnabled=true reciben encuestas de votación

---

## 7. Encuesta nativa de Telegram (votación por DM)

### 7.1 Formato
- Encuesta nativa de Telegram (`sendPoll`) con opciones 1 a 10
- Una encuesta por necesidad activa en votación
- Se envía por DM a cada miembro con dmEnabled=true

### 7.2 Captura de respuestas
- Handler de `poll_answer` de la API de Telegram
- Mapeo: rating 10 → asigna más puntos proporcionales
- Puntos totales asignados = (rating / 10) * puntos_disponibles_del_miembro
- Si ya votó → actualiza su voto anterior (no duplica)
- Sin puntos disponibles → no recibe encuesta

### 7.3 Implementación técnica
- `src/bot/pollHandler.ts` — handler de poll_answer
- `src/bot/dmHandler.ts` — handler de mensajes "hola"
- `src/bot/welcome.ts` — mensaje de bienvenida a nuevos miembros
- `src/bot/onboarding.ts` — presentación inicial al entrar al grupo

---

## 8. Rating de dificultad

- Cuando una necesidad entra en votación, Ari envía un **DM anónimo** a cada miembro:
  > "Del 1 al 10, ¿qué tan difícil crees que es esta necesidad para el árbol?"
- El promedio se guarda en `Need.difficultyAvg`.
- Si ≤3 miembros, Ari pregunta en el grupo abiertamente.
- No aplica en árboles individuales.

---

## 7. Implementación técnica

### 7.1 Cambios en DB (Prisma)

- Nuevo modelo `NeedVote`
- Modificar `Need`: agregar `cyclePhase`, `votingEndsAt`, `roundNumber`, `previousRoundId`, `difficultyAvg`, `pointsAllocation`, `totalPoints`
- Modificar `TreeMember`: eliminar `dailyPoints`, agregar `cyclePoints`, `cyclePointsRefillAt`

### 7.2 Nuevos endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/trees/:treeId/needs/:needId/vote` | Votar (anónimo, recibe {points}) |
| GET | `/api/trees/:treeId/needs/voting` | Listar necesidades en votación activa |
| POST | `/api/trees/:treeId/needs/:needId/revive` | Revivir necesidad REJECTED |
| GET | `/api/trees/:treeId/cycle/status` | Estado del ciclo actual |
| POST | `/api/trees/:treeId/needs/:needId/difficulty` | Enviar rating de dificultad (1-10) |

### 7.3 Cron jobs

1. **Cada 4h (0,4,8,12,16,20 UTC-4):**
   - Cerrar votación del ciclo anterior
   - Determinar ganador y 2do lugar
   - Mover perdedores ronda 2 → REJECTED
   - Resetear puntos de todos los miembros
   - Publicar resumen en el grupo

2. **Cada 15-30 min:**
   - Ari analiza mensajes nuevos para detectar necesidades potenciales

### 7.4 System prompt de Ari

Agregar al system prompt:
- Reglas de detección de necesidades por modo
- Protocolo de grupos pequeños (≤3)
- Formato de resumen de votación
- Manejo de DM para rating de dificultad
- No actuar sobre necesidades hasta que estén APPROVED

---

## 8. Rollout

1. Migración de DB (fase 1)
2. Endpoints de votación (fase 2)
3. Cron de ciclos (fase 3)
4. System prompt de Ari + detección (fase 4)
5. Migración de datos existentes (fase 5)
6. Pruebas en árbol de test (fase 6)

---

## 9. Preguntas abiertas

- ¿El ciclo arranca a medianoche o cuando se crea el árbol?
  → Propuesta: medianoche (UTC-4) para todos, predecible.
- ¿Qué pasa si no hay necesidades en un ciclo?
  → Se saltea. Ari puede comentar "sin necesidades este ciclo".
- ¿Las necesidades existentes se migran al nuevo sistema?
  → Sí, se asignan a `roundNumber: 1` y entran en el siguiente ciclo de votación.
