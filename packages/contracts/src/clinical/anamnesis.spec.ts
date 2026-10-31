import {
  ALCOHOL_OPTIONS,
  CONSISTENCY_OPTIONS,
  DIET_PATTERN_OPTIONS,
  EXPERIENCE_OPTIONS,
  FRUIT_VEG_OPTIONS,
  NICOTINE_OPTIONS,
  PRI_JV,
  PROFILE_DOMAINS,
  PROTEIN_OPTIONS,
  runMethod,
  SCORED_QUESTIONS,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import {
  ANAMNESIS_SECTIONS,
  anamnesisAnswersV2Schema,
  PROFILE_DOMAIN_CODES,
  type AnamnesisCode,
  type AnamnesisQuestion,
} from './anamnesis.js';
import { clinicalHistoryAnswersV1Schema, saveClinicalHistorySchema } from './records.js';

const questions = ANAMNESIS_SECTIONS.flatMap((section) => section.questions);
const question = (code: AnamnesisCode): AnamnesisQuestion => {
  const found = questions.find((q) => q.code === code);
  if (!found) expect.fail(`Falta ${code} en el formulario.`);
  return found;
};
const optionsOf = (code: AnamnesisCode): string[] => {
  const found = question(code);
  return found.kind === 'OPTIONS' ? Object.keys(found.options) : [];
};

describe('RF-43 · 07 §12 · el formulario de la anamnesis V2', () => {
  it('trae las 43 preguntas de la hoja, sin correo, nombre, teléfono ni nacimiento', () => {
    const codes = questions.map((q) => q.code);

    expect(codes).toHaveLength(43);
    expect(new Set(codes).size).toBe(43);
    expect(codes).not.toEqual(expect.arrayContaining(['ID01']));
    expect(codes).toContain('ID05');
  });

  it('cada pregunta del formulario es un campo del esquema, y al revés', () => {
    const fields = Object.keys(anamnesisAnswersV2Schema.shape).filter((key) => key !== 'modality');

    expect([...questions.map((q) => q.code)].sort()).toEqual([...fields].sort());
  });

  it('RN-F16: las preguntas que puntúan son las 29 del motor; las de texto, ninguna', () => {
    const scored = questions.filter((q) => q.kind !== 'TEXT').map((q) => q.code);

    expect([...scored].sort()).toEqual(
      [...SCORED_QUESTIONS, 'G01'].sort(), // G01 elige la tabla de fases, no puntúa
    );
  });

  it('RN-F16: cada opción es la que puntúa el motor', () => {
    expect(optionsOf('E01')).toEqual([...EXPERIENCE_OPTIONS]);
    expect(optionsOf('E02')).toEqual([...CONSISTENCY_OPTIONS]);
    expect(optionsOf('L03')).toEqual([...ALCOHOL_OPTIONS]);
    expect(optionsOf('L04')).toEqual([...NICOTINE_OPTIONS]);
    expect(optionsOf('N01')).toEqual([...DIET_PATTERN_OPTIONS]);
    expect([...optionsOf('N02')].sort()).toEqual([...PROTEIN_OPTIONS].sort());
    expect([...optionsOf('N03')].sort()).toEqual([...FRUIT_VEG_OPTIONS].sort());
    expect(PROFILE_DOMAIN_CODES).toEqual(PROFILE_DOMAINS);
  });
});

describe('RF-43 · las respuestas de la anamnesis V2', () => {
  const parse = (answers: object) =>
    anamnesisAnswersV2Schema.safeParse({ modality: 'IN_PERSON', ...answers });

  it('RN-F16: se guardan aunque falten respuestas; basta decir si fue presencial u online', () => {
    expect(parse({}).success).toBe(true);
    expect(anamnesisAnswersV2Schema.safeParse({ modality: 'ONLINE' }).success).toBe(true);
    expect(anamnesisAnswersV2Schema.safeParse({}).success).toBe(false);
    expect(anamnesisAnswersV2Schema.safeParse({ modality: 'POR_TELEFONO' }).success).toBe(false);
  });

  it.each([
    [{ G03: 0 }],
    [{ G03: 6 }],
    [{ G03: 3.5 }],
    [{ A01: 8 }],
    [{ A01: 2.5 }],
    [{ A02: -1 }],
    [{ R01: 25 }],
    [{ L01: 25 }],
    [{ N04: 21 }],
    [{ E01: 'MUCHA' }],
    [{ G01: 'NADAR' }],
  ])('rechaza %j', (answers) => {
    expect(parse(answers).success).toBe(false);
  });

  it('acepta decimales donde la hoja los permite', () => {
    expect(parse({ R01: 7.5, L01: 6.5, N04: 1.5 }).success).toBe(true);
  });

  it('la historia v1 queda de solo lectura: sus bloques ya no se pueden guardar', () => {
    const blocks = { sleep: 'Duerme 6 horas.' };

    expect(clinicalHistoryAnswersV1Schema.safeParse(blocks).success).toBe(true);
    expect(parse(blocks).success).toBe(false);
    expect(
      saveClinicalHistorySchema.safeParse({ expectedRevision: 1, answers: blocks }).success,
    ).toBe(false);
  });

  it('todo lo que acepta el contrato lo acepta el motor, en los extremos de cada rango', () => {
    const extremes = (pick: (q: { min: number; max: number }) => number) =>
      Object.fromEntries(
        questions.flatMap((q): [string, number | string][] => {
          if (q.kind === 'SCALE') return [[q.code, pick({ min: 1, max: 5 })]];
          if (q.kind === 'NUMBER') return [[q.code, pick(q)]];
          if (q.kind === 'OPTIONS' && q.code !== 'G01') {
            return [[q.code, Object.keys(q.options)[0] ?? '']];
          }
          return [];
        }),
      );

    for (const answers of [extremes((q) => q.min), extremes((q) => q.max)]) {
      expect(parse(answers).success).toBe(true);
      expect(runMethod(PRI_JV, { answers }).ok).toBe(true);
    }
  });
});
