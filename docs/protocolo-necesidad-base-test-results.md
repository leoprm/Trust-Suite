# Resultados — Testing Protocolo Necesidad Base

> **Fecha**: 2026-05-11T23:34:44.817Z  
> **Resultado**: 7/7 tests pasados  
> **Estado**: ✅ TODOS PASADOS

---

## Resultados por Test

| # | Test | Resultado | Detalle |
|---|------|-----------|---------|
| 1 | 1. Sedimentación | ✅ | isBase=true, baselineUserCount=3 |
| 2 | 2. Evidence gate (sin evidence) | ✅ | xpAwarded=0 ✓ |
| 3 | 3. Evidence gate (con evidence) | ✅ | xpAwarded=64 (>0) ✓ |
| 4 | 4. Decay (2 ciclos bajo 66%) | ✅ | isBase=false, sedimentedAt=null ✓ |
| 5 | 5. Notificaciones | ✅ | Ambas enviadas ✓ |
| 6 | 6. Re-sedimentación | ✅ | isBase=true ✓ |
| 7 | 7. Necesidad normal intacta | ✅ | xpAwarded=64 (>0) ✓ |

---

## Resumen

- **Tests ejecutados**: 7
- **Pasados**: 7
- **Fallados**: 0

### ✅ Todos los tests pasaron

1. **Sedimentación**: Las necesidades con 12+ meses de antigüedad y relevanceThresholdMet se sedimentan correctamente (isBase=true, baselineUserCount registrado).
2. **Evidence gate (sin evidence)**: Tasks en necesidades base sin evidence pública aprobada no otorgan XP (xpAwarded=0).
3. **Evidence gate (con evidence)**: Tasks con evidence aprobado sí otorgan XP normal.
4. **Decay**: 2 ciclos consecutivos bajo el 66% del baseline degradan la necesidad (isBase=false, sedimentedAt=null).
5. **Notificaciones**: Se envían notificaciones de sedimentación y degradación a los miembros del árbol.
6. **Re-sedimentación**: Una necesidad degradada puede volver a sedimentarse si vuelve a cumplir los 12 meses.
7. **Necesidad normal**: El flujo de completeTask en necesidades no-base no se ve afectado — sigue otorgando XP normalmente.

### Bugs encontrados y corregidos durante testing

- **Notificaciones con enums inválidos** (`baseNeedService.ts`): Las funciones `notifyTreeMembersOfSedimentation` y `notifyUsersOnDegradation` usaban `type: 'INFO'` y `category: 'ARBOL'`. Los enums correctos son `NotificationType` (valores: GENERAL, TASK_AUDIT, etc.) y `NotificationCategory` (URGENTE, FLUJO, MERITO). Se corrigió a `type: 'GENERAL', category: 'FLUJO'`. Sin esta corrección, las notificaciones fallaban silenciosamente.

