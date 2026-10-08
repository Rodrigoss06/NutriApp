import type { SubscriptionResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import { formatDate, todayIn } from '@/lib/dates';

/**
 * Avisos de RN-A02 en todo el panel: en solo lectura, banner para todos; en gracia (vencida pero aún escribible),
 * para quien ve la suscripción (OWNER y ADMIN). Fechas en es-PE y en la zona de la organización.
 */
export function SubscriptionNotices({
  status,
  timezone,
  subscription,
}: {
  status: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'CLOSED';
  timezone: string;
  subscription: SubscriptionResponse | null;
}) {
  if (status === 'READ_ONLY') {
    return (
      <Notice tone="danger" title="La organización está en solo lectura" rule="RN-A02">
        La suscripción venció. Puedes consultar y exportar, pero no registrar ni editar hasta que se
        renueve.
      </Notice>
    );
  }
  const current = subscription?.subscription;
  if (!current || !subscription.readOnlyFrom) return null;
  if (todayIn(timezone) <= current.endsOn) return null;
  return (
    <Notice tone="warning" title="La suscripción venció" rule="RN-A02">
      La suscripción venció el {formatDate(current.endsOn)}; pasa a solo lectura el{' '}
      {formatDate(subscription.readOnlyFrom)}.{' '}
      <Link href="/panel/organizacion">Ver la suscripción</Link>
    </Notice>
  );
}
