import { describe, expect, it } from 'vitest';
import { logoProblem, type LogoFile } from './logo';

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const LOGO: LogoFile = { size: 20_000, head: PNG_HEAD, widthPx: 600, heightPx: 200 };

describe('ADR-066 · el logo se revisa antes de subirlo', () => {
  it('un PNG o un JPG de hasta 1 MB y 2000 px por lado sirve', () => {
    expect(logoProblem(LOGO)).toBeNull();
    expect(logoProblem({ ...LOGO, head: JPEG_HEAD, widthPx: 2000, heightPx: 2000 })).toBeNull();
    expect(logoProblem({ ...LOGO, size: 1024 * 1024 })).toBeNull();
  });

  it.each<[string, Partial<LogoFile>, string]>([
    ['vacío', { size: 0 }, 'El archivo está vacío.'],
    [
      'de más de 1 MB',
      { size: 1024 * 1024 + 1 },
      'El logo pesa más de 1 MB. Redúcelo y vuelve a subirlo.',
    ],
    [
      'un PDF',
      { head: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) },
      'El logo debe ser una imagen PNG o JPG.',
    ],
    [
      'que el navegador no abre',
      { widthPx: null, heightPx: null },
      'No pudimos abrir la imagen. ¿Está dañada? Vuelve a exportarla y súbela otra vez.',
    ],
    [
      'de 2001 px de alto',
      { heightPx: 2001 },
      'El logo mide más de 2000 px de lado. Redúcelo y vuelve a subirlo.',
    ],
  ])('un archivo %s no se sube', (_, change, message) => {
    expect(logoProblem({ ...LOGO, ...change })).toBe(message);
  });
});
