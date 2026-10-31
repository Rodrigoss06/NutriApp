import {
  parseDecimal,
  saveAthleteProfileSchema,
  type AthleteProfile,
  type SaveAthleteProfile,
} from '@nutricoach/contracts';

/** El formulario del perfil de entrenamiento: todo texto hasta que se valida contra el contrato (07 §2). */
export interface ProfileValues {
  readonly objective: string;
  readonly level: string;
  readonly daysPerWeek: string;
  readonly minutesPerSession: string;
  readonly equipmentCodes: string[];
  readonly startDate: string;
  readonly macrocycleWeeks: string;
  readonly medicalClearance: string;
  readonly alarmSymptoms: boolean;
  readonly injuriesNote: string;
  readonly restrictionsNote: string;
  readonly baselineWeightKg: string;
  readonly baselineRestingHrBpm: string;
  readonly baselineHrvMs: string;
  readonly sleepTargetHours: string;
  readonly testTargets: Readonly<Record<string, string>>;
  readonly notes: string;
}

const text = (value: number | null): string => (value === null ? '' : String(value));

/** Lo guardado, para editarlo; sin perfil, los valores por defecto de la tabla y lo demás por elegir. */
export function valuesOf(current: AthleteProfile | null): ProfileValues {
  return {
    objective: current?.objective ?? '',
    level: current?.level ?? '',
    daysPerWeek: text(current?.daysPerWeek ?? null),
    minutesPerSession: text(current?.minutesPerSession ?? null),
    equipmentCodes: [...(current?.equipmentCodes ?? [])],
    startDate: current?.startDate ?? '',
    macrocycleWeeks: text(current?.macrocycleWeeks ?? 12),
    medicalClearance: current?.medicalClearance ?? 'PENDING',
    alarmSymptoms: current?.alarmSymptoms ?? false,
    injuriesNote: current?.injuriesNote ?? '',
    restrictionsNote: current?.restrictionsNote ?? '',
    baselineWeightKg: text(current?.baselineWeightKg ?? null),
    baselineRestingHrBpm: text(current?.baselineRestingHrBpm ?? null),
    baselineHrvMs: text(current?.baselineHrvMs ?? null),
    sleepTargetHours: text(current?.sleepTargetHours ?? 8),
    testTargets: Object.fromEntries(
      Object.entries(current?.testTargets ?? {}).map(([code, value]) => [code, String(value)]),
    ),
    notes: current?.notes ?? '',
  };
}

/** Vacío es null; lo que no se lee como número no pasa el contrato. */
const numberOf = (value: string): number | null => {
  if (value.trim() === '') return null;
  return parseDecimal(value) ?? Number.NaN;
};

/** Qué decir de cada campo: también es su ayuda. */
export const PROFILE_HINTS = {
  objective: 'Elige el objetivo.',
  level: 'Elige el nivel.',
  daysPerWeek: 'Elige de 2 a 5 días.',
  minutesPerSession: 'De 30 a 120 minutos. Es informativo.',
  baselineWeightKg: 'De 20 a 300 kg, con hasta 2 decimales.',
  baselineRestingHrBpm: 'De 25 a 220 latidos por minuto, sin decimales.',
  baselineHrvMs: 'Un número mayor que 0 y hasta 9999, con hasta 1 decimal.',
  sleepTargetHours: 'De 4 a 12 horas, con hasta 1 decimal.',
  testTargets: 'Usa números de 0 en adelante.',
} as const;

export type ProfileProblems = Readonly<Partial<Record<keyof ProfileValues, string>>>;

/** Valida con el mismo contrato que la API y devuelve el cuerpo, o el problema de cada campo. */
export function parseProfile(
  values: ProfileValues,
  expectedRevision: number,
): { ok: true; body: SaveAthleteProfile } | { ok: false; problems: ProfileProblems } {
  const parsed = saveAthleteProfileSchema.safeParse({
    expectedRevision,
    objective: values.objective,
    level: values.level,
    daysPerWeek: numberOf(values.daysPerWeek),
    minutesPerSession: numberOf(values.minutesPerSession),
    equipmentCodes: values.equipmentCodes,
    startDate: values.startDate || null,
    macrocycleWeeks: numberOf(values.macrocycleWeeks),
    medicalClearance: values.medicalClearance,
    alarmSymptoms: values.alarmSymptoms,
    injuriesNote: values.injuriesNote,
    restrictionsNote: values.restrictionsNote,
    baselineWeightKg: numberOf(values.baselineWeightKg),
    baselineRestingHrBpm: numberOf(values.baselineRestingHrBpm),
    baselineHrvMs: numberOf(values.baselineHrvMs),
    sleepTargetHours: numberOf(values.sleepTargetHours),
    testTargets: Object.fromEntries(
      Object.entries(values.testTargets).flatMap(([code, target]) => {
        const value = numberOf(target);
        return value === null ? [] : [[code, value]];
      }),
    ),
    notes: values.notes,
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  const problems: Partial<Record<keyof ProfileValues, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]) as keyof ProfileValues;
    problems[field] ??=
      (PROFILE_HINTS as Readonly<Record<string, string>>)[field] ?? 'Revisa este dato.';
  }
  return { ok: false, problems };
}
