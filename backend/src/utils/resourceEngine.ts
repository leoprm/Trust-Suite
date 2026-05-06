/**
 * ============================================================
 *  MOTOR DE RECURSOS Y ACCESO HORIZONTAL — Trust Lite
 * ============================================================
 *
 * Implementa la lógica de asignación de recursos físicos y temporales.
 * Se rige puramente por la Necesidad Social (Valor de Rama) y un
 * Índice de Estabilidad (IE) basado en la antigüedad, ignorando
 * el nivel o XP del usuario.
 *
 * Protocolos implementados:
 * 1. Curva Asintótica Exponencial (Factor de Desgaste).
 * 2. Resolución LIFO (Last In First Out) en caso de conflicto.
 * 3. Desempate puro por azar probabilístico equitativo (Math.random).
 */

export interface ResourceRequest {
  id: string;                 // ID interno (ej. Task ID)
  itemName: string;           // Nombre representativo (ej. Task B)
  necesidadRama: number;      // Valor Oficial de la Rama (1-10+)
  semanasContinuas: number;   // Semanas consecutivas operando
  limiteSemanas?: number;     // Config del Árbol (default: 24)
  factorDesgaste?: number;    // Config del Árbol (default: 0.15)
  requestedAmount?: number;   // Cantidad solicitada del recurso (default: 1)
  hashtagName?: string;       // El nombre de la Rama/Hashtag, crucial para LIFO selectivo
}

export interface AllocationResult {
  id: string;
  itemName: string;
  allocatedAmount: number;
  ie: number;                 // Índice de Estabilidad calculado
  auditLog: string;           // Registro de transparencia comunitaria
}

/**
 * Calcula el Índice de Estabilidad (IE) con rendimientos decrecientes.
 * La fórmula limita el monopolio cronológico achatando la curva a medida
 * que aumentan las semanas (Límite Asintótico).
 */
export function calculateStabilityIndex(
  necesidadRama: number,
  semanasContinuas: number,
  limiteSemanas: number = 24,
  factorDesgaste: number = 0.15,
  modoCrisis: boolean = false,
  crisisSubjects: string[] = [],
  hashtagName?: string
): number {
  let multiplicadorAntiguedad = 1;
  // Excepción total LIFO si la crisis está activada para toda la app (subjects vacíos)
  // o si el hashtag de la rama coincide con una de las víctimas reportadas en crisisSubjects.
  if (modoCrisis) {
      if (crisisSubjects.length === 0 || (hashtagName && crisisSubjects.includes(hashtagName))) {
          multiplicadorAntiguedad = 0;
      }
  }

  const bonoAntiguedad = (limiteSemanas * (1 - Math.exp(-factorDesgaste * semanasContinuas))) * multiplicadorAntiguedad;
  return necesidadRama + bonoAntiguedad;
}

/**
 * Motor central de Resolución de Conflictos (Pila de Utilidad).
 * Utiliza Regresión LIFO y un protocolo de Azar Determinista para 
 * los empates técnicos.
 */
export function resolveResourceAllocation(
  requests: ResourceRequest[],
  availableResources: number,
  modoCrisis: boolean = false,
  crisisSubjects: string[] = []
): AllocationResult[] {
  
  // 1. Proyectar y calcular el IE para cada solicitud + Token de Azar
  const processed = requests.map(req => {
    const ie = calculateStabilityIndex(
      req.necesidadRama,
      req.semanasContinuas,
      req.limiteSemanas ?? 24,
      req.factorDesgaste ?? 0.15,
      modoCrisis,
      crisisSubjects,
      req.hashtagName
    );
    // Cada elemento gana un ticket de lotería justo (0 a 1) para posibles empates
    return { ...req, ie, tieBreakerToken: Math.random() };
  });

  // 2. Ordenamiento: Prioridad principal = IE Descendente. Prioridad secundaria = Token Azar.
  processed.sort((a, b) => {
    // Definimos empate técnico como una diferencia imperceptible (< 0.0001)
    if (Math.abs(b.ie - a.ie) < 0.0001) {
      return a.tieBreakerToken - b.tieBreakerToken;
    }
    return b.ie - a.ie; // LIFO implícito (mayor IE arriba)
  });

  // 3. Resolución: Rastrear cantidad de competidores exactos por cada bloque IE para Logs
  const ieCounts = new Map<number, number>();
  processed.forEach(p => {
    const key = parseFloat(p.ie.toFixed(4));
    ieCounts.set(key, (ieCounts.get(key) || 0) + 1);
  });

  // 4. Asignación LIFO
  const results: AllocationResult[] = [];
  let remaining = availableResources;

  for (let i = 0; i < processed.length; i++) {
    const req = processed[i];
    const amountToAllocate = req.requestedAmount || 1;
    let allocated = 0;
    
    const key = parseFloat(req.ie.toFixed(4));
    const countInTie = ieCounts.get(key) || 1;
    let auditLog = '';

    if (remaining >= amountToAllocate) {
      // 4.a: Solicitud completamente aprobada
      allocated = amountToAllocate;
      remaining -= amountToAllocate;
      
      if (countInTie > 1) {
        auditLog = `Empate técnico (Necesidad Total ${req.ie.toFixed(1)} vs ${countInTie - 1} iguales): Asignado a ${req.itemName} por sorteo equitativo de azar.`;
      } else {
        auditLog = `Asignado a ${req.itemName} por mayor relevancia social estricta (Necesidad Total ${req.ie.toFixed(1)}).`;
      }
    } else if (remaining > 0) {
      // 4.b: Aprobación parcial (Mermas del recurso)
      allocated = remaining;
      remaining = 0;
      
      if (countInTie > 1) {
        auditLog = `Empate técnico (Necesidad Total ${req.ie.toFixed(1)}): Asignación parcial por Azar a ${req.itemName} (Recibió ${allocated}/${amountToAllocate}).`;
      } else {
        auditLog = `Asignación parcial para ${req.itemName}. Recursos completamente agotados tras esta entrega (Necesidad Total ${req.ie.toFixed(1)}).`;
      }
    } else {
      // 4.c: Denegación (La base de la Pirámide LIFO que no logra recursos)
      if (countInTie > 1) {
        auditLog = `Empate técnico (Necesidad Total ${req.ie.toFixed(1)}). Denegado por Azar ante agotamiento estricto de recursos para ${req.itemName}.`;
      } else {
        auditLog = `Denegado a ${req.itemName}: Recurso agotado por tareas más antiguas o con mayor base de Necesidad (Necesidad Total ${req.ie.toFixed(1)}).`;
      }
    }

    results.push({
      id: req.id,
      itemName: req.itemName,
      allocatedAmount: allocated,
      ie: req.ie,
      auditLog
    });
  }

  return results;
}
