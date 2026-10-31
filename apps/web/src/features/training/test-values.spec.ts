import { describe, expect, it } from 'vitest';
import { evidenceUrlProblem, physicalValueProblem, scoreOf, scoreText } from './test-values';

describe('07 §3.3 · el puntaje de cada lado', () => {
  it('sin puntaje es null, y 0 es un puntaje', () => {
    expect(scoreOf(scoreText(null))).toBeNull();
    expect(scoreOf(scoreText(0))).toBe(0);
    expect(scoreOf(scoreText(2))).toBe(2);
  });
});

describe('07 §4 · la evidencia y el valor de una prueba', () => {
  it('el enlace es opcional y, si está, es https', () => {
    expect(evidenceUrlProblem('')).toBeNull();
    expect(evidenceUrlProblem('https://videos.example.com/a')).toBeNull();
    expect(evidenceUrlProblem('http://videos.example.com/a')).toMatch(/https/);
    expect(evidenceUrlProblem('videos')).toMatch(/https/);
  });

  it('el valor acepta coma, y no se redondea en silencio', () => {
    expect(physicalValueProblem('480,5')).toBeNull();
    expect(physicalValueProblem('12')).toBeNull();
    expect(physicalValueProblem('')).toMatch(/valor/);
    expect(physicalValueProblem('-1')).toMatch(/2 decimales/);
    expect(physicalValueProblem('1,234')).toMatch(/2 decimales/);
  });
});
