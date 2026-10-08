import type { SubscriptionResponse } from '@nutricoach/contracts';
import { StatusBadge } from '@nutricoach/ui';
import { formatDate } from '@/lib/dates';
import { ORGANIZATION_STATUS_LABELS, pluralLabel } from './labels';

const pending = (n: number) =>
  n === 0
    ? ''
    : `, con ${String(n)} ${n === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}`;

/** Plan, vigencia, estado y uso del cupo (RF-03, RN-A03) con la etiqueta de paciente de la organización. */
export function SubscriptionSection({
  view,
  status,
  patientLabel,
}: {
  view: SubscriptionResponse;
  status: keyof typeof ORGANIZATION_STATUS_LABELS;
  patientLabel: string;
}) {
  const plan = view.subscription;
  const tone = status === 'ACTIVE' ? 'success' : status === 'READ_ONLY' ? 'warning' : 'danger';
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">Plan</dt>
        <dd className="font-medium">{plan ? plan.planName : 'Sin suscripción activa'}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">Estado</dt>
        <dd>
          <StatusBadge tone={tone}>{ORGANIZATION_STATUS_LABELS[status]}</StatusBadge>
        </dd>
      </div>
      {plan ? (
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Vigencia</dt>
          <dd>
            Del {formatDate(plan.startsOn)} al {formatDate(plan.endsOn)}
          </dd>
        </div>
      ) : null}
      {view.readOnlyFrom ? (
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Si no se renueva</dt>
          <dd>
            Pasa a solo lectura el {formatDate(view.readOnlyFrom)} ({String(view.graceDays)} días de
            gracia)
          </dd>
        </div>
      ) : null}
      {plan ? (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">Uso del cupo</dt>
          <dd className="flex flex-col gap-1 tabular-nums">
            <span>
              {pluralLabel(patientLabel)} activos: {String(view.usage.activePatients)} de{' '}
              {String(plan.maxActivePatients)}
            </span>
            <span>
              Profesionales: {String(view.usage.staff)} de {String(plan.maxProfessionals)}
              {pending(view.usage.pendingInvitations)}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
