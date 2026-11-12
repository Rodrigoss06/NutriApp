import type { PhotoView, ProgressPhotoRecord } from '../../domain/progress-photo.js';

/** training.progress_photo, en la transacción de quien llama y con su RLS (el alumno ve y sube solo las suyas). */
export interface ProgressPhotoStore {
  insert(photo: ProgressPhotoRecord): Promise<void>;
  find(id: string): Promise<ProgressPhotoRecord | null>;
  byView(lineageId: string, position: number, view: PhotoView): Promise<ProgressPhotoRecord | null>;
  /** Reemplaza el archivo de una foto: la subida nueva de la misma vista y mesociclo. */
  replace(
    id: string,
    file: {
      readonly fileId: string;
      readonly uploadedBy: string;
      readonly uploadedByRole: 'PATIENT' | 'STAFF';
      readonly uploadedAt: Date;
    },
  ): Promise<void>;
  /** Las del paciente, por mesociclo y vista. */
  ofPatient(patientId: string): Promise<readonly ProgressPhotoRecord[]>;
  /** Borra todas las del paciente y devuelve cuáles eran (RN-G20: al archivarlo o al revocar). */
  deleteOfPatient(patientId: string): Promise<readonly ProgressPhotoRecord[]>;
}

export const PROGRESS_PHOTO_STORE = Symbol('PROGRESS_PHOTO_STORE');
