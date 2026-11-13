'use client';

import { cn, describedBy, FieldMessages, Label } from '@nutricoach/ui';
import { useId, useState } from 'react';
import { TextField } from '@/features/forms/fields';
import { preparePhoto } from '@/features/training/photo-slots';
import type { DocumentContent } from './record-documents-api';
import { acceptedFiles } from './record-documents-view';

/** Qué se agrega: un pedido sin contenido (solo el coach), un archivo o un enlace. */
export type ContentKind = 'REQUEST' | 'FILE' | 'LINK';

const MAX_BYTES = 5 * 1024 * 1024;

/** Lo que eligió la persona, con el archivo o el enlace y el error a la vista. */
export function useContentChoice(initial: ContentKind) {
  const [kind, setKind] = useState<ContentKind>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  return {
    kind,
    setKind: (next: ContentKind) => {
      setKind(next);
      setError(null);
    },
    file,
    setFile: (next: File | null) => {
      setFile(next);
      setError(null);
    },
    link,
    setLink: (next: string) => {
      setLink(next);
      setError(null);
    },
    error,
    reset: () => {
      setKind(initial);
      setFile(null);
      setLink('');
      setError(null);
    },
    /**
     * El contenido listo para subir: un pedido es null; una foto grande se achica como las de progreso, para que entre en los 5 MB
     * (ADR-038); un PDF va tal cual. Si falta algo o no sirve, devuelve undefined con el error a la vista.
     */
    async resolve(): Promise<DocumentContent | null | undefined> {
      if (kind === 'REQUEST') return null;
      if (kind === 'LINK') {
        const url = link.trim();
        if (!/^https:\/\/\S+$/i.test(url)) {
          setError('Pega un enlace completo que empiece con https://');
          return undefined;
        }
        return { kind: 'LINK', url };
      }
      if (!file) {
        setError('Elige el archivo.');
        return undefined;
      }
      if (file.type === 'image/jpeg' || file.type === 'image/png') {
        try {
          const prepared = await preparePhoto(file);
          return { kind: 'FILE', file: prepared, name: prepared === file ? file.name : 'foto.jpg' };
        } catch {
          setError('No pudimos leer la foto: usa una foto JPEG o PNG.');
          return undefined;
        }
      }
      if (file.size > MAX_BYTES) {
        setError('El archivo pesa más de 5 MB: usa uno más liviano o comparte un enlace.');
        return undefined;
      }
      return { kind: 'FILE', file, name: file.name };
    },
  };
}

export type ContentChoice = ReturnType<typeof useContentChoice>;

/**
 * Qué se sube y el campo que corresponde (P-31): un archivo PDF, JPEG o PNG de hasta 5 MB o un enlace, donde van los videos. Sin
 * el consentimiento de imágenes (07, «Privacidad»), solo un PDF y sin enlaces.
 */
export function ContentFields({
  choice,
  imagesConsent,
  requestLabel,
  disabled = false,
  touch = false,
}: {
  choice: ContentChoice;
  imagesConsent: boolean;
  /** Si viene, la primera opción es pedir el documento sin contenido. */
  requestLabel?: string;
  disabled?: boolean;
  /** En la app del paciente: objetivos de 44 px. */
  touch?: boolean;
}) {
  const id = useId();
  const options: { value: ContentKind; label: string }[] = [
    ...(requestLabel ? [{ value: 'REQUEST' as const, label: requestLabel }] : []),
    { value: 'FILE', label: 'Subir un archivo' },
    ...(imagesConsent ? [{ value: 'LINK' as const, label: 'Pegar un enlace' }] : []),
  ];
  const fileHint = imagesConsent
    ? 'PDF, JPEG o PNG de hasta 5 MB. Los videos van por enlace.'
    : 'Solo PDF de hasta 5 MB: las fotos y los enlaces piden la autorización de imágenes.';
  return (
    <div className="flex flex-col gap-3">
      {options.length > 1 ? (
        <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
          <legend className="mb-1 text-sm font-medium">¿Qué vas a agregar?</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm',
                  touch ? 'min-h-touch' : 'min-h-10',
                  choice.kind === option.value && 'border-brand-border bg-muted',
                )}
              >
                <input
                  type="radio"
                  name={`${id}-kind`}
                  value={option.value}
                  checked={choice.kind === option.value}
                  onChange={() => {
                    choice.setKind(option.value);
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {choice.kind === 'FILE' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-file`}>Archivo</Label>
          <input
            id={`${id}-file`}
            type="file"
            accept={acceptedFiles(imagesConsent)}
            disabled={disabled}
            aria-invalid={choice.error ? true : undefined}
            aria-describedby={describedBy(`${id}-file`, fileHint, choice.error ?? undefined)}
            onChange={(event) => {
              choice.setFile(event.currentTarget.files?.[0] ?? null);
            }}
            className={cn(
              'text-sm file:mr-3 file:rounded-md file:border file:border-brand-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-text',
              touch && 'file:min-h-touch',
            )}
          />
          <FieldMessages id={`${id}-file`} hint={fileHint} error={choice.error ?? undefined} />
        </div>
      ) : null}
      {choice.kind === 'LINK' ? (
        <TextField
          label="Enlace"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          hint="Un video o una carpeta compartida: se abre aparte y la app no guarda el archivo."
          value={choice.link}
          disabled={disabled}
          error={choice.error ?? undefined}
          onChange={(event) => {
            choice.setLink(event.currentTarget.value);
          }}
        />
      ) : null}
      {choice.kind === 'REQUEST' && choice.error ? (
        <p role="alert" className="text-sm text-danger">
          {choice.error}
        </p>
      ) : null}
    </div>
  );
}
