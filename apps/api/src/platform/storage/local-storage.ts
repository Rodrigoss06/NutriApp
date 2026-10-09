import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { StoragePort } from './storage.port.js';

/** Claves de la forma ORG/UUID: sin barras sueltas, puntos ni nombres originales. */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

/** Disco local en STORAGE_LOCAL_PATH (/srv/data/uploads en el servidor, volumen cifrado con LUKS, 01 §5). */
export class LocalStorage implements StoragePort {
  readonly driver = 'local';
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    const path = this.#path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    // Escritura atómica y sin pisar: un archivo a medio escribir nunca queda con su nombre final, y link falla si
    // la clave ya existe.
    const temporary = `${path}.partial`;
    await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
    try {
      await link(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.#path(key));
  }

  async discard(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
  }

  #path(key: string): string {
    if (!KEY.test(key)) throw new Error('Clave de almacenamiento inválida.');
    return join(this.#root, key);
  }
}
