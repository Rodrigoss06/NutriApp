import type {
  PlanListResponse,
  PlatformFeatureFlagsResponse,
  PlatformOrganizationListResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeatureFlagsForm } from '@/features/platform/feature-flags-form';
import { GraceDaysForm } from '@/features/platform/grace-days-form';
import { SubscriptionForm } from '@/features/platform/subscription-form';
import { serverApi } from '@/lib/api/server';
import { formatDate, todayIn } from '@/lib/dates';

export const metadata: Metadata = { title: 'Organización' };

/** Una organización en el panel interno (RF-39): su suscripción y el uso del cupo, renovar o cambiar de plan, gracia y banderas. */
export default async function PlatformOrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const [organizations, plans, flags] = await Promise.all([
    serverApi<PlatformOrganizationListResponse>('/platform/organizations'),
    serverApi<PlanListResponse>('/platform/plans'),
    serverApi<PlatformFeatureFlagsResponse>(
      `/platform/organizations/${encodeURIComponent(organizationId)}/flags`,
    ),
  ]);
  if (!organizations.ok || !plans.ok || !flags.ok) {
    if (!flags.ok && flags.status === 404) notFound();
    return <Notice tone="danger" title="No pudimos cargar la organización" />;
  }
  const organization = organizations.data.organizations.find((o) => o.id === organizationId);
  if (!organization) notFound();
  const subscription = organization.subscription;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          {organization.slug} · {organization.timezone}
        </p>
      </div>
      <section aria-labelledby="suscripcion" className="flex flex-col gap-3">
        <h2 id="suscripcion" className="text-lg font-semibold">
          Suscripción
        </h2>
        {subscription ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-sm text-muted-foreground">Plan</dt>
              <dd className="font-semibold">{subscription.planCode}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-sm text-muted-foreground">Vigencia</dt>
              <dd className="font-semibold">
                Del {formatDate(subscription.startsOn)} al {formatDate(subscription.endsOn)}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-sm text-muted-foreground">Uso del cupo</dt>
              <dd className="font-semibold tabular-nums">
                {organization.usage.activePatients} de {subscription.maxActivePatients} pacientes ·{' '}
                {organization.usage.activeProfessionals} de {subscription.maxProfessionals}{' '}
                profesionales
              </dd>
            </div>
          </dl>
        ) : (
          <Notice tone="warning" title="Sin suscripción vigente" />
        )}
        <SubscriptionForm
          organizationId={organization.id}
          plans={plans.data.plans.filter((plan) => plan.isActive)}
          currentPlan={subscription?.planCode ?? null}
          today={todayIn(organization.timezone)}
        />
      </section>
      <GraceDaysForm organizationId={organization.id} />
      <FeatureFlagsForm organizationId={organization.id} flags={flags.data.flags} />
    </>
  );
}
