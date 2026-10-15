import type {
  AccountResponse,
  MemberProfileResponse,
  SessionListResponse,
  TechnicalErrorsResponse,
} from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  ChangePasswordForm,
  NameForm,
  ProfessionalProfileForm,
  SessionsSection,
} from '@/features/account/account-forms';
import { getSites } from '@/features/assessment/server';
import { TechnicalErrorSection } from '@/features/assessment/technical-error-section';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Mi cuenta' };

/** La propia cuenta: nombre, contraseña, sesiones activas, perfil profesional y ETM (RF-12). */
export default async function AccountPage() {
  const [account, sessions, profile] = await Promise.all([
    serverApi<AccountResponse>('/account'),
    serverApi<SessionListResponse>('/account/sessions'),
    serverApi<MemberProfileResponse>('/organization/profile'),
  ]);
  if (!account.ok || !sessions.ok)
    return <Notice tone="danger" title="No pudimos cargar tu cuenta" />;
  const [technicalErrors, sites] = profile.ok
    ? await Promise.all([
        serverApi<TechnicalErrorsResponse>(`/members/${profile.data.memberId}/technical-errors`),
        getSites(),
      ])
    : [null, null];
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <Section id="datos" title="Datos">
        <p className="text-sm text-muted-foreground">Correo: {account.data.email}</p>
        <NameForm displayName={account.data.displayName} />
      </Section>
      {profile.ok ? (
        <Section id="perfil" title="Perfil profesional">
          <ProfessionalProfileForm profile={profile.data} />
        </Section>
      ) : null}
      {profile.ok && technicalErrors?.ok && sites.ok ? (
        <Section id="etm" title="Error técnico de medida (ETM)">
          <TechnicalErrorSection
            memberId={profile.data.memberId}
            initial={technicalErrors.data}
            sites={sites.data.sites}
          />
        </Section>
      ) : null}
      <Section id="contrasena" title="Contraseña">
        <ChangePasswordForm email={account.data.email} />
      </Section>
      <Section id="sesiones" title="Sesiones activas">
        <SessionsSection sessions={sessions.data.sessions} />
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
