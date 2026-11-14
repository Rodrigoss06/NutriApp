import type {
  ChangeSubscription,
  CreateOrganization,
  CreatePlan,
  FeatureFlag,
  PlatformFeatureFlagsResponse,
  UpdatePlan,
} from '@nutricoach/contracts';
import { apiFetch } from '@/lib/api/client';

/** Alta de una organización con su primer plan y la invitación al dueño (ADR-034). */
export function createOrganization(input: CreateOrganization): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/platform/organizations', { method: 'POST', body: input });
}

/** Renovar o cambiar de plan (RN-A02): la suscripción anterior queda reemplazada. */
export async function changeSubscription(
  organizationId: string,
  input: ChangeSubscription,
): Promise<void> {
  await apiFetch<undefined>(`/platform/organizations/${organizationId}/subscriptions`, {
    method: 'POST',
    body: input,
  });
}

export async function setGraceDays(organizationId: string, value: number): Promise<void> {
  await apiFetch<undefined>(`/platform/organizations/${organizationId}/grace-days`, {
    method: 'PUT',
    body: { value },
  });
}

export function createPlan(input: CreatePlan): Promise<unknown> {
  return apiFetch('/platform/plans', { method: 'POST', body: input });
}

export function updatePlan(code: string, input: UpdatePlan): Promise<unknown> {
  return apiFetch(`/platform/plans/${encodeURIComponent(code)}`, { method: 'PATCH', body: input });
}

/** Encender o apagar una bandera de la organización (ADR-127). */
export function setFeatureFlag(
  organizationId: string,
  key: FeatureFlag,
  enabled: boolean,
): Promise<PlatformFeatureFlagsResponse> {
  return apiFetch<PlatformFeatureFlagsResponse>(
    `/platform/organizations/${organizationId}/flags/${key}`,
    { method: 'PUT', body: { enabled } },
  );
}

/** Soles a céntimos sin errores de coma flotante: «150.5» son 15050. */
export function toCents(soles: string): number {
  const [whole = '0', decimals = ''] = soles.trim().replace(',', '.').split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0').slice(0, 2));
}

export function fromCents(cents: number): string {
  return `${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}
