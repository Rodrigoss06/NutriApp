import { ok } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import type { CatalogImport } from './catalog-import.js';
import { ImportRegistry } from './import-registry.js';

const catalog = (kind: string): CatalogImport<string> => ({
  kind,
  columns: ['codigo'],
  parse: (record) => ok(record.codigo ?? ''),
  key: (row) => row,
  save: () => Promise.resolve(),
});

describe('RN-I04 · registro de tipos de importación', () => {
  it('encuentra cada tipo por su nombre y los lista en orden', () => {
    const registry = new ImportRegistry();
    registry.register(catalog('TPCA_FOODS'));
    registry.register(catalog('COMPENDIUM_ACTIVITIES'));

    expect(registry.get('TPCA_FOODS')?.kind).toBe('TPCA_FOODS');
    expect(registry.get('OTRO')).toBeUndefined();
    expect(registry.kinds()).toEqual(['COMPENDIUM_ACTIVITIES', 'TPCA_FOODS']);
  });

  it('rechaza nombres inválidos y tipos repetidos', () => {
    const registry = new ImportRegistry();
    registry.register(catalog('TPCA_FOODS'));

    expect(() => {
      registry.register(catalog('tpca'));
    }).toThrow('Tipo de importación inválido: «tpca».');
    expect(() => {
      registry.register(catalog('TPCA_FOODS'));
    }).toThrow('Tipo de importación duplicado: «TPCA_FOODS».');
  });
});
