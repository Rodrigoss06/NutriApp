import {
  PHOTO_VIEW_LABELS,
  PHOTO_VIEWS,
  type PhotoView,
  type ProgressPhotosResponse,
} from '@nutricoach/contracts';

/** De dónde sale cada foto: el equipo y el alumno la piden por rutas distintas, siempre por la API (ADR-038). */
export type PhotoAudience = 'staff' | 'patient';

export const photoFileUrl = (id: string, audience: PhotoAudience): string =>
  audience === 'staff'
    ? `/api/v1/progress-photos/${id}/file`
    : `/api/v1/me/progress-photos/${id}/file`;

export interface PhotoRef {
  readonly id: string;
  readonly programName: string;
  readonly mesocycleName: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface ViewComparison {
  readonly view: PhotoView;
  readonly label: string;
  /** La del mesociclo más antiguo con foto de esa vista, y la del más reciente; con una sola, no hay comparación. */
  readonly initial: PhotoRef | null;
  readonly current: PhotoRef | null;
}

const DAY_MS = 86_400_000;

/** El primer día de la última semana de un mesociclo: desde ahí se suben sus fotos (RN-G20). */
export const lastWeekStart = (endDate: string): string =>
  new Date(Date.parse(`${endDate}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);

function refsOf(response: ProgressPhotosResponse): (PhotoRef & { view: PhotoView })[] {
  return response.photos.flatMap((photo) => {
    const program = response.programs.find((p) => p.lineageId === photo.programLineageId);
    const mesocycle = program?.mesocycles.find((m) => m.position === photo.mesocyclePosition);
    return program && mesocycle
      ? [
          {
            id: photo.id,
            view: photo.view,
            programName: program.name,
            mesocycleName: mesocycle.name,
            startDate: mesocycle.startDate,
            endDate: mesocycle.endDate,
          },
        ]
      : [];
  });
}

/** La comparativa por vista (P-30): la foto del primer mesociclo frente a la del último, en orden de fechas. */
export function photoComparison(response: ProgressPhotosResponse): readonly ViewComparison[] {
  const refs = refsOf(response).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return PHOTO_VIEWS.map((view) => {
    const ofView = refs.filter((ref) => ref.view === view);
    const first = ofView[0] ?? null;
    const last = ofView.at(-1) ?? null;
    return {
      view,
      label: PHOTO_VIEW_LABELS[view],
      initial: first && last && first.id !== last.id ? first : null,
      current: last,
    };
  });
}

export interface PhotoSlotRow {
  readonly position: number;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly open: boolean;
  /** Desde cuándo se suben sus fotos. */
  readonly opensOn: string;
  readonly slots: readonly {
    readonly view: PhotoView;
    readonly label: string;
    readonly photoId: string | null;
  }[];
}

/** Los mesociclos del programa publicado con sus tres vistas: donde se sube o se reemplaza cada foto. */
export function photoSlots(response: ProgressPhotosResponse): readonly PhotoSlotRow[] {
  const current = response.programs.find((program) => program.current);
  if (!current) return [];
  return current.mesocycles.map((mesocycle) => ({
    position: mesocycle.position,
    name: mesocycle.name,
    startDate: mesocycle.startDate,
    endDate: mesocycle.endDate,
    open: mesocycle.open,
    opensOn: lastWeekStart(mesocycle.endDate),
    slots: PHOTO_VIEWS.map((view) => ({
      view,
      label: PHOTO_VIEW_LABELS[view],
      photoId:
        response.photos.find(
          (photo) =>
            photo.programLineageId === current.lineageId &&
            photo.mesocyclePosition === mesocycle.position &&
            photo.view === view,
        )?.id ?? null,
    })),
  }));
}

/** El tamaño al que se achica una foto antes de subirla: el lado mayor hasta `max` píxeles, sin agrandarla. */
export function fittedSize(
  width: number,
  height: number,
  max: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
