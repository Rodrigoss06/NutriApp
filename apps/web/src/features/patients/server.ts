import 'server-only';
import type {
  MemberListResponse,
  OrganizationResponse,
  PatientResponse,
} from '@nutricoach/contracts';
import { cache } from 'react';
import { serverApi } from '@/lib/api/server';

/**
 * Lecturas compartidas en una misma petición: el layout del expediente y su página leen la ficha una sola vez, y la
 * auditoría registra un solo READ (RN-B03).
 */
export const getPatient = cache((patientId: string) =>
  serverApi<PatientResponse>(`/patients/${encodeURIComponent(patientId)}`),
);

export const getMembers = cache(() => serverApi<MemberListResponse>('/organization/members'));

export const getOrganization = cache(() => serverApi<OrganizationResponse>('/organization'));

/** La palabra con que la organización llama a sus pacientes (puede ser «Asesorado»). */
export async function patientLabel(): Promise<string> {
  const organization = await getOrganization();
  return organization.ok ? organization.data.patientLabel : 'Paciente';
}
