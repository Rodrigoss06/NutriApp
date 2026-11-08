import { describe, expect, it } from 'vitest';
import { dayProfileProblems, type DayProfileDraft } from './day-profiles.js';

/** Los perfiles de la hoja piloto y de la respuesta de Jeremy a P-20.4: descanso y un día alto de pierna. */
const REST: DayProfileDraft = {
  code: 'REST',
  name: 'Descanso',
  choG: 240,
  proteinG: 160,
  fatG: 70,
};
const HIGH: DayProfileDraft = { code: 'ALTO', name: 'Alto', choG: 330, proteinG: 160, fatG: 70 };

describe('07 §2 · P-20.4 · los perfiles de día del plan', () => {
  it('descanso y los propios, con códigos y nombres distintos, no tienen problemas', () => {
    expect(dayProfileProblems([REST, HIGH])).toEqual([]);
    expect(dayProfileProblems([])).toEqual([]);
  });

  it('Entrenamiento es la meta de la prescripción: no se define como perfil', () => {
    expect(dayProfileProblems([{ ...HIGH, code: 'TRAINING' }])).toEqual([
      'Entrenamiento es la meta de la prescripción: no se define como perfil.',
    ]);
  });

  it('un código o un nombre repetido, un código que no sirve o un nombre vacío no se guardan', () => {
    expect(dayProfileProblems([REST, { ...HIGH, code: 'REST' }])).toEqual([
      'Dos perfiles no pueden tener el mismo código (REST).',
    ]);
    expect(dayProfileProblems([REST, { ...HIGH, name: ' descanso ' }])).toEqual([
      'Dos perfiles no pueden llamarse igual (descanso).',
    ]);
    expect(dayProfileProblems([{ ...HIGH, code: 'alto' }])).toEqual([
      'El código del perfil «Alto» va en mayúsculas, sin espacios ni tildes, y empieza con una letra.',
    ]);
    expect(dayProfileProblems([{ ...HIGH, name: '  ' }])).toEqual([
      'Cada perfil lleva un nombre de hasta 40 caracteres.',
    ]);
  });

  it('hasta 6 perfiles además de Entrenamiento', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...HIGH,
      code: `P${String(i)}`,
      name: `Perfil ${String(i)}`,
    }));
    expect(dayProfileProblems(many)).toEqual([
      'Un plan tiene hasta 6 perfiles de día además de Entrenamiento.',
    ]);
  });
});
