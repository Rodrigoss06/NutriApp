import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

export type TrainingObjective = 'FAT_LOSS' | 'HYPERTROPHY' | 'STRENGTH' | 'HEALTH';
export type TrainingLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type MedicalClearance = 'PENDING' | 'CLEARED' | 'NOT_REQUIRED';

/** Lo que controla la propuesta y el macrociclo (07 §2), ya validado en su forma por el contrato. */
export interface AthleteProfileInput {
  readonly objective: TrainingObjective;
  readonly level: TrainingLevel;
  readonly daysPerWeek: number;
  readonly minutesPerSession: number | null;
  readonly equipmentCodes: readonly string[];
  readonly startDate: string | null;
  readonly macrocycleWeeks: number;
  readonly medicalClearance: MedicalClearance;
  readonly alarmSymptoms: boolean;
  readonly injuriesNote: string | null;
  readonly restrictionsNote: string | null;
  readonly baselineWeightKg: number | null;
  readonly baselineRestingHrBpm: number | null;
  readonly baselineHrvMs: number | null;
  readonly sleepTargetHours: number;
  readonly testTargets: Readonly<Record<string, number>>;
  readonly notes: string | null;
}

export const PROFILE_REVISION_CONFLICT = domainError({
  code: 'NC-TRA-001',
  message: 'Alguien guardó el perfil mientras lo editabas. Vuelve a cargarlo.',
});
export const INVALID_ATHLETE_PROFILE = 'NC-TRA-002';

/** Los catálogos que un perfil debe respetar. */
export interface AthleteProfileReferences {
  readonly equipmentCodes: ReadonlySet<string>;
  readonly physicalTestCodes: ReadonlySet<string>;
}

/** El equipamiento y las pruebas físicas del perfil existen en sus catálogos (07 §2, §4). */
export function checkAthleteProfile(
  input: AthleteProfileInput,
  references: AthleteProfileReferences,
): Result<AthleteProfileInput, DomainError> {
  const problems = [
    ...input.equipmentCodes
      .filter((code) => !references.equipmentCodes.has(code))
      .map((code) => `${code} no es un equipo.`),
    ...Object.keys(input.testTargets)
      .filter((code) => !references.physicalTestCodes.has(code))
      .map((code) => `${code} no es una prueba física.`),
  ];
  if (problems.length > 0) {
    return err(
      domainError({
        code: INVALID_ATHLETE_PROFILE,
        message: 'Revisa los datos del perfil.',
        details: { problems },
      }),
    );
  }
  return ok({ ...input, equipmentCodes: [...new Set(input.equipmentCodes)] });
}
