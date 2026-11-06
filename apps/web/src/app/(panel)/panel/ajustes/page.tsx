import type {
  AccountResponse,
  OrganizationMethodPreferencesResponse,
  ReadinessThresholdsResponse,
  SettingsResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { LeeCoefficientSetting } from '@/features/assessment/lee-setting';
import { OrganizationMethodPreferences } from '@/features/assessment/method-preferences';
import { EditWindowSetting } from '@/features/patient-app-settings/edit-window-setting';
import { MessagesPanel } from '@/features/patient-app-settings/messages-panel';
import { Section } from '@/features/patients/section';
import { getOrganization } from '@/features/patients/server';
import { ReadinessThresholdsSetting } from '@/features/training/readiness-thresholds-setting';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Ajustes' };

/**
 * Ajustes de la organización: los métodos por población (RF-16, RN-D05), el coeficiente de Lee (RN-D11), el plazo de los
 * registros del paciente (RN-G10), los umbrales del entrenamiento (RF-42, 07 §11) y los mensajes para todos los pacientes
 * (RF-27). Los ven todos; los cambian el dueño y los administradores (la API decide).
 */
export default async function SettingsPage() {
  const [account, organization, preferences, settings, thresholds] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    getOrganization(),
    serverApi<OrganizationMethodPreferencesResponse>('/organization/method-preferences'),
    serverApi<SettingsResponse>('/organization/settings'),
    serverApi<ReadinessThresholdsResponse>('/organization/readiness-thresholds'),
  ]);
  if (!account.ok || !organization.ok || !preferences.ok || !settings.ok || !thresholds.ok) {
    return <Notice tone="danger" title="No pudimos cargar los ajustes" />;
  }
  const role = account.data.memberships.find(
    (m) => m.organizationId === organization.data.id,
  )?.role;
  const manager = role === 'OWNER' || role === 'ADMIN';
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <Section
        title="Métodos por población"
        description="El método que se usa por defecto para cada propósito según la población del paciente. En cada paciente se puede elegir otro."
      >
        <OrganizationMethodPreferences initial={preferences.data} canEdit={manager} />
      </Section>
      <Section title="Masa muscular de Lee">
        <LeeCoefficientSetting
          initial={settings.data['assessment.lee_reference_group_coefficient']}
          canEdit={manager}
        />
      </Section>
      <Section
        title="Registros del paciente"
        description="Hasta cuántos días atrás cada paciente agrega, corrige o anula lo que registró en su app."
      >
        <EditWindowSetting initial={settings.data['tracking.edit_window_days']} canEdit={manager} />
      </Section>
      <Section
        title="Umbrales del entrenamiento"
        description="Los usan la indicación del día en la app de cada paciente y el control semanal de su macrociclo. Un cambio no reescribe lo ya calculado."
      >
        <ReadinessThresholdsSetting initial={thresholds.data} canEdit={manager} />
      </Section>
      <Section
        title="Mensajes para todos los pacientes"
        description="Uno aparece cada día en Hoy, en la app de los pacientes que no tienen mensajes propios vigentes."
      >
        <MessagesPanel
          basePath="/motivational-messages"
          canWrite={manager}
          emptyText="Todavía no hay mensajes para todos."
        />
      </Section>
    </div>
  );
}
