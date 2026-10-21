import { describe, expect, it } from 'vitest';
import { COMPENDIUM_COLUMNS, parseCompendiumRow } from './compendium-activity.js';

const ROW: Record<string, string> = {
  codigo: '12050',
  encabezado: 'Correr',
  descripcion: 'Correr a 6–6.3 mph (9.7–10.1 km/h)',
  met: '9.3',
  descripcion_en: 'Running, 6-6.3 mph (10 min/mile)',
};

describe('RN-I01 · RN-E03 · una actividad del Compendium 2024', () => {
  it('el encabezado del CSV: código, encabezado y descripción en español, MET y la descripción oficial', () => {
    expect(COMPENDIUM_COLUMNS).toEqual([
      'codigo',
      'encabezado',
      'descripcion',
      'met',
      'descripcion_en',
    ]);
  });

  it('da la actividad con su MET tal como lo publica el Compendium', () => {
    expect(parseCompendiumRow(ROW)).toEqual({
      ok: true,
      value: {
        code: '12050',
        majorHeading: 'Correr',
        descriptionEs: 'Correr a 6–6.3 mph (9.7–10.1 km/h)',
        descriptionEn: 'Running, 6-6.3 mph (10 min/mile)',
        met: 9.3,
      },
    });
  });

  it('el encabezado es el de su código: 01 Ciclismo, 02 Acondicionamiento físico… 18 Actividades acuáticas', () => {
    const result = parseCompendiumRow({ ...ROW, codigo: '17190' });
    expect(!result.ok && result.error).toEqual([
      'encabezado: el código 17190 es de «Caminar», no de «Correr»',
    ]);
  });

  it('rechaza códigos fuera de los encabezados cargados, MET sin un decimal y descripciones vacías', () => {
    const result = parseCompendiumRow({
      codigo: '05050',
      encabezado: 'Correr',
      descripcion: ' ',
      met: '9.25',
      descripcion_en: '',
    });

    expect(!result.ok && result.error).toEqual([
      'codigo: «05050» no es de un encabezado que se cargue (01, 02, 03, 12, 15, 17 o 18)',
      'descripcion: vacía',
      'met: «9.25» no es un MET del Compendium (número positivo con un decimal)',
      'descripcion_en: vacía',
    ]);
  });

  it('un MET de cero no es una actividad', () => {
    const result = parseCompendiumRow({ ...ROW, met: '0.0' });
    expect(!result.ok && result.error).toEqual([
      'met: «0.0» no es un MET del Compendium (número positivo con un decimal)',
    ]);
  });
});
