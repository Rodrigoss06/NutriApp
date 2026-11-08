/**
 * Perfiles de día del plan (07 §2; P-20, respuestas de Jeremy del 2026-11-08). Entrenamiento es la meta de la prescripción y
 * no se define aquí; Descanso (REST) y los propios del coach (alto, medio, bajo, refeed, competencia...) llevan sus gramos, y
 * las kcal salen de ellos (P-20.2). Las sesiones del programa y, después, las fechas eligen el perfil de cada día por su código.
 */
export interface DayProfileDraft {
  /** REST para el descanso; los propios, el que les da el coach. */
  readonly code: string;
  readonly name: string;
  readonly choG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

/** El código de Entrenamiento: la meta de la prescripción. */
export const TRAINING_PROFILE_CODE = 'TRAINING';
/** El código de Descanso: el de los días sin sesión (07 §8). */
export const REST_PROFILE_CODE = 'REST';
export const MAX_DAY_PROFILES = 6;
/** Mayúsculas, dígitos y guion bajo, empezando con una letra: el código viaja a las sesiones del programa. */
export const DAY_PROFILE_CODE = /^[A-Z][A-Z0-9_]{0,19}$/;

/** Lo que impide guardar los perfiles de un plan, en el orden en que se revisa. */
export function dayProfileProblems(profiles: readonly DayProfileDraft[]): readonly string[] {
  const problems: string[] = [];
  if (profiles.length > MAX_DAY_PROFILES) {
    problems.push(
      `Un plan tiene hasta ${String(MAX_DAY_PROFILES)} perfiles de día además de Entrenamiento.`,
    );
  }
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const profile of profiles) {
    const name = profile.name.trim();
    if (name === '' || name.length > 40) {
      problems.push('Cada perfil lleva un nombre de hasta 40 caracteres.');
    } else if (names.has(name.toLocaleLowerCase('es'))) {
      problems.push(`Dos perfiles no pueden llamarse igual (${name}).`);
    }
    names.add(name.toLocaleLowerCase('es'));
    if (profile.code === TRAINING_PROFILE_CODE) {
      problems.push('Entrenamiento es la meta de la prescripción: no se define como perfil.');
    } else if (!DAY_PROFILE_CODE.test(profile.code)) {
      problems.push(
        `El código del perfil «${name}» va en mayúsculas, sin espacios ni tildes, y empieza con una letra.`,
      );
    } else if (codes.has(profile.code)) {
      problems.push(`Dos perfiles no pueden tener el mismo código (${profile.code}).`);
    }
    codes.add(profile.code);
  }
  return problems;
}
