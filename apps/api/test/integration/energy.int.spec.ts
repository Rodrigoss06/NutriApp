import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import luisSeed from '../../../../seeds/luis/luis.json' with { type: 'json' };
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, PG, pool, withContext } from './support/database.js';

/**
 * P7 (PR 3) · prescripción energética por HTTP contra PostgreSQL como app_user: actividades del Compendium (RN-E03),
 * base con las cinco TMR (RN-E01, G-13), vista previa y prescripción con cada componente y su método (G-12 a G-17),
 * inmutable (RN-D08), con consentimiento y equipo de atención (RN-B01, RN-A05).
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let patientId: string;
let evaluationId: string;

interface Prescription {
  id: string;
  rmr: { methodCode: string; rmrKcal: number };
  tee: { methodCode: string; baseKcal: number; teeKcal: number };
  exercise: { dailyAverageNetKcal: number; activities: { netKcalPerSession: number }[] };
  adjustment: { adjustmentKcal: number; weeklyRatePct: number };
  targetKcal: number;
  projection: { targetWeightKg: number; monthsToTarget: number } | null;
  macros: { proteinG: number; fatG: number; choG: number };
}

const REQUEST = () => ({ ...luisSeed.energyPrescription, evaluationId });

async function patient(consent = true): Promise<string> {
  const { cookie } = org.staff.responsible;
  const registered = await harness.post(
    '/patients',
    { firstName: 'Luis', lastName: 'Ejemplo Sintético', sex: 'M', birthDate: '1998-10-13' },
    cookie,
  );
  const id = (registered.body as { id: string }).id;
  if (consent) {
    const listed = await harness.get('/patients/consent-documents', cookie);
    const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
    await harness
      .post(`/patients/${id}/consents`, undefined, cookie)
      .field('consentDocumentId', documents.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '')
      .field('channel', 'IN_PERSON_DIGITAL');
  }
  return id;
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  const { owner, responsible } = org.staff;
  await harness.put(
    '/organization/settings/assessment.lee_reference_group_coefficient',
    { value: 0 },
    owner.cookie,
  );
  patientId = await patient();
  const created = await harness.post(
    `/patients/${patientId}/evaluations`,
    {
      level: 'ISAK2',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
    },
    responsible.cookie,
  );
  let current = created.body as { id: string; version: number };
  for (const [siteCode, attempts] of Object.entries(luisSeed.evaluations.current.measurements)) {
    const response = await harness
      .put(`/evaluations/${current.id}/measurements/${siteCode}`, { attempts }, responsible.cookie)
      .set('If-Match', String(current.version));
    current = response.body as { id: string; version: number };
  }
  await harness
    .post(`/evaluations/${current.id}/close`, undefined, responsible.cookie)
    .set('If-Match', String(current.version));
  evaluationId = current.id;
  await harness.deliver('assessment.calculation');
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-E03 · actividades del Compendium 2024', () => {
  it('busca sin tildes y trae el MET; correr a 6 mph es 9.3 (G-15)', async () => {
    const { cookie } = org.staff.responsible;
    const running = await harness.get('/physical-activities?q=correr', cookie);
    expect((running.body as { activities: unknown[] }).activities).toEqual([
      expect.objectContaining({ code: '12050', met: 9.3, sourceVersion: 'COMPENDIUM_2024' }),
    ]);
    const soccer = await harness.get('/physical-activities?q=futbol', cookie);
    expect(
      (soccer.body as { activities: { code: string }[] }).activities.map((a) => a.code),
    ).toEqual(['15610']);
    const all = await harness.get('/physical-activities', cookie);
    expect((all.body as { activities: unknown[] }).activities).toHaveLength(9);
  });
});

describe('RF-17 · prescripción energética', () => {
  it('G-13 · la base trae la composición de Luis y las cinco TMR con su método', async () => {
    const response = await harness.get(
      `/patients/${patientId}/energy-basis`,
      org.staff.responsible.cookie,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const basis = response.body as {
      ageYears: number;
      weightKg: number;
      heightCm: number;
      fatFreeMass: { kg: number; methodCode: string };
      rmrOptions: { methodCode: string; rmrKcal: number }[];
    };
    expect(basis).toMatchObject({ ageYears: 28, weightKg: 80 });
    expect(basis.heightCm).toBeCloseTo(175, 9);
    expect(basis.fatFreeMass.methodCode).toBe('FAT_DW1974_SIRI1961');
    expect(basis.fatFreeMass.kg).toBeCloseTo(63.79, 2);
    const expected = luisSeed.expected['G-13'] as Record<string, number>;
    for (const option of basis.rmrOptions) {
      expect(option.rmrKcal, option.methodCode).toBeCloseTo(expected[option.methodCode] ?? 0, -0.3);
    }
  });

  it('la vista previa calcula sin guardar', async () => {
    const response = await harness.post(
      `/patients/${patientId}/energy-prescriptions/preview`,
      REQUEST(),
      org.staff.responsible.cookie,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((response.body as Prescription).targetKcal).toBeCloseTo(1835, -0.3);
    const { rows } = await pool('owner').query(
      `SELECT 1 FROM nutrition.energy_prescription WHERE patient_id = $1`,
      [patientId],
    );
    expect(rows).toHaveLength(0);
  });

  it('criterio P7 · G-14 a G-17 guardados con cada componente y su método; no se edita', async () => {
    const response = await harness.post(
      `/patients/${patientId}/energy-prescriptions`,
      REQUEST(),
      org.staff.responsible.cookie,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const prescription = response.body as Prescription;
    expect(prescription.rmr).toMatchObject({ methodCode: 'RMR_MIFFLIN1990' });
    expect(prescription.tee.methodCode).toBe('TEE_PAL');
    expect(prescription.tee.baseKcal).toBeCloseTo(2462, -0.3);
    expect(prescription.exercise.activities[0]?.netKcalPerSession).toBeCloseTo(332, -0.3);
    expect(prescription.exercise.dailyAverageNetKcal).toBeCloseTo(142, -0.3);
    expect(prescription.tee.teeKcal).toBeCloseTo(2605, -0.3);
    expect(prescription.adjustment.adjustmentKcal).toBeCloseTo(-770, -0.3);
    expect(prescription.adjustment.weeklyRatePct).toBeCloseTo(0.86, 2);
    expect(prescription.targetKcal).toBeCloseTo(1835, -0.3);
    expect(prescription.projection?.targetWeightKg).toBeCloseTo(75.05, 2);
    expect(prescription.projection?.monthsToTarget).toBeCloseTo(1.65, 2);
    expect(prescription.macros.proteinG).toBeCloseTo(160, -0.3);
    expect(prescription.macros.fatG).toBeCloseTo(51, -0.3);
    expect(prescription.macros.choG).toBeCloseTo(184, -0.3);
    const { rows } = await pool('owner').query<{ tee_method_code: string; target_kcal: string }>(
      `SELECT tee_method_code, target_kcal FROM nutrition.energy_prescription WHERE id = $1`,
      [prescription.id],
    );
    expect(rows[0]).toMatchObject({ tee_method_code: 'TEE_PAL' });
    expect(Number(rows[0]?.target_kcal)).toBeCloseTo(1835, -0.3);
    const { responsible } = org.staff;
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        userId: responsible.userId,
        role: 'PROFESSIONAL',
        memberId: responsible.memberId,
      },
      async (client) => {
        expect(
          await errorCode(
            client,
            `UPDATE nutrition.energy_prescription SET target_kcal = 2000 WHERE id = $1`,
            [prescription.id],
          ),
        ).toBe(PG.insufficientPrivilege);
      },
    );
    const listed = await harness.get(
      `/patients/${patientId}/energy-prescriptions`,
      responsible.cookie,
    );
    expect((listed.body as { prescriptions: { id: string }[] }).prescriptions[0]?.id).toBe(
      prescription.id,
    );
    expect(
      (await harness.get(`/energy-prescriptions/${prescription.id}`, responsible.cookie)).status,
    ).toBe(200);
    const timeline = await harness.get(
      `/patients/${patientId}/timeline?limit=10`,
      responsible.cookie,
    );
    expect(
      (timeline.body as { items: { kind: string; label: string }[] }).items.find(
        (item) => item.kind === 'ENERGY_PRESCRIBED',
      ),
    ).toMatchObject({ label: 'LOSE_FAT' });
  });

  it('422 con su regla: actividad desconocida (RN-E03) y carbohidratos negativos (RN-E07); 400 con PAL fuera de rango', async () => {
    const { cookie } = org.staff.responsible;
    const unknown = await harness.post(
      `/patients/${patientId}/energy-prescriptions`,
      {
        ...REQUEST(),
        activities: [{ activityCode: '99999', minutesPerSession: 30, sessionsPerWeek: 3 }],
      },
      cookie,
    );
    expect(unknown.status).toBe(422);
    expect(unknown.body).toMatchObject({ code: 'NC-NUT-003', rule: 'RN-E03' });
    const negative = await harness.post(
      `/patients/${patientId}/energy-prescriptions`,
      { ...REQUEST(), proteinGPerKg: 4, fatPctKcal: 45 },
      cookie,
    );
    expect(negative.status).toBe(422);
    expect(negative.body).toMatchObject({ code: 'NC-NUT-004', rule: 'RN-E07' });
    const pal = await harness.post(
      `/patients/${patientId}/energy-prescriptions`,
      { ...REQUEST(), pal: 2.5 },
      cookie,
    );
    expect(pal.status).toBe(400);
  });

  it('RN-A05 · RN-B01 · con lectura se ve y no se prescribe; fuera del equipo no existe; sin evaluación, 422', async () => {
    const { responsible, team, outsider } = org.staff;
    await harness.put(
      `/patients/${patientId}/care-team/${team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      responsible.cookie,
    );
    expect((await harness.get(`/patients/${patientId}/energy-basis`, team.cookie)).status).toBe(
      200,
    );
    expect(
      (await harness.post(`/patients/${patientId}/energy-prescriptions`, REQUEST(), team.cookie))
        .status,
    ).toBe(403);
    expect((await harness.get(`/patients/${patientId}/energy-basis`, outsider.cookie)).status).toBe(
      404,
    );
    const without = await patient();
    const basis = await harness.get(`/patients/${without}/energy-basis`, responsible.cookie);
    expect(basis.status).toBe(422);
    expect(basis.body).toMatchObject({ code: 'NC-NUT-002' });
  });
});
