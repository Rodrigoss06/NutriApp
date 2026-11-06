import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { apiAs, grantInPersonByApi } from './stack';

interface Evaluation {
  readonly measurements: Readonly<Record<string, readonly number[]>>;
}
interface LuisSeed {
  readonly technicalErrorStudy: { readonly sites: readonly unknown[] };
  readonly evaluations: { readonly previous: Evaluation; readonly current: Evaluation };
}

const luis = JSON.parse(
  readFileSync(new URL('../../../../seeds/luis/luis.json', import.meta.url), 'utf8'),
) as LuisSeed;

/**
 * Luis con sus dos evaluaciones ISAK 2 cerradas (la de septiembre y la de octubre de la semilla) y el estudio de ETM de su
 * evaluadora (G-04), por la API. El worker calcula los resultados al cerrar; se espera a que la evolución los tenga.
 */
export async function luisWithTwoEvaluationsByApi(
  ownerEmail: string,
): Promise<{ readonly luisId: string; readonly currentId: string }> {
  const api = await apiAs(ownerEmail);
  const lee = await api.put(
    '/api/v1/organization/settings/assessment.lee_reference_group_coefficient',
    {
      data: { value: 0 },
    },
  );
  expect(lee.status(), 'fijar el coeficiente de Lee').toBe(200);
  const created = await api.post('/api/v1/patients', {
    data: { firstName: 'Luis', lastName: 'Ejemplo Sintético', sex: 'M', birthDate: '1998-10-13' },
  });
  expect(created.status(), 'registrar a Luis').toBe(201);
  const { id: luisId } = (await created.json()) as { id: string };
  await grantInPersonByApi(ownerEmail, luisId, 'HEALTH_DATA');
  const listed = await api.get('/api/v1/organization/members');
  const { members } = (await listed.json()) as { members: { id: string; email: string }[] };
  const memberId = members.find((member) => member.email === ownerEmail)?.id ?? '';
  const study = await api.post(`/api/v1/members/${memberId}/technical-errors`, {
    data: { source: 'CALCULATED', validFrom: '2026-07-15', sites: luis.technicalErrorStudy.sites },
  });
  expect(study.status(), 'registrar el ETM').toBe(201);
  let currentId = '';
  for (const [measuredAt, evaluation] of [
    ['2026-09-15T13:30:00.000Z', luis.evaluations.previous],
    ['2026-10-13T13:30:00.000Z', luis.evaluations.current],
  ] as const) {
    const opened = await api.post(`/api/v1/patients/${luisId}/evaluations`, {
      data: {
        level: 'ISAK2',
        measuredAt,
        conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
      },
    });
    expect(opened.status(), 'crear la evaluación').toBe(201);
    let current = (await opened.json()) as { id: string; version: number };
    for (const [siteCode, attempts] of Object.entries(evaluation.measurements)) {
      const measured = await api.put(`/api/v1/evaluations/${current.id}/measurements/${siteCode}`, {
        data: { attempts },
        headers: { 'If-Match': String(current.version) },
      });
      expect(measured.ok(), `medir ${siteCode}`).toBe(true);
      current = (await measured.json()) as { id: string; version: number };
    }
    const closed = await api.post(`/api/v1/evaluations/${current.id}/close`, {
      headers: { 'If-Match': String(current.version) },
    });
    expect(closed.ok(), 'cerrar la evaluación').toBe(true);
    currentId = current.id;
  }
  await expect
    .poll(
      async () => {
        const evolution = await api.get(`/api/v1/patients/${luisId}/evolution`);
        const body = (await evolution.json()) as { metrics: { points: unknown[] }[] };
        return body.metrics.some((metric) => metric.points.length === 2);
      },
      {
        message: 'los resultados de las dos evaluaciones',
        timeout: 30_000,
        intervals: [500, 1_000],
      },
    )
    .toBe(true);
  await api.dispose();
  return { luisId, currentId };
}
