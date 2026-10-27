import { crc32, deflateSync } from 'node:zlib';

/**
 * Imágenes sintéticas para las pruebas del logo (ADR-066): PNG armados bloque por bloque, con su CRC, y JPEG reales de
 * pocos píxeles (de base, progresivo y CMYK) generados una vez con Pillow.
 */

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  /** 0 gris, 2 RGB, 3 paleta, 4 gris con alfa, 6 RGBA. */
  readonly colorType?: 0 | 2 | 3 | 4 | 6;
  readonly depth?: 1 | 2 | 4 | 8 | 16;
  readonly interlace?: 0 | 1;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as const;

/** Un bloque de PNG: largo, tipo, datos y el CRC de tipo y datos. */
export function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function ihdr({
  width,
  height,
  colorType = 6,
  depth = 8,
  interlace = 0,
}: PngHeader): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.set([depth, colorType, 0, 0, interlace], 8);
  return pngChunk('IHDR', data);
}

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const IEND = pngChunk('IEND');

/** Las filas sin comprimir de un PNG sin entrelazar: filtro 0 y el mismo color en cada píxel. */
export function pngRows(header: PngHeader, filter = 0): Buffer {
  const colorType = header.colorType ?? 6;
  const depth = header.depth ?? 8;
  const rowBytes = Math.ceil((header.width * CHANNELS[colorType] * depth) / 8);
  const row = Buffer.alloc(1 + rowBytes, 0x7f);
  row[0] = filter;
  return Buffer.concat(Array.from({ length: header.height }, () => row));
}

/** Un PNG válido de un solo color; con `rows` se arma con esas filas (para dañarlo a propósito con CRC correcto). */
export function pngImage(header: PngHeader, rows: Uint8Array = pngRows(header)): Buffer {
  const palette = header.colorType === 3 ? [pngChunk('PLTE', Buffer.from([15, 118, 110]))] : [];
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(header),
    ...palette,
    pngChunk('IDAT', deflateSync(rows)),
    IEND,
  ]);
}

/** JPEG de base de 3 × 2 píxeles, RGB (Pillow 12, calidad 80). */
export const JPEG_BASELINE = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCHAPQr/9k=',
  'base64',
);

/** El mismo JPEG en progresivo: varias exploraciones con tablas entre ellas. */
export const JPEG_PROGRESSIVE = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAADBf/aAAwDAQACEAMQAAABhh4X/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAL/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',
  'base64',
);

/** JPEG de 2 × 2 píxeles en CMYK (cuatro componentes, marcador Adobe). */
export const JPEG_CMYK = Buffer.from(
  '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/8AAFAgAAgACBEMRAE0RAFkRAEsRAP/EABUAAQEAAAAAAAAAAAAAAAAAAAgG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAA4EQwBNAFkASwAAPwC/JwgSPf/Z',
  'base64',
);
