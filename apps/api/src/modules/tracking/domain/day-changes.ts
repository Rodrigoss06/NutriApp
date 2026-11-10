/**
 * Los cambios del día (07 §8, P-20.3 y P-20.4; ADR-104): «no entreno hoy» y «mover a mañana», que piden el paciente o el coach para
 * hoy, y el perfil de día que el coach elige para hoy o para mañana. Nunca se aplican solos: sin cambios, manda el programa.
 */
export type DayChangeKind = 'NOT_TRAINING' | 'MOVED' | 'PROFILE';

export interface DayChange {
  readonly id: string;
  /** YYYY-MM-DD: el día que cambia; en MOVED, el día del que sale la sesión hacia el siguiente. */
  readonly localDate: string;
  readonly kind: DayChangeKind;
  /** El perfil que eligió el coach; solo en PROFILE. */
  readonly dayProfileCode: string | null;
  /** Entre los cambios que tocan un mismo día, manda el último. */
  readonly createdAt: Date;
}

const MS_PER_DAY = 86_400_000;

/** Un día a `days` días de otro, como YYYY-MM-DD. */
export function addDays(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** La sesión que llegó a ese día desde el anterior («mover a mañana»). */
export function movedInto(changes: readonly DayChange[], localDate: string): DayChange | null {
  return (
    changes.find(
      (change) => change.kind === 'MOVED' && addDays(change.localDate, 1) === localDate,
    ) ?? null
  );
}

/** La sesión de ese día que pasó al siguiente. */
export function movedFrom(changes: readonly DayChange[], localDate: string): DayChange | null {
  return (
    changes.find((change) => change.kind === 'MOVED' && change.localDate === localDate) ?? null
  );
}

/** El último cambio que toca ese día: el suyo («no entreno hoy» o el perfil), la sesión que se fue o la que llegó. */
export function latestChangeOn(changes: readonly DayChange[], localDate: string): DayChange | null {
  let latest: DayChange | null = null;
  for (const change of changes) {
    const touches =
      change.localDate === localDate ||
      (change.kind === 'MOVED' && addDays(change.localDate, 1) === localDate);
    if (touches && (latest === null || change.createdAt.getTime() >= latest.createdAt.getTime())) {
      latest = change;
    }
  }
  return latest;
}
