import { MOVEMENT_PATTERNS, TRAINING_LEVELS, ROUTINE_TEMPLATE_VERSION } from '@nutricoach/engine';
import { isErr, isOk } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import phasesSeed from '../../../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import type { StoredPhase } from './ports/program.ports.js';
import { currentPhaseTable, proposedProgram, type ProposalInput } from './program-proposal.js';

const V3: readonly StoredPhase[] = phasesSeed.phases.map((phase) => ({
  ...phase,
  validFrom: phasesSeed.validFrom,
  own: false,
})) as readonly StoredPhase[];

const CHOICES = MOVEMENT_PATTERNS.flatMap((pattern) =>
  TRAINING_LEVELS.map((level) => ({
    pattern,
    level,
    exercise: { id: `${pattern}-${level}` },
  })),
);

const counter = () => {
  let next = 0;
  return () => `id-${String((next += 1))}`;
};

const input = (changes: Partial<ProposalInput> = {}): ProposalInput => ({
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 4,
  macrocycleWeeks: 12,
  phases: V3,
  choices: CHOICES,
  newId: counter(),
  ...changes,
});

const proposed = (changes: Partial<ProposalInput> = {}) => {
  const result = proposedProgram(input(changes));
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('RN-F13 · qué versión de la tabla de fases vale', () => {
  const row = (validFrom: string, own: boolean) => ({ ...V3[0], validFrom, own }) as StoredPhase;

  it('la más reciente de la V3 si la organización no tiene la suya', () => {
    const rows = [row('2026-10-15', false), row('2026-11-01', false)];

    expect(currentPhaseTable(rows).map((r) => r.validFrom)).toEqual(['2026-11-01']);
  });

  it('la de la organización, aunque la de la V3 sea más nueva', () => {
    const rows = [row('2026-11-01', false), row('2026-10-20', true), row('2026-10-25', true)];

    expect(currentPhaseTable(rows)).toEqual([row('2026-10-25', true)]);
  });

  it('sin filas, nada', () => {
    expect(currentPhaseTable([])).toEqual([]);
  });
});

describe('RN-F14 · RN-F13 · la propuesta como programa', () => {
  it('guarda la división, la plantilla y la versión de la tabla que usó', () => {
    expect(proposed()).toMatchObject({
      split: 'UPPER_LOWER',
      templateVersion: ROUTINE_TEMPLATE_VERSION,
      periodizationValidFrom: phasesSeed.validFrom,
    });
  });

  it('los mesociclos terminan en descarga, y las semanas siguen la tabla', () => {
    const { mesocycles } = proposed();

    expect(mesocycles.map((m) => m.name)).toEqual(['Mesociclo 1', 'Mesociclo 2', 'Mesociclo 3']);
    expect(mesocycles.map((m) => m.position)).toEqual([1, 2, 3]);
    expect(mesocycles.map((m) => m.weeks.map((w) => w.weekNo))).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9],
      [10, 11, 12],
    ]);
    expect(mesocycles[0]?.weeks[4]).toMatchObject({ isDeload: true, phaseEs: 'Descarga' });
  });

  it('cada bloque lleva el ejercicio de la tabla, su patrón y nada aprobado', () => {
    const block = proposed().mesocycles[0]?.weeks[0]?.sessions[0]?.exercises[0];

    expect(block).toMatchObject({
      position: 1,
      exerciseId: 'SQUAT-BEGINNER',
      suggestedExerciseId: 'SQUAT-BEGINNER',
      movementPattern: 'SQUAT',
      approvedBy: null,
      approvedAt: null,
    });
  });

  it('P-06 · ADR-070: las series según el factor de la semana y el RIR de su semana', () => {
    const weeks = proposed().mesocycles.flatMap((m) => m.weeks);
    const setsOf = (weekNo: number) =>
      weeks.find((w) => w.weekNo === weekNo)?.sessions[0]?.exercises[0]?.sets ?? [];

    // Hipertrofia: semana 1, factor 0.75 y RIR 3; semana 3, factor 1 y RIR 2; semana 12, factor 0.6 y RIR 4.
    expect(setsOf(1)).toHaveLength(2);
    expect(setsOf(1)[0]).toMatchObject({ setNo: 1, loadKind: 'RIR', loadValue: 3 });
    expect(setsOf(3)).toHaveLength(3);
    expect(setsOf(3)[0]).toMatchObject({
      repsMin: 8,
      repsMax: 12,
      loadValue: 2,
      restSeconds: 90,
      tempo: '2-1-2',
      setType: 'WORKING',
    });
    expect(setsOf(3).map((set) => set.setNo)).toEqual([1, 2, 3]);
    expect(setsOf(12)).toHaveLength(2);
    expect(setsOf(12)[0]?.loadValue).toBe(4);
  });

  it('P-07: con menos de 12 semanas la tabla se corta', () => {
    const { mesocycles } = proposed({ macrocycleWeeks: 8 });

    expect(mesocycles.flatMap((m) => m.weeks).map((w) => w.weekNo)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(mesocycles.map((m) => m.weeks.length)).toEqual([5, 3]);
  });

  it('sin una fila de la tabla patrón × nivel no hay propuesta, y dice cuál falta', () => {
    const result = proposedProgram(
      input({ choices: CHOICES.filter((choice) => choice.pattern !== 'SQUAT') }),
    );

    expect(isErr(result) && result.error).toMatchObject({
      code: 'NC-TRA-018',
      details: { problems: ['No hay ejercicio para SQUAT.'] },
    });
  });

  it('una tabla de fases a medias es un error de datos, con su código', () => {
    const result = proposedProgram(input({ phases: V3.filter((phase) => phase.weekNo !== 3) }));

    expect(isErr(result) && result.error.code).toBe('NC-TRA-019');
    expect(isOk(proposedProgram(input()))).toBe(true);
  });

  it('otro error del motor no se esconde', () => {
    const boom = () => {
      throw new TypeError('boom');
    };
    const phases = new Proxy([...V3], {
      get(target, property, receiver) {
        if (property === 'filter') return boom;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });

    expect(() => proposedProgram(input({ phases }))).toThrow('boom');
  });
});
