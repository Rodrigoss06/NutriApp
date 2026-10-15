import type {
  AccountResponse,
  OrganizationMethodPreferencesResponse,
  SettingsResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { LeeCoefficientSetting } from '@/features/assessment/lee-setting';
import { OrganizationMethodPreferences } from '@/features/assessment/method-preferences';
import { Section } from '@/features/patients/section';
import { getOrganization } from '@/features/patients/server';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Ajustes' };

/**
 * Ajustes de cálculo de la organización: los métodos por población (RF-16, RN-D05) y el coeficiente de Lee (RN-D11).
 * Los ven todos; los cambian el dueño y los administradores (la API decide).
 */
export default async function SettingsPage() {
  const [account, organization, preferences, settings] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    getOrganization(),
    serverApi<OrganizationMethodPreferencesResponse>('/organization/method-preferences'),
    serverApi<SettingsResponse>('/organization/settings'),
  ]);
  if (!account.ok || !organization.ok || !preferences.ok || !settings.ok) {
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
    </div>
  );
}
