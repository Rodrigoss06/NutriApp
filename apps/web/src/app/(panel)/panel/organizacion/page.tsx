import type {
  AccountResponse,
  InvitationListResponse,
  MemberListResponse,
  OrganizationResponse,
  SubscriptionResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { InvitationsSection } from '@/features/organization/invitations-section';
import { MembersSection } from '@/features/organization/members-section';
import { OrganizationForm } from '@/features/organization/organization-form';
import { SubscriptionSection } from '@/features/organization/subscription-section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Organización' };

/** La organización activa (RF-02, RF-03). La interfaz oculta lo que el rol no puede hacer; la API decide. */
export default async function OrganizationPage() {
  const [account, organization, members] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    serverApi<OrganizationResponse>('/organization'),
    serverApi<MemberListResponse>('/organization/members'),
  ]);
  if (!account.ok || !organization.ok || !members.ok) {
    return <Notice tone="danger" title="No pudimos cargar la organización" />;
  }
  const role = account.data.memberships.find(
    (m) => m.organizationId === organization.data.id,
  )?.role;
  const manager = role === 'OWNER' || role === 'ADMIN';
  const [invitations, subscription] = manager
    ? await Promise.all([
        serverApi<InvitationListResponse>('/organization/invitations'),
        serverApi<SubscriptionResponse>('/organization/subscription'),
      ])
    : [null, null];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Organización</h1>
      <Section title="Datos">
        <OrganizationForm organization={organization.data} />
      </Section>
      {subscription?.ok ? (
        <Section title="Suscripción y cupo">
          <SubscriptionSection
            view={subscription.data}
            status={organization.data.status}
            patientLabel={organization.data.patientLabel}
          />
        </Section>
      ) : null}
      <Section title="Miembros">
        <MembersSection members={members.data.members} />
      </Section>
      {invitations?.ok ? (
        <Section title="Invitaciones pendientes">
          <InvitationsSection invitations={invitations.data.invitations} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `seccion-${title
    .normalize('NFD')
    .replace(/[^A-Za-z]+/g, '-')
    .toLowerCase()}`;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
