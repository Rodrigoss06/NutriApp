import type { PatientMethodPreferencesResponse } from '@nutricoach/contracts';
import { Button, EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { Ruler } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { evaluationTitle, STATUS_LABELS, STATUS_TONES } from '@/features/assessment/labels';
import { PatientMethodPreferences } from '@/features/assessment/method-preferences';
import { getEvaluations } from '@/features/assessment/server';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { Section } from '@/features/patients/section';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatInstant } from '@/lib/dates';
import { TableScroll } from '@/features/shell/table-scroll';

export const metadata: Metadata = { title: 'Evaluaciones' };

/** Las evaluaciones del paciente, de la más reciente a la más antigua (RF-11), y sus métodos (RF-16). */
export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, evaluations, members, organization, preferences] = await Promise.all([
    getPatient(patientId),
    getEvaluations(patientId),
    getMembers(),
    getOrganization(),
    serverApi<PatientMethodPreferencesResponse>(
      `/patients/${encodeURIComponent(patientId)}/method-preferences`,
    ),
  ]);
  if (!patient.ok) return null;
  if (!evaluations.ok || !members.ok || !organization.ok) {
    return <Notice tone="danger" title="No pudimos cargar las evaluaciones" />;
  }
  const timezone = organization.data.timezone;
  const names = new Map(members.data.members.map((m) => [m.id, m.displayName]));
  const base = `/panel/pacientes/${patientId}/evaluaciones`;
  const archived = patient.data.status === 'ARCHIVED';
  const list = evaluations.data.evaluations;

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Evaluaciones"
        description="Antropometría por nivel (básico, ISAK 1 o ISAK 2) y bioimpedancia. Una evaluación cerrada no se edita: se enmienda."
      >
        {archived ? null : (
          <RecordWriteGate
            patientId={patientId}
            careTeam={patient.data.careTeam}
            members={members.data.members}
            action="evaluar"
          >
            <div>
              <Button asChild>
                <Link href={`${base}/nueva`}>Nueva evaluación</Link>
              </Button>
            </div>
          </RecordWriteGate>
        )}
        {list.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="Todavía no hay evaluaciones"
            description="Con el consentimiento de datos de salud vigente, crea la primera."
          />
        ) : (
          <TableScroll label="Evaluaciones">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Evaluaciones</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Fecha
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Evaluación
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Evaluó
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((evaluation) => (
                  <tr key={evaluation.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`${base}/${evaluation.id}`} className="text-brand-text underline">
                        {formatInstant(evaluation.measuredAt, timezone)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {evaluationTitle(evaluation)}
                      {evaluation.revision > 1 ? ` · revisión ${String(evaluation.revision)}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={STATUS_TONES[evaluation.status]}>
                        {STATUS_LABELS[evaluation.status]}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      {names.get(evaluation.evaluatorMemberId) ?? 'Miembro de la organización'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
      {preferences.ok ? (
        <Section
          title="Métodos de cálculo"
          description={
            <>
              Los de su población en la organización (
              <Link href="/panel/ajustes" className="underline">
                Ajustes
              </Link>
              ). Se pueden cambiar solo para este paciente.
            </>
          }
        >
          <PatientMethodPreferences
            patientId={patientId}
            initial={preferences.data}
            careTeam={patient.data.careTeam}
            members={members.data.members}
          />
        </Section>
      ) : null}
    </div>
  );
}
