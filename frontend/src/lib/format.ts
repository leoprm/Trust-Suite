/**
 * Formatea números grandes con abreviaturas:
 * - Miles: "m" (ej: 1500 → "1,5 m")
 * - Millones: "M" (ej: 2805704 → "2,8 M")  
 * - Billones: "B" (ej: 1500000000 → "1,5 B")
 * 
 * Usa coma decimal (estilo español).
 * Si el número es negativo, incluye el signo.
 * 
 * @param value - El número a formatear
 * @param decimals - Cuántos decimales mostrar (default: 1)
 * @returns String formateado, ej: "2,8 M", "450 m", "0"
 */
export function formatCompactCurrency(value: number, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '---';
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1_000_000_000) {
    return sign + '$' + (abs / 1_000_000_000).toFixed(decimals).replace('.', ',') + ' B';
  }
  if (abs >= 1_000_000) {
    return sign + '$' + (abs / 1_000_000).toFixed(decimals).replace('.', ',') + ' M';
  }
  if (abs >= 1_000) {
    return sign + '$' + (abs / 1_000).toFixed(decimals).replace('.', ',') + ' m';
  }
  return sign + '$' + abs.toFixed(0);
}
