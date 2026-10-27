import type { DocumentStatusResponse, GeneratedDocument } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  readySheet,
  SHEET_MAX_WAIT_MS,
  SHEET_POLL_MS,
  SheetTimeout,
  statusQuery,
  type SheetRequestPorts,
} from './sheet-request';

const SHEET: GeneratedDocument = {
  id: '019a1c00-0000-7000-8000-0000000000d1',
  kind: 'EXCHANGE_DIET',
  sourceType: 'NUTRITION_PLAN',
  sourceId: '019a1c00-0000-7000-8000-0000000000a1',
  templateVersion: '1.0.0',
  sha256: 'a'.repeat(64),
  generatedAt: '2026-10-27T15:00:00.000Z',
  fileName: 'ficha-dieta-por-intercambios.pdf',
};
const READY: DocumentStatusResponse = { status: 'READY', document: SHEET };

/** Un reloj que avanza solo cuando se espera, y cuántas veces se preguntó. */
function ports(
  first: DocumentStatusResponse | undefined,
  later: readonly DocumentStatusResponse[],
) {
  let clock = 0;
  let asked = 0;
  const value: SheetRequestPorts = {
    request: () => Promise.resolve(first),
    status: () => Promise.resolve(later[Math.min(asked++, later.length - 1)] ?? READY),
    wait: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
  };
  return { value, asked: () => asked, elapsed: () => clock };
}

describe('RF-24 · RN-H02 · descargar una ficha desde el panel', () => {
  it('si ya existe un PDF igual, se descarga sin esperar', async () => {
    const fake = ports(READY, []);
    expect(await readySheet(fake.value)).toEqual(SHEET);
    expect(fake.asked()).toBe(0);
  });

  it('si la genera el worker (202), se pregunta cada segundo hasta que esté', async () => {
    const fake = ports(undefined, [{ status: 'PENDING' }, { status: 'PENDING' }, READY]);
    expect(await readySheet(fake.value)).toEqual(SHEET);
    expect(fake.asked()).toBe(3);
    expect(fake.elapsed()).toBe(3 * SHEET_POLL_MS);
  });

  it('pasado un minuto sin la ficha, deja de preguntar y avisa', async () => {
    const fake = ports(undefined, [{ status: 'PENDING' }]);
    await expect(readySheet(fake.value)).rejects.toBeInstanceOf(SheetTimeout);
    expect(fake.asked()).toBe(SHEET_MAX_WAIT_MS / SHEET_POLL_MS);
  });

  it('el estado se pregunta por el mismo origen', () => {
    expect(statusQuery({ sourceType: 'EVALUATION', sourceId: SHEET.sourceId })).toBe(
      `sourceType=EVALUATION&sourceId=${SHEET.sourceId}`,
    );
  });
});
