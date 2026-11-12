import { domainError } from '@nutricoach/shared-kernel';
import type { ReportMesocycle } from './mesocycle-report.js';

/**
 * Las fotos de progreso (P14.5, PR 6b; P-30, respuestas de Rodrigo del 2026-11-10, 2026-11-11 y 2026-11-12; RN-G20): tres vistas por
 * cada mesociclo del programa, que suben el alumno y el coach desde la última semana del mesociclo. Una por vista: subir otra la
 * reemplaza. Con su consentimiento propio vigente; se borran al archivar al alumno o cuando lo revoca. Puro.
 */

export const PHOTO_VIEWS = ['FRONT', 'SIDE', 'BACK'] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export const isPhotoView = (value: string): value is PhotoView =>
  (PHOTO_VIEWS as readonly string[]).includes(value);

export interface ProgressPhotoRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly programLineageId: string;
  readonly mesocyclePosition: number;
  readonly view: PhotoView;
  readonly fileId: string;
  readonly uploadedBy: string;
  readonly uploadedByRole: 'PATIENT' | 'STAFF';
  readonly uploadedAt: Date;
}

/** Solo fotos: JPEG o PNG, por sus bytes (ADR-038). */
export const PHOTO_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

export const PHOTO_NOT_FOUND = domainError({
  code: 'NC-TRA-036',
  rule: 'RN-G20',
  message: 'Esa foto no existe para este alumno.',
});

export const PHOTO_MESOCYCLE_NOT_FOUND = domainError({
  code: 'NC-TRA-037',
  rule: 'RN-G20',
  message: 'Ese mesociclo no está en el programa publicado del alumno.',
});

export const PHOTOS_NOT_OPEN = domainError({
  code: 'NC-TRA-038',
  rule: 'RN-G20',
  message: 'Las fotos de un mesociclo se suben desde su última semana.',
});

export const PHOTO_UNSUPPORTED = domainError({
  code: 'NC-TRA-039',
  rule: 'RN-G20',
  message: 'La foto tiene que ser JPEG o PNG, de hasta 5 MB.',
});

/** Las fotos de un mesociclo se suben desde que empieza su última semana, en la fecha local del alumno («en cada cierre»). */
export function photosOpen(mesocycle: Pick<ReportMesocycle, 'weeks'>, today: string): boolean {
  const last = mesocycle.weeks.at(-1);
  return last !== undefined && last.weekStart <= today;
}
