import {
  ANAMNESIS_SECTIONS,
  parseDecimal,
  type AnamnesisAnswersV2,
  type AnamnesisCode,
  type AnamnesisModality,
  type AnamnesisQuestion,
} from '@nutricoach/contracts';

/** Lo que tiene el formulario: todo en texto, vacío si no se respondió. */
export type AnamnesisValues = Record<AnamnesisCode, string> & { modality: AnamnesisModality };

const QUESTIONS = ANAMNESIS_SECTIONS.flatMap((section) => section.questions);

/** Parte de la última anamnesis V2; sin ella, en blanco y presencial. */
export function valuesOf(answers: AnamnesisAnswersV2 | null): AnamnesisValues {
  const blanks = Object.fromEntries(
    QUESTIONS.map(({ code }) => {
      const answer = answers?.[code];
      return [code, answer === undefined ? '' : String(answer)];
    }),
  ) as Record<AnamnesisCode, string>;
  return { ...blanks, modality: answers?.modality ?? 'IN_PERSON' };
}

const answerOf = (question: AnamnesisQuestion, text: string): number | string | null => {
  if (question.kind === 'SCALE') return Number(text);
  if (question.kind === 'NUMBER') return parseDecimal(text);
  return text;
};

/** Lo que viaja a la API: lo vacío no viaja, porque una respuesta que falta no cuenta (RN-F16). */
export function answersOf(values: AnamnesisValues): AnamnesisAnswersV2 {
  const answered = QUESTIONS.flatMap((question) => {
    const text = values[question.code].trim();
    return text === '' ? [] : [[question.code, answerOf(question, text)] as const];
  });
  return { modality: values.modality, ...Object.fromEntries(answered) };
}

/** Un número dentro del rango de su pregunta, o vacío. Acepta coma o punto como decimal. */
export function numberProblem(
  question: Extract<AnamnesisQuestion, { kind: 'NUMBER' }>,
  text: string,
): true | string {
  if (text.trim() === '') return true;
  const value = parseDecimal(text);
  const { min, max, integer } = question;
  const fits = value !== null && value >= min && value <= max;
  if (integer) {
    return fits && Number.isInteger(value)
      ? true
      : `Escribe un número entero de ${String(min)} a ${String(max)}.`;
  }
  return fits ? true : `Escribe un número de ${String(min)} a ${String(max)}.`;
}

/** Una respuesta en palabras, para leer una revisión o compararla. */
export function answerText(
  question: AnamnesisQuestion,
  answer: number | string | undefined,
): string {
  if (answer === undefined || answer === '') return 'Sin responder';
  if (question.kind === 'SCALE') return `${String(answer)} de 5`;
  if (question.kind === 'OPTIONS') return question.options[String(answer)] ?? String(answer);
  return String(answer);
}
