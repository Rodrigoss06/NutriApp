import { describe, expect, it } from 'vitest';
import {
  instantAt,
  localDateIn,
  pickSample,
  readTemplate,
  type TemplateInput,
  type TemplateRecord,
} from './account-import.js';
import { TEMPLATE_COLUMNS } from './account-template.js';

const TODAY = '2026-11-14';

const file = (header: readonly string[], rows: readonly (readonly string[])[]) => ({
  records: [header, ...rows].map((cells, i): TemplateRecord => ({ row: i + 1, cells })),
});

const patient = (id: string, sex = 'F'): string[] => [
  id,
  'Nombre',
  'Apellido',
  sex,
  '1990-01-01',
  '',
  '',
  '',
  '',
  '',
  'SI',
  '2024-01-01',
];

const input = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
  pacientes: file(TEMPLATE_COLUMNS.pacientes, [
    patient('NP-1'),
    patient('NP-2'),
    patient('NP-3', 'X'),
  ]),
  evaluaciones: file(TEMPLATE_COLUMNS.evaluaciones, [
    ['EV-1', 'NP-1', '2025-02-10', 'BASICO', '', ''],
    ['EV-2', 'NP-3', '2025-02-10', 'BASICO', '', ''],
    ['EV-3', 'NP-2', '2025-02-10', 'BASICO', '', ''],
    ['EV-4', 'NP-2', '2025-02-11', 'BASICO', '', ''],
    ['EV-1', 'NP-2', '2025-02-12', 'BASICO', '', ''],
    ['EV-5', 'NP-1', '2025-02-13', 'BASICO', '', ''],
  ]),
  tomas: file(TEMPLATE_COLUMNS.tomas, [
    ['EV-1', 'BASIC_WEIGHT', '70', '70', '', ''],
    ['EV-1', 'BASIC_HEIGHT', '170', '170', '', ''],
    ['EV-5', 'BASIC_WEIGHT', '70', '70', '', ''],
    ['EV-2', 'BASIC_WEIGHT', '70', '70', '', ''],
    ['EV-3', 'BASIC_WEIGHT', '70', '70', '', ''],
    ['EV-3', 'BASIC_HEIGHT', '17,0', '17,0', '', ''],
    ['EV-9', 'BASIC_WEIGHT', '70', '70', '', ''],
    ['EV-5', 'BASIC_WEIGHT', '71', '71', '', ''],
  ]),
  planes: file(TEMPLATE_COLUMNS.planes, [
    ['PL-1', 'NP-1', '2025-02-10', '', '1800', '', '', '', '', ''],
    ['PL-2', 'NP-3', '2025-02-10', '', '1800', '', '', '', '', ''],
  ]),
  ...overrides,
});

describe('RF-40 · RN-I05 · la carpeta de una cuenta', () => {
  it('lo que puede entrar y, por archivo, cada fila que no con su motivo', () => {
    const template = readTemplate(input(), TODAY);
    expect(template.patients.map((p) => p.externalId)).toEqual(['NP-1', 'NP-2']);
    expect(template.evaluations.map((e) => [e.externalId, e.measurements.length])).toEqual([
      ['EV-1', 2],
    ]);
    expect(template.plans.map((p) => p.externalId)).toEqual(['PL-1']);
    expect(template.totals).toEqual({ pacientes: 3, evaluaciones: 6, tomas: 8, planes: 2 });
    expect(template.errors).toEqual({
      pacientes: [{ row: 4, messages: ['sexo: F o M.'] }],
      evaluaciones: [
        {
          row: 3,
          messages: ['id_paciente: NP-3 no está en pacientes.csv o su fila tiene errores.'],
        },
        { row: 4, messages: ['Tiene tomas con error en tomas.csv (fila 7).'] },
        { row: 5, messages: ['No tiene tomas en tomas.csv.'] },
        { row: 6, messages: ['id_origen EV-1 repetido: ya está en la fila 2.'] },
        { row: 7, messages: ['Tiene tomas con error en tomas.csv (fila 9).'] },
      ],
      tomas: [
        {
          row: 4,
          messages: [
            'Su evaluación (id_origen EV-5) tiene errores en evaluaciones.csv o en sus tomas.',
          ],
        },
        {
          row: 5,
          messages: [
            'Su evaluación (id_origen EV-2) tiene errores en evaluaciones.csv o en sus tomas.',
          ],
        },
        {
          row: 6,
          messages: [
            'Su evaluación (id_origen EV-3) tiene errores en evaluaciones.csv o en sus tomas.',
          ],
        },
        {
          row: 7,
          messages: [
            'toma_1: el decimal va con punto, sin separador de miles (72.5).',
            'toma_2: el decimal va con punto, sin separador de miles (72.5).',
          ],
        },
        {
          row: 8,
          messages: ['id_evaluacion: EV-9 no está en evaluaciones.csv o su fila tiene errores.'],
        },
        {
          row: 9,
          messages: ['el sitio BASIC_WEIGHT de la evaluación EV-5 repetido: ya está en la fila 4.'],
        },
      ],
      planes: [
        {
          row: 3,
          messages: ['id_paciente: NP-3 no está en pacientes.csv o su fila tiene errores.'],
        },
      ],
    });
  });

  it('una evaluación con una toma repetida no entra: entraría con la toma equivocada', () => {
    const template = readTemplate(input(), TODAY);
    // EV-5 tiene dos BASIC_WEIGHT: la segunda es error de su fila, y la evaluación y su otra toma también caen.
    expect(template.evaluations.map((e) => e.externalId)).not.toContain('EV-5');
    expect(template.errors.tomas.map((e) => e.row)).toEqual(expect.arrayContaining([4, 9]));
  });

  it('un archivo que falta, ilegible o con otro encabezado falla entero; sus filas no entran', () => {
    const template = readTemplate(
      input({
        planes: { error: 'Falta planes.csv en la carpeta.' },
        tomas: file(['id_evaluacion', 'sitio'], [['EV-1', 'BASIC_WEIGHT']]),
      }),
      TODAY,
    );
    expect(template.errors.planes).toEqual([
      { row: null, messages: ['Falta planes.csv en la carpeta.'] },
    ]);
    expect(template.errors.tomas).toEqual([
      { row: null, messages: [`El encabezado debe ser: ${TEMPLATE_COLUMNS.tomas.join(',')}`] },
    ]);
    expect(template.totals.tomas).toBe(1);
    expect(template.evaluations).toEqual([]);
    expect(template.plans).toEqual([]);
  });

  it('una fila con otra cantidad de columnas', () => {
    const template = readTemplate(
      input({ pacientes: file(TEMPLATE_COLUMNS.pacientes, [['NP-1', 'Nombre']]) }),
      TODAY,
    );
    expect(template.errors.pacientes).toEqual([
      { row: 2, messages: ['Tiene 2 columnas y el encabezado 12.'] },
    ]);
  });

  it('un archivo sin filas, solo con el encabezado, es válido: la cuenta no tenía planes', () => {
    const template = readTemplate(input({ planes: file(TEMPLATE_COLUMNS.planes, []) }), TODAY);
    expect(template.errors.planes).toEqual([]);
    expect(template.totals.planes).toBe(0);
  });
});

describe('05 §2 · la hora local de la evaluación en la zona de la organización', () => {
  it('Lima (UTC-5, sin cambio de horario)', () => {
    expect(instantAt('2025-02-10', 8 * 60 + 30, 'America/Lima').toISOString()).toBe(
      '2025-02-10T13:30:00.000Z',
    );
    expect(localDateIn(new Date('2026-11-15T03:00:00.000Z'), 'America/Lima')).toBe('2026-11-14');
  });

  it('una zona con cambio de horario toma el desplazamiento de esa fecha', () => {
    expect(instantAt('2025-01-15', 9 * 60, 'America/Santiago').toISOString()).toBe(
      '2025-01-15T12:00:00.000Z',
    );
    expect(instantAt('2025-07-15', 9 * 60, 'America/Santiago').toISOString()).toBe(
      '2025-07-15T13:00:00.000Z',
    );
  });
});

describe('RN-I05 · el muestreo', () => {
  it('toma hasta el tamaño pedido, sin repetir, con el azar que se le pasa', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const sample = pickSample(items, 3, () => 0);
    expect(sample).toHaveLength(3);
    expect(new Set(sample).size).toBe(3);
    expect(pickSample(items, 10, () => 0.5).sort()).toEqual(items);
    expect(pickSample(items, 0, () => 0.5)).toEqual([]);
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
