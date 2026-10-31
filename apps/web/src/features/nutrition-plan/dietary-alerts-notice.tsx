import type { ClinicalHistoryResponse, FoodExclusionListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import Link from 'next/link';
import { CONDITION_KIND_LABELS } from '@/features/patients/labels';
import { serverApi } from '@/lib/api/server';
import { anamnesisNoteOf } from './dietary-alerts';

/**
 * Las alergias e intolerancias a la vista mientras se arma o se lee una dieta (07 §12, ADR-074), con los alimentos que
 * excluyen: la API no deja guardar ni publicar un plan con ellos (RN-E17). Lo no enlazado no se bloquea, y el aviso lo
 * dice. Si el plan vigente lleva uno, no cambia (RN-E15): lo avisa para crear una versión nueva. Si no se pudieron leer,
 * también lo dice: callar parecería que no hay ninguna. Leerlas deja sus READ en la auditoría (RN-B03).
 */
export async function DietaryAlertsNotice({ patientId }: { patientId: string }) {
  const id = encodeURIComponent(patientId);
  const [exclusions, history] = await Promise.all([
    serverApi<FoodExclusionListResponse>(`/patients/${id}/food-exclusions`),
    serverApi<ClinicalHistoryResponse>(`/patients/${id}/clinical-history`),
  ]);
  const records = (
    <Link href={`/panel/pacientes/${patientId}/registros`} className="underline">
      Condiciones, objetivos y notas
    </Link>
  );
  if (!exclusions.ok || !history.ok) {
    return (
      <Notice tone="warning" title="No pudimos cargar las alergias e intolerancias">
        Revísalas en {records} antes de armar la dieta.
      </Notice>
    );
  }
  const { conditions, publishedPlan } = exclusions.data;
  const note = anamnesisNoteOf(history.data.current);
  return (
    <>
      {publishedPlan ? (
        <Notice
          tone="danger"
          rule="RN-E17"
          title={`La versión ${String(publishedPlan.versionNo)} publicada lleva alimentos excluidos`}
        >
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1">
              {publishedPlan.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <p className="text-sm">
              Lo publicado no cambia y sigue vigente: abre la{' '}
              <Link
                href={`/panel/pacientes/${patientId}/dieta/${publishedPlan.id}`}
                className="underline"
              >
                versión {publishedPlan.versionNo}
              </Link>{' '}
              y crea una versión nueva sin ellos.
            </p>
          </div>
        </Notice>
      ) : null}
      {conditions.length === 0 && note === null ? null : (
        <Notice tone="warning" title="Alergias e intolerancias registradas">
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1">
              {conditions.map((condition) => (
                <li key={condition.conditionId}>
                  {CONDITION_KIND_LABELS[condition.kind]}: {condition.label}
                  {condition.foods.length > 0
                    ? ` · no se puede usar: ${condition.foods.map((food) => food.name).join(', ')}`
                    : ' · sin alimentos enlazados: no se bloquea nada'}
                </li>
              ))}
              {note === null ? null : (
                <li className="whitespace-pre-wrap">En la anamnesis: {note}</li>
              )}
            </ul>
            <p className="text-sm">
              Un plan con un alimento enlazado no se guarda ni se publica, tampoco si va dentro de
              una receta. Lo que no esté enlazado no se bloquea: se enlaza en {records}.
            </p>
          </div>
        </Notice>
      )}
    </>
  );
}
