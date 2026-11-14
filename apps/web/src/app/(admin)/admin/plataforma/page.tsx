import type { PlanListResponse, PlatformOrganizationListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { CreateOrganizationForm } from '@/features/platform/create-organization-form';
import { OrganizationList } from '@/features/platform/organization-list';
import { serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Panel interno' };

/** Las organizaciones con su plan, su vigencia y el uso del cupo (RF-39, RN-A03); el alta de una nueva (ADR-034). */
export default async function PlatformPage() {
  const [organizations, plans] = await Promise.all([
    serverApi<PlatformOrganizationListResponse>('/platform/organizations'),
    serverApi<PlanListResponse>('/platform/plans'),
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
    </>
  );
}
