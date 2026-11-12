'use client';

import {
  MESOCYCLE_REPORT_TEXT_LABELS,
  MESOCYCLE_REPORT_TEXT_MAX,
  type CareTeamMember,
  type MemberResponse,
  type MesocycleReport,
  type MesocycleReportVersion,
  type SaveMesocycleReport,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { formatDate } from '@/lib/dates';
import { ReportTexts } from './mesocycle-report-sheet';

type TextKey = keyof typeof MESOCYCLE_REPORT_TEXT_LABELS;
const KEYS = Object.keys(MESOCYCLE_REPORT_TEXT_LABELS) as TextKey[];

const HINTS: Readonly<Record<TextKey, string>> = {
  achievement: 'Lo mejor del mesociclo, con sus números.',
  limitation: 'Lo que frenó el avance.',
  adjustment: 'Lo que cambiaste o vas a cambiar.',
  priority: 'En qué se enfoca el mesociclo siguiente.',
};

const textsOf = (report: MesocycleReport): Record<TextKey, string> => ({
  achievement: report.achievement ?? '',
  limitation: report.limitation ?? '',
  adjustment: report.adjustment ?? '',
  priority: report.priority ?? '',
});

const bodyOf = (texts: Record<TextKey, string>): SaveMesocycleReport => ({
  achievement: texts.achievement.trim() || null,
  limitation: texts.limitation.trim() || null,
  adjustment: texts.adjustment.trim() || null,
  priority: texts.priority.trim() || null,
});

/**
 * El borrador del informe del mesociclo (P14.5, PR 7b; P-28; RN-G19): el coach escribe el logro, la limitante, el ajuste y la
 * prioridad, lo guarda con la versión leída (If-Match) y lo envía cuando cierra el mesociclo, con los cuatro textos. Enviarlo
 * congela los números y el informe aparece en la app; ya no se cambia. Escribe quien escribe en el expediente; la API decide.
 */
export function MesocycleReportEditor({
  report,
  careTeam,
  members,
}: {
  report: MesocycleReport;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  const [texts, setTexts] = useState(() => textsOf(report));
  const [saved, setSaved] = useState(() => textsOf(report));
  const [version, setVersion] = useState(report.version);
  const save = useMutation({
    mutationFn: () =>
      apiFetch<MesocycleReportVersion>(`/mesocycle-reports/${report.id}`, {
        method: 'PUT',
        body: bodyOf(texts),
        headers: { 'If-Match': `"${String(version)}"` },
      }),
    onSuccess: (result) => {
      setVersion(result.version);
      setSaved(texts);
      router.refresh();
    },
  });
  const send = useMutation({
    mutationFn: () =>
      apiFetch<MesocycleReportVersion>(`/mesocycle-reports/${report.id}/send`, {
        method: 'POST',
        headers: { 'If-Match': `"${String(version)}"` },
      }),
    onSuccess: () => {
      router.refresh();
    },
  });

  if (!canWrite || !writes) {
    return (
      <div className="flex flex-col gap-2">
        <ReportTexts report={report} />
        <p className="text-sm text-muted-foreground">
          Lo escribe y lo envía quien escribe en el expediente.
        </p>
      </div>
    );
  }

  const dirty = KEYS.some((key) => texts[key] !== saved[key]);
  const missing = KEYS.filter((key) => saved[key].trim() === '');
  const endDate = report.body?.mesocycle.endDate ?? null;
  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        aria-label="Textos del informe"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {KEYS.map((key) => (
            <TextAreaField
              key={key}
              label={MESOCYCLE_REPORT_TEXT_LABELS[key]}
              hint={HINTS[key]}
              maxLength={MESOCYCLE_REPORT_TEXT_MAX}
              value={texts[key]}
              onChange={(event) => {
                const value = event.target.value;
                setTexts((current) => ({ ...current, [key]: value }));
              }}
            />
          ))}
        </div>
        <FormError error={save.error} title="No se guardó el borrador" />
        <div>
          <Button type="submit" variant="secondary" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar borrador'}
          </Button>
        </div>
      </form>
      <section
        aria-labelledby="enviar-informe"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="enviar-informe" className="font-semibold">
          Enviar el informe
        </h3>
        {report.closed ? (
          <p className="text-sm text-muted-foreground">
            Aparece en su app, con un espacio para su comentario. Los números quedan como están hoy
            y el informe ya no se cambia.
          </p>
        ) : (
          <Notice tone="info" title="El mesociclo todavía no cierra" rule="RN-G19">
            {endDate
              ? `Se envía cuando termine su última semana, después del ${formatDate(endDate)}. Mientras tanto, el borrador se guarda.`
              : 'Se envía cuando termine su última semana. Mientras tanto, el borrador se guarda.'}
          </Notice>
        )}
        {dirty ? (
          <p className="text-sm text-muted-foreground">Guarda los cambios antes de enviarlo.</p>
        ) : null}
        {report.closed && !dirty && missing.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Para enviarlo, escribe{' '}
            {missing.map((key) => MESOCYCLE_REPORT_TEXT_LABELS[key].toLowerCase()).join(', ')}.
          </p>
        ) : null}
        <FormError error={send.error} title="No se envió el informe" />
        <div>
          <ConfirmDialog
            trigger={
              <Button disabled={!report.closed || dirty || missing.length > 0 || send.isPending}>
                {send.isPending ? 'Enviando…' : 'Enviar informe'}
              </Button>
            }
            title="¿Enviar el informe?"
            description="Aparece en su app y queda congelado: los números, el control de cada semana y la comparativa física ya no cambian, y tampoco tus textos."
            confirmLabel="Enviar"
            tone="danger"
            onConfirm={() => {
              send.mutate();
            }}
          />
        </div>
      </section>
    </div>
  );
}
