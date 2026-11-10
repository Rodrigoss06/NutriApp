/**
 * Lo que necesita el volumen ajustado de cada serie (P14.5, P-26; ADR-106): la tabla de factores vigente ese día y el descanso
 * prescrito de la serie. Puro: el snapshot y las versiones llegan como datos, en tipos estructurales (02 §4).
 */

export interface FactorRow {
  readonly from: number;
  readonly factor: number;
  readonly orMore: boolean;
}

export interface FactorVersion {
  readonly id: string;
  /** null: la global, con los valores de Jeremy. */
  readonly organizationId: string | null;
  readonly validFrom: string;
  readonly rir: readonly FactorRow[];
  readonly rest: readonly FactorRow[];
}

const latestOn = (versions: readonly FactorVersion[], localDate: string): FactorVersion | null =>
  versions
    .filter((version) => version.validFrom <= localDate)
    .reduce<FactorVersion | null>(
      (latest, version) =>
        latest === null || version.validFrom >= latest.validFrom ? version : latest,
      null,
    );

/** La tabla vigente ese día: la más reciente de la organización si ya vale; si no, la global más reciente. */
export function factorsOn(
  versions: readonly FactorVersion[],
  localDate: string,
): FactorVersion | null {
  return (
    latestOn(
      versions.filter((version) => version.organizationId !== null),
      localDate,
    ) ??
    latestOn(
      versions.filter((version) => version.organizationId === null),
      localDate,
    )
  );
}

/** Lo que se usa del snapshot del programa publicado (RN-F12). */
export interface RestSource {
  readonly mesocycles: readonly {
    readonly weeks: readonly {
      readonly sessions: readonly {
        readonly id: string;
        readonly exercises: readonly {
          readonly exerciseId: string;
          readonly sets: readonly { readonly setNo: number; readonly restSeconds: number | null }[];
        }[];
      }[];
    }[];
  }[];
}

/**
 * El descanso prescrito de una serie registrada: en el programa con que se registró, la serie con su número en el ejercicio de su
 * sesión; si el paciente hizo más series que las prescritas, la última. Sin sesión, el ejercicio donde aparece primero en el
 * programa. Sin programa o sin ese ejercicio, null: la serie queda «sin factor».
 */
export function prescribedRest(
  program: RestSource | null,
  sessionId: string | null,
  exerciseId: string,
  setNo: number,
): number | null {
  if (!program) return null;
  const sessions = program.mesocycles
    .flatMap((mesocycle) => mesocycle.weeks)
    .flatMap((week) => week.sessions)
    .filter((session) => sessionId === null || session.id === sessionId);
  const exercise = sessions
    .flatMap((session) => session.exercises)
    .find((candidate) => candidate.exerciseId === exerciseId);
  if (!exercise) return null;
  const set = exercise.sets.find((candidate) => candidate.setNo === setNo) ?? exercise.sets.at(-1);
  return set?.restSeconds ?? null;
}
