import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sniffMime } from './file-type.js';
import { LocalStorage } from './local-storage.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const ORG = '0192f0a0-0000-7000-8000-00000000000a';
const FILE = '0192f0a0-0000-7000-8000-0000000000f1';

describe('P6 · el tipo se decide por los bytes, no por la extensión', () => {
  it.each([
    [PDF, 'application/pdf'],
    [PNG, 'image/png'],
    [JPEG, 'image/jpeg'],
    [new TextEncoder().encode('<html>%PDF-'), null],
    [new Uint8Array([0x25]), null],
  ] as const)('%#: %s', (bytes, expected) => {
    expect(sniffMime(bytes)).toBe(expected);
  });
});

describe('LocalStorage', () => {
  const roots: string[] = [];
  afterAll(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it('guarda y lee por clave ORG/UUID, sin archivos a medias; descartar borra', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nc-storage-'));
    roots.push(root);
    const storage = new LocalStorage(root);
    await storage.put(`${ORG}/${FILE}`, PDF);
    expect(await storage.read(`${ORG}/${FILE}`)).toEqual(Buffer.from(PDF));
    expect(await readdir(join(root, ORG))).toEqual([FILE]);
    await storage.discard(`${ORG}/${FILE}`);
    expect(await readdir(join(root, ORG))).toEqual([]);
  });

  it('rechaza claves con rutas, puntos o nombres originales', async () => {
    const storage = new LocalStorage(tmpdir());
    for (const key of ['../etc/passwd', `${ORG}/evidencia.pdf`, `${ORG}/../${FILE}`, FILE]) {
      await expect(storage.put(key, PDF)).rejects.toThrow('Clave de almacenamiento inválida.');
    }
  });

  it('no pisa un archivo existente', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nc-storage-'));
    roots.push(root);
    const storage = new LocalStorage(root);
    await storage.put(`${ORG}/${FILE}`, PDF);
    await expect(storage.put(`${ORG}/${FILE}`, PNG)).rejects.toThrow();
  });
});
