import type { PlatformOrganizationListResponse } from '@nutricoach/contracts';
import { EmptyState, StatusBadge } from '@nutricoach/ui';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatDate } from '@/lib/dates';

type Organization = PlatformOrganizationListResponse['organizations'][number];

const STATUS: Readonly<
  Record<Organization['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }>
> = {
  ACTIVE: { label: 'Activa', tone: 'success' },
  READ_ONLY: { label: 'Solo lectura', tone: 'warning' },
  SUSPENDED: { label: 'Suspendida', tone: 'danger' },
  CLOSED: { label: 'Cerrada', tone: 'info' },
};

/** El uso del cupo: «3 de 5»; al límite, en ámbar (RN-A03). */
function Usage({ used, limit }: { used: number; limit: number | undefined }) {
  if (limit === undefined) return <span className="tabular-nums">{used}</span>;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      {used} de {limit}
      {used >= limit ? <StatusBadge tone="warning">Al límite</StatusBadge> : null}
    </span>
  );
}

/** Las organizaciones de la plataforma con su plan, su vigencia y el uso del cupo: solo cuentas (RN-A09). */
export function OrganizationList({ organizations }: { organizations: readonly Organization[] }) {
  if (organizations.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Todavía no hay organizaciones"
        description="Crea la primera abajo."
      />
    );
  }
  return (
    <TableScroll label="Organizaciones">
      <table className="w-full min-w-[48rem] text-sm">
        <caption className="sr-only">Organizaciones, con su plan y el uso del cupo</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="p-2 font-medium">
              Organización
            </th>
            <th scope="col" className="p-2 font-medium">
              Estado
            </th>
            <th scope="col" className="p-2 font-medium">
              Plan
            </th>
            <th scope="col" className="p-2 font-medium">
              Vence
            </th>
            <th scope="col" className="p-2 font-medium">
              Pacientes activos
            </th>
            <th scope="col" className="p-2 font-medium">
              Profesionales
            </th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((organization) => (
            <tr key={organization.id} className="border-b border-border">
              <th scope="row" className="p-2 text-left font-normal">
                <Link
                  href={`/admin/plataforma/organizaciones/${organization.id}`}
                  className="font-medium text-brand-text underline"
                >
                  {organization.name}
                </Link>
                <span className="block text-muted-foreground">{organization.slug}</span>
              </th>
              <td className="p-2">
                <StatusBadge tone={STATUS[organization.status].tone}>
                  {STATUS[organization.status].label}
                </StatusBadge>
              </td>
              <td className="p-2">{organization.subscription?.planCode ?? 'Sin plan'}</td>
              <td className="p-2">
                {organization.subscription ? formatDate(organization.subscription.endsOn) : '—'}
              </td>
              <td className="p-2">
                <Usage
                  used={organization.usage.activePatients}
                  limit={organization.subscription?.maxActivePatients}
                />
              </td>
              <td className="p-2">
                <Usage
                  used={organization.usage.activeProfessionals}
                  limit={organization.subscription?.maxProfessionals}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
