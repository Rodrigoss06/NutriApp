import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  IEND,
  ihdr,
  JPEG_BASELINE,
  JPEG_CMYK,
  JPEG_PROGRESSIVE,
  PNG_SIGNATURE,
  pngChunk,
  pngImage,
  pngRows,
  type PngHeader,
} from '../../../test/support/images.js';
import { inspectImage } from './image-info.js';

const MAX = 2000;

/** Una copia del JPEG con el byte de `offset` desde el SOF cambiado. */
function withSofByte(jpeg: Buffer, frameMarker: number, offset: number, value: number): Buffer {
  const copy = Buffer.from(jpeg);
  const at = copy.findIndex((byte, i) => byte === 0xff && copy[i + 1] === frameMarker);
  copy[at + offset] = value;
  return copy;
}

describe('ADR-066 · el logo se revisa entero antes de guardarlo (RN-H03)', () => {
  it.each<[string, PngHeader]>([
    ['RGBA de 8 bits', { width: 64, height: 32, colorType: 6, depth: 8 }],
    ['RGB de 16 bits', { width: 5, height: 3, colorType: 2, depth: 16 }],
    ['gris de 1 bit', { width: 9, height: 4, colorType: 0, depth: 1 }],
    ['con paleta', { width: 7, height: 7, colorType: 3, depth: 4 }],
    ['gris con alfa', { width: 3, height: 3, colorType: 4, depth: 8 }],
  ])('un PNG %s sirve, con su tipo y dimensiones', (_, header) => {
    expect(inspectImage(pngImage(header), MAX)).toEqual({
      status: 'OK',
      mimeType: 'image/png',
      widthPx: header.width,
      heightPx: header.height,
    });
  });

  it('un PNG entrelazado (Adam7) se revisa pasada por pasada', () => {
    // 10 × 3 en RGBA: las pasadas 1 a 7 miden 2×1, 1×1, nada (empieza en la fila 4), 2×1, 5×1, 5×2 y 10×1.
    const passes = [
      [2, 1],
      [1, 1],
      [2, 1],
      [5, 1],
      [5, 2],
      [10, 1],
    ];
    const rows = Buffer.concat(
      passes.flatMap(([width = 0, height = 0]) =>
        Array.from({ length: height }, () => Buffer.alloc(1 + width * 4, 0)),
      ),
    );
    const header: PngHeader = { width: 10, height: 3, interlace: 1 };
    expect(inspectImage(pngImage(header, rows), MAX)).toMatchObject({ status: 'OK', widthPx: 10 });
    // Leídas como si no estuviera entrelazado, las mismas filas no cuadran con el tamaño.
    expect(inspectImage(pngImage({ ...header, interlace: 0 }, rows), MAX).status).toBe('INVALID');
  });

  it.each([
    ['de base', JPEG_BASELINE, 3, 2],
    ['progresivo', JPEG_PROGRESSIVE, 3, 2],
    ['CMYK', JPEG_CMYK, 2, 2],
  ])('un JPEG %s sirve', (_, jpeg, widthPx, heightPx) => {
    expect(inspectImage(jpeg, MAX)).toEqual({
      status: 'OK',
      mimeType: 'image/jpeg',
      widthPx,
      heightPx,
    });
  });

  it('un lado de más de 2000 px se rechaza sin descomprimir nada', () => {
    // El encabezado dice 100 000 × 100 000 y los datos son basura: no se llegan a leer.
    const huge = Buffer.concat([
      PNG_SIGNATURE,
      ihdr({ width: 100_000, height: 100_000 }),
      pngChunk('IDAT', Buffer.from('no es zlib')),
      IEND,
    ]);
    expect(inspectImage(huge, MAX)).toEqual({
      status: 'TOO_LARGE',
      mimeType: 'image/png',
      widthPx: 100_000,
      heightPx: 100_000,
    });
    expect(inspectImage(pngImage({ width: 2000, height: 1 }), MAX).status).toBe('OK');
    // En el JPEG, el ancho va 7 bytes después del 0xFF del SOF: se sube su byte alto (3 px pasa a 4099).
    const wide = withSofByte(JPEG_BASELINE, 0xc0, 7, 0x10);
    expect(inspectImage(wide, MAX)).toMatchObject({ status: 'TOO_LARGE', widthPx: 0x1003 });
  });

  it.each<[string, () => Uint8Array]>([
    ['un PDF', () => Buffer.from('%PDF-1.7\n')],
    ['un texto', () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['un archivo vacío', () => new Uint8Array()],
    [
      'un PNG con un byte cambiado (el CRC no cuadra)',
      () => {
        const png = pngImage({ width: 8, height: 8 });
        png[45] = (png[45] ?? 0) ^ 0xff;
        return png;
      },
    ],
    [
      'un PNG con un filtro de fila inexistente',
      () => pngImage({ width: 4, height: 2 }, pngRows({ width: 4, height: 2 }, 5)),
    ],
    [
      'un PNG con menos filas que su alto',
      () => pngImage({ width: 4, height: 3 }, pngRows({ width: 4, height: 2 })),
    ],
    [
      'un PNG con más datos que su tamaño',
      () => pngImage({ width: 4, height: 2 }, pngRows({ width: 4, height: 3 })),
    ],
    [
      'un PNG cortado antes del cierre',
      () => {
        const png = pngImage({ width: 4, height: 2 });
        return png.subarray(0, png.length - IEND.length);
      },
    ],
    [
      'un PNG con bytes después del cierre',
      () => Buffer.concat([pngImage({ width: 4, height: 2 }), Buffer.from('<?php')]),
    ],
    [
      'un PNG con paleta sin PLTE',
      () =>
        Buffer.concat([
          PNG_SIGNATURE,
          ihdr({ width: 2, height: 2, colorType: 3, depth: 8 }),
          pngChunk('IDAT', deflateSync(pngRows({ width: 2, height: 2, colorType: 3, depth: 8 }))),
          IEND,
        ]),
    ],
    ['un PNG RGB de 4 bits', () => pngImage({ width: 2, height: 2, colorType: 2, depth: 4 })],
    [
      'un PNG que no empieza por IHDR',
      () =>
        Buffer.concat([
          PNG_SIGNATURE,
          pngChunk('tEXt', Buffer.from('a')),
          ihdr({ width: 1, height: 1 }),
          IEND,
        ]),
    ],
    ['un PNG de ancho 0', () => pngImage({ width: 0, height: 2 }, Buffer.alloc(2))],
    ['un JPEG sin cierre', () => JPEG_BASELINE.subarray(0, JPEG_BASELINE.length - 2)],
    [
      'un JPEG con bytes después del cierre',
      () => Buffer.concat([JPEG_BASELINE, Buffer.from('x')]),
    ],
    ['un JPEG sin pérdida (SOF3)', () => withSofByte(JPEG_BASELINE, 0xc0, 1, 0xc3)],
    ['un JPEG de 12 bits', () => withSofByte(JPEG_BASELINE, 0xc0, 4, 12)],
  ])('%s no sirve', (_, bytes) => {
    expect(inspectImage(bytes(), MAX)).toEqual({ status: 'INVALID' });
  });
});
