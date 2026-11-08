import { describe, expect, it } from 'vitest';
import {
  customProfileRow,
  dayProfileErrors,
  dayProfileRowsOf,
  dayProfilesBody,
  profileCodeOf,
  restProfileRow,
  withoutProfile,
  type DayProfileRow,
} from './day-profiles';

/** La meta de Entrenamiento de Mateo en la hoja piloto: 2,510 kcal, 310 g de carbohidratos, 160 de proteína y 70 de grasa. */
const TRAINING = { kcal: 2510, choG: 310, proteinG: 160, fatG: 70 };

describe('07 §2 · P-20.1 · los perfiles de día del plan en el editor', () => {
  it('Descanso autocompleta la proteína y la grasa de Entrenamiento; los carbohidratos los escribe el coach', () => {
    expect(restProfileRow(TRAINING, 'fila')).toEqual({
      key: 'fila',
      code: 'REST',
      name: 'Descanso',
      choG: '',
      proteinG: '160',
      fatG: '70',
    });
    expect(customProfileRow({ ...TRAINING, fatG: 50.95932539682539 }, 'otra')).toEqual({
      key: 'otra',
      code: null,
      name: '',
      choG: '',
      proteinG: '160',
      fatG: '51',
    });
  });

  it('lo guardado vuelve igual en el cuerpo, con su código', () => {
    const rows = dayProfileRowsOf([
      {
        code: 'REST',
        name: 'Descanso',
        kcal: 2230,
        choG: 240,
        proteinG: 160,
        fatG: 70,
        method: {
          methodCode: 'MACROS_DAY_PROFILE',
          methodVersion: '1.0.0',
          inputsHash: 'x',
          warnings: [],
        },
      },
    ]);
    expect(dayProfilesBody(rows)).toEqual([
      { code: 'REST', name: 'Descanso', choG: 240, proteinG: 160, fatG: 70 },
    ]);
  });

  it('un perfil nuevo toma su código del nombre, sin tildes ni espacios y sin chocar con otro', () => {
    expect(profileCodeOf('Día alto', new Set())).toBe('DIA_ALTO');
    expect(profileCodeOf('Refeed', new Set(['REFEED']))).toBe('REFEED_2');
    expect(profileCodeOf('Descanso activo', new Set())).toBe('DESCANSO_ACTIVO');
    expect(profileCodeOf('Rest', new Set())).toBe('REST_2');
    expect(profileCodeOf('Training', new Set())).toBe('TRAINING_2');
    expect(profileCodeOf('3 sesiones', new Set())).toBe('P_3_SESIONES');
    expect(profileCodeOf('Competencia de resistencia larga', new Set())).toBe(
      'COMPETENCIA_DE_RESIS',
    );
    const rows: DayProfileRow[] = [
      { ...restProfileRow(TRAINING, 'a'), choG: '240' },
      { ...customProfileRow(TRAINING, 'b'), name: 'Alto', choG: '330' },
      { ...customProfileRow(TRAINING, 'c'), name: 'alto', choG: '330' },
    ];
    expect(dayProfilesBody(rows)?.map((p) => p.code)).toEqual(['REST', 'ALTO', 'ALTO_2']);
  });

  it('acepta la coma decimal; sin nombre o con gramos que no sirven no hay cuerpo y se dice por qué', () => {
    const rest = { ...restProfileRow(TRAINING, 'a'), choG: '240,5' };
    expect(dayProfilesBody([rest])?.[0]?.choG).toBe(240.5);
    expect(dayProfilesBody([{ ...rest, choG: '' }])).toBeNull();
    expect(dayProfileErrors({ ...rest, choG: '' })).toEqual({ choG: 'De 0 a 1000 g.' });
    expect(dayProfileErrors({ ...rest, proteinG: '-1', name: ' ' })).toEqual({
      name: 'Un nombre de hasta 40 caracteres.',
      proteinG: 'De 0 a 1000 g.',
    });
    expect(dayProfilesBody([])).toEqual([]);
  });

  it('quitar un perfil deja los demás en su orden', () => {
    const rows = [restProfileRow(TRAINING, 'a'), customProfileRow(TRAINING, 'b')];
    expect(withoutProfile(rows, 'a').map((r) => r.key)).toEqual(['b']);
  });
});
