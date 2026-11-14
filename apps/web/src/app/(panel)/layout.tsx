import type {
  AccountResponse,
  MemberProfileResponse,
  OrganizationResponse,
  SubscriptionResponse,
  SupportSession,
} from '@nutricoach/contracts';
import { BrandStyle, Notice } from '@nutricoach/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { organizationBrand } from '@/features/brand/organization-brand';
import { OrganizationChooser } from '@/features/session/organization-chooser';
import { PanelSessionProvider } from '@/features/session/panel-session';
import { LogoutButton, RedirectToLogin } from '@/features/session/session-actions';
import { SubscriptionNotices } from '@/features/session/subscription-notices';
import { PanelShell } from '@/features/shell/panel-shell';
import { SupportBanner } from '@/features/support/support-mode';
import { serverApi } from '@/lib/api/server';

/**
 * Panel del profesional (02 §11) con la marca de su organización (RN-H03). Pide la cuenta en cada petición: sin
 * sesión, a /entrar; con sesión de plataforma, al panel interno, salvo en modo soporte (RN-A09, ADR-130), que ve el panel de la
 * organización en solo lectura. La protección de verdad es la API.
 */
export default async function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await serverApi<AccountResponse>('/account');
  if (!account.ok) return <RedirectToLogin />;
  if (account.data.kind === 'PLATFORM') {
    if (!account.data.support) redirect('/admin/plataforma');
    return (
      <SupportPanel userId={account.data.id} support={account.data.support}>
        {children}
      </SupportPanel>
    );
  }
  if (account.data.kind === 'PATIENT') redirect('/mi/hoy');

  const { memberships, activeOrganizationId } = account.data;
  if (!activeOrganizationId) {
    if (memberships.length > 0) return <OrganizationChooser memberships={memberships} />;
    return <NoOrganization />;
  }
  const membership = memberships.find((m) => m.organizationId === activeOrganizationId);
  const organization = await serverApi<OrganizationResponse>('/organization');
  if (!membership || !organization.ok) {
    return memberships.length > 0 ? (
      <OrganizationChooser memberships={memberships} />
    ) : (
      <NoOrganization />
    );
  }

  const manager = membership.role === 'OWNER' || membership.role === 'ADMIN';
  const [profile, subscription] = await Promise.all([
    serverApi<MemberProfileResponse>('/organization/profile'),
    manager ? serverApi<SubscriptionResponse>('/organization/subscription') : null,
  ]);
  const brand = organizationBrand();
  const org = organization.data;

  return (
    <PanelSessionProvider
      value={{
        userId: account.data.id,
        role: membership.role,
        support: null,
        organizationId: org.id,
        organizationStatus: org.status,
        timezone: org.timezone,
        patientLabel: org.patientLabel,
      }}
    >
      <BrandStyle brand={brand.colors} />
      <PanelShell
        displayName={org.name}
        logoUrl={brand.logoUrl}
        patientLabel={org.patientLabel}
        showAudit={membership.role === 'OWNER'}
        organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
        activeOrganizationId={org.id}
        notices={
          <>
            <SubscriptionNotices
              status={org.status}
              timezone={org.timezone}
              subscription={subscription?.ok ? subscription.data : null}
            />
            {profile.ok && profile.data.profession === null ? (
              <Notice tone="info" title="Completa tu perfil profesional">
                Indica tu profesión en <Link href="/panel/cuenta#perfil">Mi cuenta</Link>.
              </Notice>
            ) : null}
          </>
        }
      >
        {children}
      </PanelShell>
    </PanelSessionProvider>
  );
}

/**
 * El panel de la organización en modo soporte: sin miembro, sin perfil ni cambio de organización; la franja del modo soporte arriba
 * y «Salir del modo soporte». Con ACCOUNT, sin pacientes ni agenda.
 */
async function SupportPanel({
  userId,
  support,
  children,
}: {
  userId: string;
  support: SupportSession;
  children: ReactNode;
}) {
  const organization = await serverApi<OrganizationResponse>('/organization');
  if (!organization.ok) redirect('/admin/plataforma');
  const brand = organizationBrand();
  const org = organization.data;
  return (
    <PanelSessionProvider
      value={{
        userId,
        role: 'SUPPORT',
        support,
        organizationId: org.id,
        organizationStatus: org.status,
        timezone: org.timezone,
        patientLabel: org.patientLabel,
      }}
    >
      <BrandStyle brand={brand.colors} />
      <PanelShell
        displayName={org.name}
        logoUrl={brand.logoUrl}
        patientLabel={org.patientLabel}
        organizations={[]}
        activeOrganizationId={org.id}
        support={{ clinical: support.scope === 'CLINICAL_READ' }}
        notices={<SupportBanner support={support} timezone={org.timezone} />}
      >
        {children}
      </PanelShell>
    </PanelSessionProvider>
  );
}

function NoOrganization() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sin organización activa</h1>
      <p className="text-muted-foreground">
        No perteneces a ninguna organización activa. Pide una invitación a quien administra tu
        organización.
      </p>
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
