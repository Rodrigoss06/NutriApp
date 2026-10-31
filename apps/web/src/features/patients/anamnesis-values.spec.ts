import { ANAMNESIS_SECTIONS, type AnamnesisQuestion } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { answersOf, answerText, numberProblem, valuesOf } from './anamnesis-values';

const question = (code: string): AnamnesisQuestion => {
  const found = ANAMNESIS_SECTIONS.flatMap((s) => s.questions).find((q) => q.code === code);
  if (!found) expect.fail(`Falta ${code}`);
  return found;
};
const numeric = (code: string) => {
  const found = question(code);
  if (found.kind !== 'NUMBER') expect.fail(`${code} no es numérica`);
  return found;
};

describe('RF-43 · lo que escribe el coach en la anamnesis', () => {
  it('RN-F16: lo vacío no viaja, porque una respuesta que falta no cuenta', () => {
    expect(answersOf(valuesOf(null))).toEqual({ modality: 'IN_PERSON' });
  });

  it('convierte cada respuesta a su tipo y acepta la coma decimal', () => {
    expect(
      answersOf({
        ...valuesOf(null),
        modality: 'ONLINE',
        G02: '  Volver a correr. ',
        G03: '4',
        A01: '3',
        R01: '7,5',
        E01: 'Y1_3',
        G05: '   ',
      }),
    ).toEqual({
      modality: 'ONLINE',
      G02: 'Volver a correr.',
      G03: 4,
      A01: 3,
      R01: 7.5,
      E01: 'Y1_3',
    });
  });

  it('una revisión vuelve al formulario tal como se guardó', () => {
    const answers = { modality: 'ONLINE', G03: 4, R01: 7.5, E01: 'Y1_3', G02: 'Texto' } as const;

    expect(answersOf(valuesOf(answers))).toEqual(answers);
    expect(valuesOf(answers)).toMatchObject({ G03: '4', R01: '7.5', A01: '' });
  });

  it('avisa si el número no entra en el rango de la pregunta o debe ser entero', () => {
    expect(numberProblem(numeric('A01'), '')).toBe(true);
    expect(numberProblem(numeric('A01'), '4')).toBe(true);
    expect(numberProblem(numeric('A01'), '8')).toBe('Escribe un número entero de 0 a 7.');
    expect(numberProblem(numeric('A01'), '2.5')).toBe('Escribe un número entero de 0 a 7.');
    expect(numberProblem(numeric('A01'), 'tres')).toBe('Escribe un número entero de 0 a 7.');
    expect(numberProblem(numeric('R01'), '7,5')).toBe(true);
    expect(numberProblem(numeric('R01'), '25')).toBe('Escribe un número de 0 a 24.');
  });

  it('una respuesta se lee en palabras', () => {
    expect(answerText(question('G03'), 4)).toBe('4 de 5');
    expect(answerText(question('E01'), 'Y1_3')).toBe('1 a 3 años');
    expect(answerText(question('R01'), 7.5)).toBe('7.5');
    expect(answerText(question('G02'), undefined)).toBe('Sin responder');
  });
});
