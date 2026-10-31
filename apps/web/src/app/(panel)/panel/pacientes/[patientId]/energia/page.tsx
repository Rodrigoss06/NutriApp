import { methodLabel, type EnergyPrescriptionListResponse } from '@nutricoach/contracts';
import { Button, EmptyState, formatNumber, Notice } from '@nutricoach/ui';
import { Flame } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GOAL_LABELS } from '@/features/energy/labels';
import { RecordWriteGate } from '@/features/patients/record-write-gate';
import { Section } from '@/features/patients/section';
import { getMembers, getOrganization, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';
import { formatInstant } from '@/lib/dates';
import { TableScroll } from '@/features/shell/table-scroll';

export const metadata: Metadata = { title: 'Energía' };

/** Prescripciones energéticas del paciente, de la más reciente a la más antigua (RF-17). */
export default async function EnergyPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, prescriptions, organization, members] = await Promise.all([
    getPatient(patientId),
    serverApi<EnergyPrescriptionListResponse>(
      `/patients/${encodeURIComponent(patientId)}/energy-prescriptions`,
    ),
    getOrganization(),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!prescriptions.ok || !organization.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar las prescripciones" />;
  }
  const base = `/panel/pacientes/${patientId}/energia`;
  const list = prescriptions.data.prescriptions;
  return (
    <Section
      title="Energía"
      description="Tasa metabólica en reposo, gasto total, objetivo, peso objetivo y macronutrientes. Una prescripción no se edita: se crea otra."
    >
      {patient.data.status === 'ARCHIVED' ? null : (
        <RecordWriteGate
          patientId={patientId}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          action="prescribir energía"
        >
          <div>
            <Button asChild>
              <Link href={`${base}/nueva`}>Nueva prescripción</Link>
            </Button>
          </div>
        </RecordWriteGate>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Todavía no hay prescripciones"
          description="Parten de una evaluación cerrada con peso y talla."
        />
      ) : (
        <TableScroll label="Prescripciones energéticas">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Prescripciones energéticas</caption>
            <thead className="bg-surface text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Objetivo
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  TMR
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  GET
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Objetivo diario
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`${base}/${p.id}`} className="text-brand-text underline">
                      {formatInstant(p.createdAt, organization.data.timezone)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{GOAL_LABELS[p.goal]}</td>
                  <td className="px-3 py-2">{methodLabel(p.rmrMethodCode)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(p.teeKcal, 'kcal')} kcal
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(p.targetKcal, 'kcal')} kcal
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}
