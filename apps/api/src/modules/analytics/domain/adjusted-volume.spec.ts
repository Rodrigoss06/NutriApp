import { describe, expect, it } from 'vitest';
import {
  factorsOn,
  prescribedRest,
  type FactorVersion,
  type RestSource,
} from './adjusted-volume.js';

const version = (id: string, organizationId: string | null, validFrom: string): FactorVersion => ({
  id,
  organizationId,
  validFrom,
  rir: [{ from: 2, factor: 1.1, orMore: false }],
  rest: [{ from: 120, factor: 1, orMore: false }],
});

describe('ADR-106 · la tabla de factores vigente cada día (P-26)', () => {
  const versions = [
    version('global-1', null, '2026-01-01'),
    version('global-2', null, '2026-11-01'),
    version('propia', 'org-1', '2026-10-15'),
  ];

  it('la de la organización manda sobre la global desde que vale; antes, la global de ese día', () => {
    expect(factorsOn(versions, '2026-10-01')?.id).toBe('global-1');
    expect(factorsOn(versions, '2026-10-15')?.id).toBe('propia');
    expect(factorsOn(versions, '2026-11-05')?.id).toBe('propia');
  });

  it('sin la de la organización, la global más reciente; antes de todas, ninguna', () => {
    const global = versions.filter((v) => v.organizationId === null);
    expect(factorsOn(global, '2026-11-05')?.id).toBe('global-2');
    expect(factorsOn(global, '2025-12-31')).toBeNull();
  });
});

describe('ADR-106 · el descanso prescrito de una serie registrada', () => {
  const program: RestSource = {
    mesocycles: [
      {
        weeks: [
          {
            sessions: [
              {
                id: 's-1',
                exercises: [
                  {
                    exerciseId: 'squat',
                    sets: [
                      { setNo: 1, restSeconds: 120 },
                      { setNo: 2, restSeconds: 120 },
                      { setNo: 3, restSeconds: 90 },
                    ],
                  },
                ],
              },
              {
                id: 's-2',
                exercises: [{ exerciseId: 'row', sets: [{ setNo: 1, restSeconds: 75 }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('es el de la serie con su número, en el ejercicio de su sesión', () => {
    expect(prescribedRest(program, 's-1', 'squat', 3)).toBe(90);
    expect(prescribedRest(program, 's-2', 'row', 1)).toBe(75);
  });

  it('si hizo más series que las prescritas, el de la última; sin sesión, el ejercicio en el programa', () => {
    expect(prescribedRest(program, 's-1', 'squat', 5)).toBe(90);
    expect(prescribedRest(program, null, 'row', 1)).toBe(75);
  });

  it('sin programa o sin ese ejercicio no hay descanso: la serie queda «sin factor»', () => {
    expect(prescribedRest(null, 's-1', 'squat', 1)).toBeNull();
    expect(prescribedRest(program, 's-1', 'row', 1)).toBeNull();
    expect(prescribedRest(program, null, 'bench', 1)).toBeNull();
  });
});
