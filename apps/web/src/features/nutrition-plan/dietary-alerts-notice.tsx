import type { ClinicalHistoryResponse, ConditionListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import { CONDITION_KIND_LABELS } from '@/features/patients/labels';
import { serverApi } from '@/lib/api/server';
import { dietaryAlertsOf } from './dietary-alerts';

/**
 * Las alergias e intolerancias a la vista mientras se arma o se lee una dieta (07 §12, ADR-073). Es un aviso: la exclusión
 * obligatoria necesita cruzarlas con los alimentos, y esa regla falta (P-17). Si no se pudieron leer, lo dice: callar
 * parecería que no hay ninguna. Leerlas deja sus READ en la auditoría (RN-B03).
 */
export async function DietaryAlertsNotice({ patientId }: { patientId: string }) {
  const id = encodeURIComponent(patientId);
  const [conditions, history] = await Promise.all([
    serverApi<ConditionListResponse>(`/patients/${id}/conditions`),
    serverApi<ClinicalHistoryResponse>(`/patients/${id}/clinical-history`),
  ]);
  const records = (
    <Link href={`/panel/pacientes/${patientId}/registros`} className="underline">
      Condiciones, objetivos y notas
    </Link>
  );
  if (!conditions.ok || !history.ok) {
    return (
      <Notice tone="warning" title="No pudimos cargar las alergias e intolerancias">
        Revísalas en {records} antes de armar la dieta.
      </Notice>
    );
  }
  const alerts = dietaryAlertsOf(conditions.data.conditions, history.data.current);
  if (alerts.conditions.length === 0 && alerts.anamnesisNote === null) return null;
  return (
    <Notice tone="warning" title="Alergias e intolerancias registradas">
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {alerts.conditions.map((condition) => (
            <li key={condition.id}>
              {CONDITION_KIND_LABELS[condition.kind]}: {condition.label}
            </li>
          ))}
          {alerts.anamnesisNote === null ? null : (
            <li className="whitespace-pre-wrap">En la anamnesis: {alerts.anamnesisNote}</li>
          )}
        </ul>
        <p className="text-sm">
          La app no las cruza con los alimentos del plan: revisa que no incluya ninguno que las
          cause. Se registran en {records}.
        </p>
      </div>
    </Notice>
  );
}
