import { Inject, Injectable } from '@nestjs/common';
import type { CompendiumActivity } from '../domain/compendium-activity.js';

/** Actividad del Compendium 2024 con su MET (exercise.physical_activity). */
export interface PhysicalActivityRecord {
  readonly code: string;
  readonly majorHeading: string;
  readonly descriptionEs: string;
  readonly met: number;
  readonly sourceVersion: string;
}

/** El catálogo global de actividades: lo leen todos y lo escribe solo el importador, como SYSTEM (RN-I01). */
export interface PhysicalActivityStore {
  search(text: string | null): Promise<readonly PhysicalActivityRecord[]>;
  byCodes(codes: readonly string[]): Promise<readonly PhysicalActivityRecord[]>;
  /** Inserta o actualiza por código, dentro de la transacción del lote de importación (RN-I04). */
  upsert(activities: readonly CompendiumActivity[], sourceVersion: string): Promise<void>;
}

export const PHYSICAL_ACTIVITY_STORE = Symbol.for('nutricoach.exercise.PhysicalActivityStore');

/**
 * API pública de exercise (02 §2): actividades con MET para el gasto por ejercicio (RN-E03). P8 carga el Compendium
 * completo y P12 la biblioteca de ejercicios. Se llama dentro de la transacción de quien la usa.
 */
@Injectable()
export class ExerciseApi {
  constructor(
    @Inject(PHYSICAL_ACTIVITY_STORE) private readonly activities: PhysicalActivityStore,
  ) {}

  /** Búsqueda sin tildes en la descripción; sin texto, todo el catálogo. */
  searchActivities(text: string | null): Promise<readonly PhysicalActivityRecord[]> {
    return this.activities.search(text?.trim() ? text.trim() : null);
  }

  activitiesByCode(codes: readonly string[]): Promise<readonly PhysicalActivityRecord[]> {
    return this.activities.byCodes(codes);
  }
}
