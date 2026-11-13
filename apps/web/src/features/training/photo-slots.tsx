'use client';

import type {
  CareTeamMember,
  MemberResponse,
  ProgressPhotoUploadResponse,
} from '@nutricoach/contracts';
import { cn, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiUpload } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';
import { fittedSize, photoFileUrl, type PhotoAudience, type PhotoSlotRow } from './photo-view';

/** El lado mayor de una foto al subirla, y hasta qué peso se sube tal cual: así entran las del celular en los 5 MB (ADR-038). */
const MAX_SIDE = 2048;
const KEEP_BYTES = 4_500_000;
const KEEP_TYPES = new Set(['image/jpeg', 'image/png']);

/** La foto no se pudo leer en el navegador: no es una imagen JPEG o PNG. */
export class PhotoReadError extends Error {}

/** Achica la foto antes de subirla si hace falta; una chica en JPEG o PNG va tal cual. */
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new PhotoReadError();
  const size = fittedSize(bitmap.width, bitmap.height, MAX_SIDE);
  if (size.width === bitmap.width && file.size <= KEEP_BYTES && KEEP_TYPES.has(file.type)) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoReadError();
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new PhotoReadError());
      },
      'image/jpeg',
      0.85,
    );
  });
}

function Slot({
  row,
  slot,
  audience,
  uploadBase,
  canUpload,
}: {
  row: PhotoSlotRow;
  slot: PhotoSlotRow['slots'][number];
  audience: PhotoAudience;
  uploadBase: string;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const photo = await preparePhoto(file);
      const form = new FormData();
      form.append('photo', photo, photo === file ? file.name : 'foto.jpg');
      return apiUpload<ProgressPhotoUploadResponse>(
        `${uploadBase}/${String(row.position)}/${slot.view}`,
        form,
        'POST',
        audience === 'patient' ? { 'Idempotency-Key': `photo:${crypto.randomUUID()}` } : {},
      );
    },
    onSuccess: () => {
      router.refresh();
    },
  });
  const action = slot.photoId ? 'Reemplazar' : 'Subir';
  const label = `${action} la foto ${slot.label.toLowerCase()} de «${row.name}»`;
  const enabled = canUpload && row.open && !upload.isPending;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <span className="text-sm font-medium">{slot.label}</span>
      {slot.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element -- la foto se lee de la API con la sesión, cada vez auditada
        <img
          src={photoFileUrl(slot.photoId, audience)}
          alt={`Foto ${slot.label.toLowerCase()} de «${row.name}»`}
          className="aspect-[3/4] w-full rounded-md border border-border bg-muted object-cover"
        />
      ) : (
        <span className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          Sin foto
        </span>
      )}
      {canUpload ? (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png"
            aria-label={label}
            disabled={!enabled}
            className="peer sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) upload.mutate(file);
            }}
          />
          <label
            htmlFor={inputId}
            aria-hidden
            className={cn(
              'flex min-h-touch items-center justify-center rounded-md border border-brand-border px-3 text-sm font-medium text-brand-text',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-border',
              enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
            )}
          >
            {upload.isPending ? 'Subiendo…' : action}
          </label>
        </>
      ) : null}
      {upload.error instanceof PhotoReadError ? (
        <p role="alert" className="text-sm text-danger">
          No pudimos leer la foto: usa una foto JPEG o PNG.
        </p>
      ) : (
        <FormError error={upload.error} title="No se subió la foto" />
      )}
    </li>
  );
}

/**
 * Las tres vistas de cada mesociclo del programa publicado (P-30; RN-G20): la foto, o el espacio para subirla desde la última semana
 * del mesociclo. Subir otra la reemplaza y la anterior se borra.
 */
export function PhotoSlots({
  rows,
  audience,
  uploadBase,
  canUpload,
}: {
  rows: readonly PhotoSlotRow[];
  audience: PhotoAudience;
  uploadBase: string;
  canUpload: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <section
          key={row.position}
          aria-labelledby={`fotos-mesociclo-${String(row.position)}`}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`fotos-mesociclo-${String(row.position)}`} className="font-medium">
              {row.name}
            </h3>
            <span className="text-sm text-muted-foreground">
              del {formatDate(row.startDate)} al {formatDate(row.endDate)}
            </span>
            {row.open ? null : (
              <StatusBadge tone="info">Desde el {formatDate(row.opensOn)}</StatusBadge>
            )}
          </div>
          <ul className="grid grid-cols-3 gap-2" aria-label={`Fotos de «${row.name}»`}>
            {row.slots.map((slot) => (
              <Slot
                key={slot.view}
                row={row}
                slot={slot}
                audience={audience}
                uploadBase={uploadBase}
                canUpload={canUpload}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Para el equipo: sube quien escribe en el expediente (RN-A05); la API decide. */
export function StaffPhotoSlots({
  rows,
  patientId,
  careTeam,
  members,
}: {
  rows: readonly PhotoSlotRow[];
  patientId: string;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  return (
    <PhotoSlots
      rows={rows}
      audience="staff"
      uploadBase={`/patients/${patientId}/progress-photos`}
      canUpload={canWrite && writes}
    />
  );
}
