'use client';

import type {
  AppSection,
  AppSettings,
  CareTeamMember,
  MemberResponse,
  UpdateAppSettings,
} from '@nutricoach/contracts';
import { APP_SECTION_LABELS, APP_SECTIONS } from '@nutricoach/contracts';
import { Button, Label, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckboxField, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Los ajustes de la app del paciente (RF-27): el color de su tema, la bienvenida, las secciones que ve y si registra su peso en
 * casa. Los cambia su equipo de atención con acceso de escritura (RN-A05); la API decide y lo audita (RN-B03).
 */
export function AppSettingsForm({
  patientId,
  initial,
  careTeam,
  members,
  archived,
}: {
  patientId: string;
  initial: AppSettings;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
}) {
  const writesRecord = useWritesRecord(careTeam, members);
  const canWrite = useCanWrite();
  const writes = writesRecord && canWrite && !archived;
  const [themeColor, setThemeColor] = useState(initial.themeColor ?? '');
  const [welcome, setWelcome] = useState(initial.welcomeMessage ?? '');
  const [sections, setSections] = useState<readonly AppSection[]>(initial.enabledSections);
  const [allowWeightLog, setAllowWeightLog] = useState(initial.allowWeightLog);
  const save = useMutation({
    mutationFn: (body: UpdateAppSettings) =>
      apiFetch<AppSettings>(`/patients/${patientId}/app-settings`, { method: 'PUT', body }),
  });
  const colorError =
    themeColor !== '' && !HEX.test(themeColor) ? 'Usa un color como #1f8a70.' : undefined;

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (colorError) return;
        save.mutate({
          themeColor: themeColor === '' ? null : themeColor,
          welcomeMessage: welcome.trim() === '' ? null : welcome.trim(),
          enabledSections: APP_SECTIONS.filter((section) => sections.includes(section)),
          allowWeightLog,
        });
      }}
    >
      {save.isSuccess ? <Notice tone="success" title="Ajustes guardados" /> : null}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextField
            label="Color del tema"
            hint="Vacío: los colores de la organización."
            value={themeColor}
            error={colorError}
            disabled={!writes}
            onChange={(event) => {
              setThemeColor(event.target.value.trim());
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tema-paleta" className="sr-only">
            Elegir el color en la paleta
          </Label>
          <input
            id="tema-paleta"
            type="color"
            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-card"
            value={HEX.test(themeColor) ? themeColor : '#1f8a70'}
            disabled={!writes}
            onChange={(event) => {
              setThemeColor(event.target.value);
            }}
          />
        </div>
      </div>
      <TextAreaField
        label="Bienvenida"
        hint="Aparece en Hoy cuando no hay un mensaje motivacional vigente. Hasta 280 caracteres."
        maxLength={280}
        rows={2}
        value={welcome}
        disabled={!writes}
        onChange={(event) => {
          setWelcome(event.target.value);
        }}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Secciones que ve</legend>
        {APP_SECTIONS.map((section) => (
          <CheckboxField
            key={section}
            label={APP_SECTION_LABELS[section]}
            checked={sections.includes(section)}
            disabled={!writes}
            onChange={(event) => {
              const on = event.target.checked;
              setSections((current) =>
                on ? [...current, section] : current.filter((s) => s !== section),
              );
            }}
          />
        ))}
      </fieldset>
      <CheckboxField
        label="Registra su peso en casa"
        checked={allowWeightLog}
        disabled={!writes}
        onChange={(event) => {
          setAllowWeightLog(event.target.checked);
        }}
      />
      <FormError error={save.error} title="No se guardaron los ajustes" />
      {writes ? (
        <Button
          type="submit"
          className="self-start"
          disabled={save.isPending || Boolean(colorError)}
        >
          Guardar ajustes
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Los cambia su equipo de atención con acceso de escritura.
        </p>
      )}
    </form>
  );
}
