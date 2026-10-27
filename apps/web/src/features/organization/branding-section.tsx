'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BRANDING_LIMITS,
  LOGO_LIMITS,
  updateBrandingSchema,
  type BrandingResponse,
  type UpdateBranding,
} from '@nutricoach/contracts';
import {
  brandTokens,
  brandVariables,
  Button,
  ConfirmDialog,
  contrastRatio,
  DEFAULT_BRAND,
  describedBy,
  FieldMessages,
  formatNumber,
  Label,
  Notice,
  StatusBadge,
} from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState, type CSSProperties } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { TextAreaField, TextField, submitWith } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useCan, useCanWrite } from '@/features/session/panel-session';
import { apiFetch, apiUpload } from '@/lib/api/client';
import { checkLogo } from './logo';

const toValues = (branding: BrandingResponse): UpdateBranding => ({
  displayName: branding.displayName ?? '',
  primaryColor: branding.primaryColor,
  secondaryColor: branding.secondaryColor,
  contact: {
    phone: branding.contact.phone ?? '',
    email: branding.contact.email ?? '',
    website: branding.contact.website ?? '',
  },
  pdfFooter: branding.pdfFooter ?? '',
});

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const logoUrl = (branding: BrandingResponse): string | null =>
  branding.logoFileId ? `/api/v1/organization/branding/logo?v=${branding.logoFileId}` : null;

/**
 * Marca de las fichas (RN-H03, P11): el logo, el color, el nombre y el contacto que llevan las fichas PDF. La ficha
 * solo usa el color principal; el secundario, el panel y el tema del paciente llegan con la marca completa de P15. La
 * ven todos; la cambian el dueño y los administradores (la API decide).
 */
export function BrandingSection({
  branding,
  organizationName,
}: {
  branding: BrandingResponse;
  organizationName: string;
}) {
  const router = useRouter();
  const { manage } = useCan();
  const canEdit = useCanWrite() && manage;
  const form = useForm<UpdateBranding>({
    resolver: zodResolver(updateBrandingSchema),
    values: toValues(branding),
  });
  const save = useMutation({
    mutationFn: (input: unknown) =>
      apiFetch<BrandingResponse>('/organization/branding', { method: 'PUT', body: input }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const values = useWatch({ control: form.control });
  const primary = values.primaryColor ?? null;
  const contact = [values.contact?.phone, values.contact?.email, values.contact?.website]
    .map(asText)
    .filter((part) => part !== '');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex flex-col gap-6">
        <LogoField branding={branding} canEdit={canEdit} />
        <form
          noValidate
          aria-label="Datos de la marca"
          className="flex flex-col gap-4"
          onSubmit={submitWith(
            form.handleSubmit((input) => {
              save.mutate(input);
            }),
          )}
        >
          <FormError error={save.error} title="No se guardó la marca" />
          {save.isSuccess && !form.formState.isDirty ? (
            <Notice tone="success" title="Marca guardada">
              Las fichas que se generen desde ahora la llevan; las que ya existen no cambian
              (RN-H02).
            </Notice>
          ) : null}
          <ColorField
            value={primary}
            disabled={!canEdit}
            onChange={(color) => {
              form.setValue('primaryColor', color, { shouldDirty: true });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nombre en la ficha"
              hint={`Si lo dejas vacío, va «${organizationName}».`}
              maxLength={BRANDING_LIMITS.displayName}
              disabled={!canEdit}
              error={errors.displayName?.message}
              {...form.register('displayName')}
            />
            <TextField
              label="Teléfono"
              type="tel"
              autoComplete="off"
              maxLength={BRANDING_LIMITS.phone}
              disabled={!canEdit}
              error={errors.contact?.phone?.message}
              {...form.register('contact.phone')}
            />
            <TextField
              label="Correo"
              type="email"
              autoComplete="off"
              maxLength={BRANDING_LIMITS.email}
              disabled={!canEdit}
              error={errors.contact?.email?.message}
              {...form.register('contact.email')}
            />
            <TextField
              label="Web"
              hint="Por ejemplo, consultorio.pe."
              autoComplete="off"
              maxLength={BRANDING_LIMITS.website}
              disabled={!canEdit}
              error={errors.contact?.website?.message}
              {...form.register('contact.website')}
            />
          </div>
          <TextAreaField
            label="Pie de la ficha"
            hint={`Una línea al pie de cada página, hasta ${String(BRANDING_LIMITS.pdfFooter)} caracteres; por ejemplo, tu colegiatura.`}
            maxLength={BRANDING_LIMITS.pdfFooter}
            rows={2}
            disabled={!canEdit}
            error={errors.pdfFooter?.message}
            {...form.register('pdfFooter')}
          />
          {canEdit ? (
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : 'Guardar marca'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              La cambian el dueño y los administradores.
            </p>
          )}
        </form>
      </div>
      <SheetPreview
        name={asText(values.displayName) || organizationName}
        logoUrl={logoUrl(branding)}
        primary={primary ?? DEFAULT_BRAND.primary}
        footer={[contact.join(' · '), asText(values.pdfFooter)]
          .filter((part) => part)
          .join('  ·  ')}
      />
    </div>
  );
}

/**
 * El color principal con su contraste verificado (WCAG, ADR-027): encima va blanco o negro, el que más contrasta; como
 * texto sobre el papel se oscurece lo justo hasta 4.5:1. Sin color propio, la paleta provisional.
 */
function ColorField({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (color: string | null) => void;
}) {
  const id = useId();
  const shown = value ?? DEFAULT_BRAND.primary;
  const tokens = brandTokens(shown);
  const onColor = contrastRatio(tokens.foreground, tokens.base);
  const onPaper = contrastRatio(tokens.text, '#ffffff');
  const hint = `Títulos y nombre de la ficha. Encima va texto ${tokens.foreground === '#ffffff' ? 'blanco' : 'negro'} (${formatNumber(onColor, 'index')}:1); como texto sobre el papel, ${formatNumber(onPaper, 'index')}:1${tokens.text === tokens.base ? '' : ', oscurecido lo justo para leerse'}.`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Color de la ficha</Label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="color"
          value={shown}
          disabled={disabled}
          aria-describedby={describedBy(id, hint)}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
          className="h-11 w-16 cursor-pointer rounded-md border border-input-border bg-card disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="font-mono text-sm uppercase tabular-nums">{shown}</span>
        <StatusBadge tone="success">Contraste AA</StatusBadge>
        {value === null ? (
          <StatusBadge tone="info">Paleta provisional</StatusBadge>
        ) : disabled ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
            }}
          >
            Volver a la paleta provisional
          </Button>
        )}
      </div>
      <FieldMessages id={id} hint={hint} />
    </div>
  );
}

/** El logo se sube al elegirlo: el navegador lo revisa primero y la API, entera (ADR-066). */
function LogoField({ branding, canEdit }: { branding: BrandingResponse; canEdit: boolean }) {
  const router = useRouter();
  const id = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set('logo', file);
      return apiUpload<BrandingResponse>('/organization/branding/logo', form, 'PUT');
    },
    onSuccess: () => {
      router.refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiFetch('/organization/branding/logo', { method: 'DELETE' }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const url = logoUrl(branding);
  const hint = `PNG o JPG de hasta 1 MB y ${String(LOGO_LIMITS.maxSidePx)} px por lado. En la ficha mide como máximo 120 × 40 pt.`;

  return (
    <div className="flex flex-col gap-3">
      <FormError error={upload.error} title="No se subió el logo" />
      <FormError error={remove.error} title="No se quitó el logo" />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-border bg-card p-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- el logo se lee de la API con la sesión
            <img
              src={url}
              alt="Logo actual de las fichas"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-sm text-muted-foreground">Sin logo</span>
          )}
        </div>
        {canEdit && url ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" disabled={remove.isPending}>
                Quitar logo
              </Button>
            }
            title="¿Quitar el logo?"
            description="Las fichas que se generen desde ahora van solo con el nombre. Las que ya existen no cambian."
            confirmLabel="Quitar"
            tone="danger"
            onConfirm={() => {
              remove.mutate();
            }}
          />
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{url ? 'Cambiar el logo' : 'Subir un logo'}</Label>
          <input
            id={id}
            type="file"
            accept={LOGO_LIMITS.accept}
            disabled={upload.isPending}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={describedBy(id, hint, fileError)}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              setFileError(null);
              upload.reset();
              if (!file) return;
              void checkLogo(file).then((problem) => {
                input.value = '';
                if (problem) setFileError(problem);
                else upload.mutate(file);
              });
            }}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-brand-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-text"
          />
          <FieldMessages id={id} hint={upload.isPending ? 'Subiendo…' : hint} error={fileError} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cómo se ve el encabezado y el pie de la ficha con esta marca, con las proporciones del PDF (logo de 120 × 40 pt, nombre
 * más chico que el título): las variables --brand-* se redefinen solo aquí, así que el panel no cambia (ADR-027).
 */
function SheetPreview({
  name,
  logoUrl: url,
  primary,
  footer,
}: {
  name: string;
  logoUrl: string | null;
  primary: string;
  footer: string;
}) {
  const scoped = brandVariables({ primary, secondary: DEFAULT_BRAND.secondary }) as CSSProperties;
  return (
    <figure
      style={scoped}
      className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-4 text-foreground shadow-sm lg:sticky lg:top-4"
    >
      <figcaption className="text-xs font-medium text-muted-foreground">
        Vista previa de la ficha
      </figcaption>
      <div className="flex items-end justify-between gap-3 border-b-2 border-brand pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- el logo se lee de la API con la sesión
            <img src={url} alt="" className="max-h-6 max-w-[4.5rem] object-contain" />
          ) : null}
          <span className="break-words text-xs font-bold text-brand-text">{name}</span>
        </div>
        <span className="shrink-0 text-right text-sm font-bold">Dieta por intercambios</span>
      </div>
      <p className="text-sm font-bold text-brand-text">Metas del día</p>
      <div className="flex flex-col gap-1" aria-hidden>
        <span className="h-2 w-full rounded bg-muted" />
        <span className="h-2 w-4/5 rounded bg-muted" />
      </div>
      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
        {footer || 'Sin contacto ni pie.'} · Página 1 de 2
      </p>
    </figure>
  );
}
