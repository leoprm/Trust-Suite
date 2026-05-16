/**
 * Deadline parser — detects Spanish time expressions in todo text.
 * Returns a Date (at end of day, 23:59:59 local) or null if no deadline found.
 *
 * Patterns (in order of specificity):
 *   "el <DD> de <mes>"       → "el 15 de mayo"
 *   "el <DD>/<MM>"           → "el 15/05"
 *   "mañana" / "pasado mañana"
 *   "este finde"             → next Saturday
 *   "el <día de semana>"     → "el próximo jueves"
 *   "la próxima semana"      → +7 days
 *   "en <N> días"            → +N days
 *   "en <N> semanas"         → +N * 7 days
 */

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

const DAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
  jueves: 4, viernes: 5, sábado: 6, sabado: 6,
};

/** Return a Date at 23:59:59 local time for the given date. */
function endOfDay(d: Date): Date {
  const eod = new Date(d);
  eod.setHours(23, 59, 59, 999);
  return eod;
}

/** Return next occurrence of `dayOfWeek` (0=Sun, 6=Sat) after today. */
function nextDayOfWeek(dayOfWeek: number, from: Date = new Date()): Date {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  const current = today.getDay();
  let diff = dayOfWeek - current;
  if (diff <= 0) diff += 7;
  today.setDate(today.getDate() + diff);
  return today;
}

export function parseDeadline(text: string): Date | null {
  const lower = text.toLowerCase();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // ── "el <DD> de <mes>"  ──────────────────────────────────────────
  const namedMonthRe = /el\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;
  const nmMatch = lower.match(namedMonthRe);
  if (nmMatch) {
    const day = parseInt(nmMatch[1], 10);
    const month = MONTHS[nmMatch[2].toLowerCase()];
    if (day >= 1 && day <= 31 && month !== undefined) {
      const d = new Date(now.getFullYear(), month, day);
      // If the date has passed this year, assume next year
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return endOfDay(d);
    }
  }

  // ── "el <DD>/<MM>"  ──────────────────────────────────────────────
  const numericRe = /el\s+(\d{1,2})\/(\d{1,2})/;
  const numMatch = lower.match(numericRe);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return endOfDay(d);
    }
  }

  // ── "pasado mañana" ──────────────────────────────────────────────
  if (/\bpasado\s+mañana\b/.test(lower) || /\bpasado\s+manana\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return endOfDay(d);
  }

  // ── "mañana" ─────────────────────────────────────────────────────
  if (/\bmañana\b/.test(lower) || /\bmanana\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return endOfDay(d);
  }

  // ── "este finde" → próximo sábado ────────────────────────────────
  if (/\beste\s+finde\b/.test(lower) || /\beste\s+fin\s+de\b/.test(lower)) {
    return endOfDay(nextDayOfWeek(6, now)); // Saturday
  }

  // ── "el próximo <día>" / "el <día>" ─────────────────────────────
  const dayRe = /el\s+(pr[oó]ximo?\s+)?(domingo|lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado)/i;
  const dayMatch = lower.match(dayRe);
  if (dayMatch) {
    const dayName = dayMatch[2].toLowerCase().replace(/[áé]/g, (m) => m === 'á' ? 'a' : 'e');
    const dayNum = DAYS[dayName];
    if (dayNum !== undefined) {
      return endOfDay(nextDayOfWeek(dayNum, now));
    }
  }

  // ── "la próxima semana" ──────────────────────────────────────────
  if (/\bla\s+pr[oó]xima\s+semana\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return endOfDay(d);
  }

  // ── "en <N> semanas" ─────────────────────────────────────────────
  const weeksRe = /en\s+(\d+)\s+semanas?/;
  const weeksMatch = lower.match(weeksRe);
  if (weeksMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(weeksMatch[1], 10) * 7);
    return endOfDay(d);
  }

  // ── "en <N> días" ────────────────────────────────────────────────
  const daysRe = /en\s+(\d+)\s+d[ií]as?/;
  const daysMatch = lower.match(daysRe);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(daysMatch[1], 10));
    return endOfDay(d);
  }

  return null;
}
