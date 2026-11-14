'use client';

import type { MemberResponse, PatientExportListResponse } from '@nutricoach/contracts';
import { Section } from '@/features/patients/section';
import { useExportsPatient } from '@/features/patients/use-writes-record';
import { usePanelSession } from '@/features/session/panel-session';
import { PatientExportPanel } from './patient-export-panel';

/**
 * «Exportar sus datos» en la ficha (RN-B04; ADR-131, ADR-132): solo para el responsable y el dueño; el soporte no la ve. Vale también
 * con la organización en solo lectura (RN-A02): exportar no es editar.
 */
export function PatientExportSection({
  patientId,
  responsibleMemberId,
  members,
  initial,
}: {
  patientId: string;
  responsibleMemberId: string;
  members: readonly MemberResponse[];
  initial: PatientExportListResponse;
}) {
  const { timezone } = usePanelSession();
  if (!useExportsPatient(responsibleMemberId, members)) return null;
  return (
    <Section
      title="Exportar sus datos"
      description="Un ZIP con todos sus datos en JSON y CSV, sus fichas en PDF y sus archivos: documentos del expediente, fotos de progreso y evidencias. Queda 24 horas para descargarlo, solo para ti, y la descarga queda en la auditoría. Tus notas «Solo el autor» van; las de otros, no."
    >
      <PatientExportPanel
        endpoint={`/patients/${patientId}/exports`}
        initial={initial}
        timezone={timezone}
      />
    </Section>
  );
}
