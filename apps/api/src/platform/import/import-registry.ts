import { Injectable } from '@nestjs/common';
import type { CatalogImport } from './catalog-import.js';

const KIND = /^[A-Z][A-Z0-9_]*$/;

/** Los módulos registran aquí sus tipos de catálogo al iniciar; el importador los usa por su nombre (RN-I04). */
@Injectable()
export class ImportRegistry {
  readonly #catalogs = new Map<string, CatalogImport<unknown>>();

  register<TRow>(catalog: CatalogImport<TRow>): void {
    if (!KIND.test(catalog.kind)) {
      throw new Error(`Tipo de importación inválido: «${catalog.kind}».`);
    }
    if (this.#catalogs.has(catalog.kind)) {
      throw new Error(`Tipo de importación duplicado: «${catalog.kind}».`);
    }
    this.#catalogs.set(catalog.kind, catalog);
  }

  get(kind: string): CatalogImport<unknown> | undefined {
    return this.#catalogs.get(kind);
  }

  kinds(): readonly string[] {
    return [...this.#catalogs.keys()].sort();
  }
}
