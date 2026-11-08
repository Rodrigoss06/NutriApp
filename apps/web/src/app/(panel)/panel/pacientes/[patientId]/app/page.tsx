import type { AppSettings } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { AppSettingsForm } from '@/features/patient-app-settings/app-settings-form';
import { PatientMessages } from '@/features/patient-app-settings/messages-panel';
import { Section } from '@/features/patients/section';
import { PatientResources } from '@/features/resources/patient-resources';
import { getMembers, getPatient } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'App del paciente' };

/** La app del paciente (RF-27): su tema, lo que ve, sus mensajes motivacionales y su material educativo (RF-30). */
export default async function PatientAppPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const [patient, settings, members] = await Promise.all([
    getPatient(patientId),
    serverApi<AppSettings>(`/patients/${encodeURIComponent(patientId)}/app-settings`),
    getMembers(),
  ]);
  if (!patient.ok) return null;
  if (!settings.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la app del paciente" />;
  }
  const archived = patient.data.status === 'ARCHIVED';
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Ajustes de la app"
        description="Cómo se ve su app y qué secciones tiene. El color se aplica en su próxima visita."
      >
        <AppSettingsForm
          patientId={patientId}
          initial={settings.data}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
      <Section
        title="Mensajes motivacionales"
        description="Uno aparece cada día en su pantalla Hoy, antes que los mensajes para todos los pacientes."
      >
        <PatientMessages
          patientId={patientId}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
      <Section
        title="Material educativo"
        description="Lo ve en su app, en Más › Material, si la sección está activa. Sabrás cuándo lo abrió."
      >
        <PatientResources
          patientId={patientId}
          careTeam={patient.data.careTeam}
          members={members.data.members}
          archived={archived}
        />
      </Section>
    </div>
  );
}
