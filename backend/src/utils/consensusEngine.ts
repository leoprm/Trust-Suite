export interface ConsensusResult {
  quorumReached: boolean;
  requiredVotes: number;
  newValue: number | null;
}

/**
 * Motor de Consenso Optimista (ConsensusEngine)
 * Recalcula el valor oficial basándose en los votos de la comunidad,
 * aplicando un umbral dinámico de participación y un filtro de valores atípicos.
 * 
 * @param totalTreeUsers - Número total de usuarios en el árbol (n)
 * @param votes - Array con los valores de los votos emitidos (ej. [5, 6, 9, 2])
 * @returns {ConsensusResult} Resultado del consenso y cálculos
 */
export function calculateConsensusValue(totalTreeUsers: number, votes: number[]): ConsensusResult {
  if (totalTreeUsers <= 0) {
    return { quorumReached: false, requiredVotes: 0, newValue: null };
  }

  // --- 1. Lógica del Umbral Dinámico de Participación (Quorum) ---
  let requiredPercentage = 0;

  if (totalTreeUsers <= 25) {
    requiredPercentage = 33;
  } else if (totalTreeUsers < 100) {
    // Interpolación lineal: El porcentaje disminuye linealmente desde 33% hasta 10%
    // Fórmula: Porcentaje = 33 - ((33 - 10) / (100 - 25)) * (n - 25)
    requiredPercentage = 33 - ((33 - 10) / (100 - 25)) * (totalTreeUsers - 25);
  } else {
    // n >= 100
    requiredPercentage = 10;
  }

  // Calculamos la cantidad de votos requeridos redondeando hacia arriba
  let requiredVotes = Math.ceil(totalTreeUsers * (requiredPercentage / 100));

  // Regla de piso absoluto: El número de votos requeridos nunca puede ser menor a 2,
  // a menos que el árbol tenga estrictamente 1 o 2 usuarios en total.
  if (totalTreeUsers > 2 && requiredVotes < 2) {
    requiredVotes = 2;
  } else if (totalTreeUsers <= 2) {
    requiredVotes = totalTreeUsers; // Si es 1 o 2, se requiere el total exacto.
  }

  // Verificamos si la cantidad de votos emitidos alcanza o supera el quorum requerido
  const quorumReached = votes.length >= requiredVotes;

  // Si no se alcanzó el quorum (o no hay votos en absoluto), retornamos null en el nuevo valor
  if (!quorumReached || votes.length === 0) {
    return {
      quorumReached,
      requiredVotes,
      newValue: null
    };
  }

  // --- 2. Lógica del Filtro de Valores Atípicos (Trimmed Mean) ---
  let calculableVotes = [...votes];

  // Si hay 5 votos o más aplicamos la media truncada para evitar manipulaciones (outliers)
  if (calculableVotes.length >= 5) {
    // Ordenamos de menor a mayor
    calculableVotes.sort((a, b) => a - b);
    
    // Eliminamos el voto más bajo (mínimo)
    calculableVotes.shift();
    
    // Eliminamos el voto más alto (máximo)
    calculableVotes.pop();
  }

  // Calculamos el promedio aritmético normal con los votos restantes
  const sum = calculableVotes.reduce((acc, curr) => acc + curr, 0);
  const average = sum / calculableVotes.length;

  // Redondear a 1 decimal
  const newValue = Math.round(average * 10) / 10;

  return {
    quorumReached,
    requiredVotes,
    newValue
  };
}
