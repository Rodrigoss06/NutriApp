import 'server-only';
import type {
  EvaluationListResponse,
  EvaluationResponse,
  MeasurementSiteListResponse,
} from '@nutricoach/contracts';
import { cache } from 'react';
import { serverApi } from '@/lib/api/server';

/** Lecturas de una misma petición: cada una deja un solo READ en la auditoría (RN-B03). */
export const getSites = cache(() => serverApi<MeasurementSiteListResponse>('/measurement-sites'));

export const getEvaluations = cache((patientId: string) =>
  serverApi<EvaluationListResponse>(`/patients/${encodeURIComponent(patientId)}/evaluations`),
);

export const getEvaluation = cache((evaluationId: string) =>
  serverApi<EvaluationResponse>(`/evaluations/${encodeURIComponent(evaluationId)}`),
);
