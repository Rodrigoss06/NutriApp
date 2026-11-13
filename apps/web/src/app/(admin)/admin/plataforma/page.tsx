import type {
  PlanListResponse,
  PlatformOrganizationListResponse,
  PlatformSupportGrantListResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { CreateOrganizationForm } from '@/features/platform/create-organization-form';
import { OrganizationList } from '@/features/platform/organization-list';
import { SupportGrantsList } from '@/features/support/support-mode';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Panel interno' };

/**
 * Las organizaciones con su plan, su vigencia y el uso del cupo (RF-39, RN-A03); el alta de una nueva (ADR-034); y los permisos de
 * soporte vigentes de quien entra, para mirar una organización en modo soporte (RN-A09, ADR-130).
 */
export default async function PlatformPage() {
  const [organizations, plans, supportGrants] = await Promise.all([
    serverApi<PlatformOrganizationListResponse>('/platform/organizations'),
    serverApi<PlanListResponse>('/platform/plans'),
    serverApi<PlatformSupportGrantListResponse>('/platform/support/grants'),
  ]);
  if (!organizations.ok || !plans.ok) {
    return <Notice tone="danger" title="No pudimos cargar el panel interno" />;
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Organizaciones</h1>
      <OrganizationList organizations={organizations.data.organizations} />
      <CreateOrganizationForm
        plans={plans.data.plans.filter((plan) => plan.isActive)}
        today={todayIn('America/Lima')}
      />
      <section aria-labelledby="soporte" className="flex flex-col gap-3">
        <h2 id="soporte" className="text-lg font-semibold">
          Tus permisos de soporte
        </h2>
        {supportGrants.ok ? (
          <SupportGrantsList grants={supportGrants.data.grants} />
        ) : (
          <Notice tone="danger" title="No pudimos cargar tus permisos de soporte" />
        )}
      </section>
    </>
  );
}
