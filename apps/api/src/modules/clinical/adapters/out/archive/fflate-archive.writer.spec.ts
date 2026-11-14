import { strFromU8, strToU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FflateArchiveWriter } from './fflate-archive.writer.js';

describe('RN-B04 · el ZIP de la exportación con fflate', () => {
  it('guarda cada entrada con su ruta y se abre igual', async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const zip = await new FflateArchiveWriter().zip([
      { path: 'LEEME.txt', content: strToU8('Hola, ñandú'), compress: true },
      { path: 'fotos-de-progreso/2026-11-13-f1.jpg', content: photo, compress: false },
    ]);
    const opened = unzipSync(zip);
    expect(Object.keys(opened)).toEqual(['LEEME.txt', 'fotos-de-progreso/2026-11-13-f1.jpg']);
    expect(strFromU8(opened['LEEME.txt'] ?? new Uint8Array())).toBe('Hola, ñandú');
    expect(opened['fotos-de-progreso/2026-11-13-f1.jpg']).toEqual(photo);
  });

  it('una ruta repetida es un error de programación', () => {
    const entry = { path: 'a.txt', content: strToU8('a'), compress: true };
    expect(() => new FflateArchiveWriter().zip([entry, entry])).toThrow('repetida');
  });
});
