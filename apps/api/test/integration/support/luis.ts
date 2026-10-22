import luisSeed from '../../../../../seeds/luis/luis.json' with { type: 'json' };
import type { ApiHarness, StaffOrganization } from './api-harness.js';

/**
 * El caso Luis por HTTP (03, casos dorados): un paciente sintético con su consentimiento de datos de salud, su
 * evaluación ISAK 2 cerrada y calculada, y su prescripción energética (G-12 a G-17). Lo crea el responsable.
 */
export async function luisWithPrescription(
  harness: ApiHarness,
  org: StaffOrganization,
): Promise<{ patientId: string; evaluationId: string; prescriptionId: string }> {
  const { owner, responsible } = org.staff;
  const { cookie } = responsible;
  await harness.put(
    '/organization/settings/assessment.lee_reference_group_coefficient',
    { value: 0 },
    owner.cookie,
  );
  const patientId = await patientWithConsent(harness, org, {
    firstName: 'Luis',
    lastName: 'Ejemplo Sintético',
    sex: 'M',
    birthDate: '1998-10-13',
  });

  const created = await harness.post(
    `/patients/${patientId}/evaluations`,
    {
      level: 'ISAK2',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
    },
    cookie,
  );
  let current = created.body as { id: string; version: number };
  for (const [siteCode, attempts] of Object.entries(luisSeed.evaluations.current.measurements)) {
    const response = await harness
      .put(`/evaluations/${current.id}/measurements/${siteCode}`, { attempts }, cookie)
      .set('If-Match', String(current.version));
    current = response.body as { id: string; version: number };
  }
  await harness
    .post(`/evaluations/${current.id}/close`, undefined, cookie)
    .set('If-Match', String(current.version));
  await harness.deliver('assessment.calculation');

  const prescribed = await harness.post(
    `/patients/${patientId}/energy-prescriptions`,
    { ...luisSeed.energyPrescription, evaluationId: current.id },
    cookie,
  );
  if (prescribed.status !== 201) throw new Error(JSON.stringify(prescribed.body));
  return {
    patientId,
    evaluationId: current.id,
    prescriptionId: (prescribed.body as { id: string }).id,
  };
}

/** Un paciente sintético con su consentimiento de datos de salud en consulta (RN-B01), creado por el responsable. */
export async function patientWithConsent(
  harness: ApiHarness,
  org: StaffOrganization,
  person: { firstName: string; lastName: string; sex: 'M' | 'F'; birthDate: string },
): Promise<string> {
  const { cookie } = org.staff.responsible;
  const registered = await harness.post('/patients', person, cookie);
  const patientId = (registered.body as { id: string }).id;
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  return patientId;
}
