import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { apiAs, grantInPersonByApi } from './stack';

interface LuisSeed {
  readonly evaluations: {
    current: { measurements: Readonly<Record<string, readonly number[]>> };
  };
  readonly energyPrescription: Readonly<Record<string, unknown>>;
}

const luis = JSON.parse(
  readFileSync(new URL('../../../../seeds/luis/luis.json', import.meta.url), 'utf8'),
) as LuisSeed;

export interface Versioned {
  readonly id: string;
  readonly version: number;
}

/** Luis con su consentimiento, su evaluación ISAK 2 cerrada y su prescripción energética (G-12 a G-17). */
export async function luisWithPrescription(ownerEmail: string): Promise<string> {
  const api = await apiAs(ownerEmail);
  const created = await api.post('/api/v1/patients', {
    data: { firstName: 'Luis', lastName: 'Ejemplo Sintético', sex: 'M', birthDate: '1998-10-13' },
  });
  expect(created.status(), 'registrar a Luis').toBe(201);
  const { id } = (await created.json()) as { id: string };
  await grantInPersonByApi(ownerEmail, id, 'HEALTH_DATA');
  const evaluation = await api.post(`/api/v1/patients/${id}/evaluations`, {
    data: {
      level: 'ISAK2',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
    },
  });
  expect(evaluation.status(), 'crear la evaluación').toBe(201);
  let current = (await evaluation.json()) as Versioned;
  for (const [siteCode, attempts] of Object.entries(luis.evaluations.current.measurements)) {
    const measured = await api.put(`/api/v1/evaluations/${current.id}/measurements/${siteCode}`, {
      data: { attempts },
      headers: { 'If-Match': String(current.version) },
    });
    expect(measured.ok(), `medir ${siteCode}`).toBe(true);
    current = (await measured.json()) as Versioned;
  }
  const closed = await api.post(`/api/v1/evaluations/${current.id}/close`, {
    headers: { 'If-Match': String(current.version) },
  });
  expect(closed.ok(), 'cerrar la evaluación').toBe(true);
  // El worker calcula los resultados al cerrar; la proyección del peso objetivo los usa.
  await expect(async () => {
    const prescribed = await api.post(`/api/v1/patients/${id}/energy-prescriptions`, {
      data: { ...luis.energyPrescription, evaluationId: current.id },
    });
    expect(prescribed.status(), 'prescribir').toBe(201);
  }).toPass({ timeout: 20_000 });
  await api.dispose();
  return id;
}
