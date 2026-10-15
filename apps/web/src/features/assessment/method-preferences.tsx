'use client';

import {
  methodLabel,
  METHOD_PURPOSES,
  METHODS_BY_PURPOSE,
  type MethodPurpose,
  type OrganizationMethodPreferencesResponse,
  type PatientMethodPreferencesResponse,
} from '@nutricoach/contracts';
import { Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { POPULATION_LABELS } from '@/features/patients/labels';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { PREFERENCE_SOURCE_LABELS, PURPOSE_LABELS } from './labels';

/** El valor del Select que vuelve al nivel de arriba: la organización o la plataforma (DELETE). */
const INHERIT = 'INHERIT';

type Preference = PatientMethodPreferencesResponse['preferences'][number];

const methodText = (preference: Preference) =>
  preference.methodCode ? methodLabel(preference.methodCode) : 'Sin método por defecto';

function PreferenceRow({
  purpose,
  preference,
  own,
  inheritLabel,
  population,
  disabled,
  onChange,
}: {
  purpose: MethodPurpose;
  preference: Preference;
  /** Si la elección es de este nivel (paciente u organización). */
  own: boolean;
  inheritLabel: string;
  /** En la tabla de la organización, para que cada lista tenga un nombre propio. */
  population?: string;
  disabled: boolean;
  onChange: (methodCode: string | null) => void;
}) {
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-2 sm:items-end">
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{PURPOSE_LABELS[purpose]}</p>
        <p className="text-sm">{methodText(preference)}</p>
        <p className="text-xs text-muted-foreground">
          {PREFERENCE_SOURCE_LABELS[preference.source]}
        </p>
      </div>
      {disabled ? null : (
        <Select
          label={`Método de ${PURPOSE_LABELS[purpose].toLowerCase()}${population ? ` · ${population}` : ''}`}
          value={own && preference.methodCode ? preference.methodCode : INHERIT}
          onValueChange={(value) => {
            onChange(value === INHERIT ? null : value);
          }}
          options={[
            { value: INHERIT, label: inheritLabel },
            ...METHODS_BY_PURPOSE[purpose].map((code) => ({
              value: code,
              label: methodLabel(code),
            })),
          ]}
        />
      )}
    </li>
  );
}

const NO_SILENT_RECALCULATION =
  'Cambiar un método no recalcula nada (RN-D08): lo usan las evaluaciones que se cierren después; para una ya cerrada, «Recalcular».';

/** Los métodos de un paciente (RF-16, RN-D05): los de su población en la organización, que su equipo puede cambiar. */
export function PatientMethodPreferences({
  patientId,
  initial,
}: {
  patientId: string;
  initial: PatientMethodPreferencesResponse;
}) {
  const canWrite = useCanWrite();
  const [view, setView] = useState(initial);
  const change = useMutation({
    mutationFn: ({ purpose, methodCode }: { purpose: MethodPurpose; methodCode: string | null }) =>
      apiFetch<PatientMethodPreferencesResponse>(
        `/patients/${patientId}/method-preferences/${purpose}`,
        methodCode === null ? { method: 'DELETE' } : { method: 'PUT', body: { methodCode } },
      ),
    onSuccess: setView,
  });
  const byPurpose = new Map(view.preferences.map((p) => [p.purpose, p]));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Población: {POPULATION_LABELS[view.population]}. {NO_SILENT_RECALCULATION}
      </p>
      <FormError error={change.error} title="No se cambió el método" />
      <ul className="flex flex-col divide-y divide-border">
        {METHOD_PURPOSES.map((purpose) => {
          const preference = byPurpose.get(purpose);
          if (!preference) return null;
          return (
            <PreferenceRow
              key={purpose}
              purpose={purpose}
              preference={preference}
              own={preference.source === 'PATIENT'}
              inheritLabel="El de la organización"
              disabled={!canWrite}
              onChange={(methodCode) => {
                change.mutate({ purpose, methodCode });
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** Los métodos por población de la organización (RF-16, RN-D05). Los cambian el dueño y los administradores. */
export function OrganizationMethodPreferences({
  initial,
  canEdit,
}: {
  initial: OrganizationMethodPreferencesResponse;
  canEdit: boolean;
}) {
  const canWrite = useCanWrite() && canEdit;
  const [view, setView] = useState(initial);
  const change = useMutation({
    mutationFn: ({
      population,
      purpose,
      methodCode,
    }: {
      population: string;
      purpose: MethodPurpose;
      methodCode: string | null;
    }) =>
      apiFetch<OrganizationMethodPreferencesResponse>(
        `/organization/method-preferences/${population}/${purpose}`,
        methodCode === null ? { method: 'DELETE' } : { method: 'PUT', body: { methodCode } },
      ),
    onSuccess: setView,
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{NO_SILENT_RECALCULATION}</p>
      {canEdit ? null : (
        <Notice tone="info" title="Solo el dueño y los administradores los cambian" />
      )}
      <FormError error={change.error} title="No se cambió el método" />
      <div className="grid gap-4 xl:grid-cols-2">
        {view.populations.map((row) => (
          <section
            key={row.population}
            aria-labelledby={`poblacion-${row.population}`}
            className="flex flex-col rounded-lg border border-border px-4 py-2"
          >
            <h3 id={`poblacion-${row.population}`} className="pt-2 font-semibold">
              {POPULATION_LABELS[row.population]}
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {row.preferences.map((preference) => (
                <PreferenceRow
                  key={preference.purpose}
                  purpose={preference.purpose}
                  preference={preference}
                  own={preference.source === 'ORGANIZATION'}
                  inheritLabel="El de la plataforma"
                  population={POPULATION_LABELS[row.population]}
                  disabled={!canWrite}
                  onChange={(methodCode) => {
                    change.mutate({
                      population: row.population,
                      purpose: preference.purpose,
                      methodCode,
                    });
                  }}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
