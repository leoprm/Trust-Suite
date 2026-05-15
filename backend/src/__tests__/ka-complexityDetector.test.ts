/**
 * KA: Complexity Detector — unit tests.
 *
 * Verifica que:
 *  1. Consultas simples (sin keywords, <300 chars) → false
 *  2. Consultas con keywords dev/infra → true
 *  3. Mensajes >300 chars → true
 *  4. Casos borde (vacío, no-string, keyword en mayúsculas)
 */
import { describe, it, expect } from 'vitest';
import isComplexQuery from '../bot/complexityDetector';

describe('Complexity Detector', () => {
  // ── Escenario 1: Consulta simple — respuesta inmediata vía concierge ──
  it('simple query "cuántos miembros" → false (immediate concierge)', () => {
    expect(isComplexQuery('cuántos miembros hay en este árbol')).toBe(false);
  });

  it('simple query "hola" → false', () => {
    expect(isComplexQuery('hola')).toBe(false);
  });

  it('simple query "cómo estás" → false', () => {
    expect(isComplexQuery('cómo estás')).toBe(false);
  });

  // ── Escenario 2: Consulta compleja — keyword match ────────────────────
  it('complex query "instala Docker en mi servidor" → true (kanban task)', () => {
    // Matches "instalar" + "servidor"
    expect(isComplexQuery('instala Docker en mi servidor')).toBe(true);
  });

  it('keyword "ssh" → true', () => {
    expect(isComplexQuery('conéctate por SSH al servidor')).toBe(true);
  });

  it('keyword "deploy" → true', () => {
    expect(isComplexQuery('haz deploy de la app')).toBe(true);
  });

  it('keyword "clonar" → true', () => {
    expect(isComplexQuery('clonar el repositorio')).toBe(true);
  });

  it('keyword "compilar" → true', () => {
    expect(isComplexQuery('compilar el proyecto')).toBe(true);
  });

  it('keyword uppercase "INSTALAR" → true', () => {
    expect(isComplexQuery('INSTALAR NGINX')).toBe(true);
  });

  // ── Escenario 2b: Longitud >300 chars ─────────────────────────────────
  it('message >300 chars → true', () => {
    const long = 'a'.repeat(301);
    expect(isComplexQuery(long)).toBe(true);
  });

  it('message exactly 300 chars → false', () => {
    const exact = 'a'.repeat(300);
    expect(isComplexQuery(exact)).toBe(false);
  });

  // ── Casos borde ──────────────────────────────────────────────────────
  it('empty string → false', () => {
    expect(isComplexQuery('')).toBe(false);
  });

  it('null/undefined → false', () => {
    expect(isComplexQuery(null as any)).toBe(false);
    expect(isComplexQuery(undefined as any)).toBe(false);
  });

  it('number input → false', () => {
    expect(isComplexQuery(123 as any)).toBe(false);
  });
});
