import { crc32, inflateSync } from 'node:zlib';

export type ImageMime = 'image/png' | 'image/jpeg';

/**
 * Lo que dice una imagen revisada entera (ADR-066): OK con su tipo y sus dimensiones; TOO_LARGE si un lado pasa del
 * máximo (no se descomprime: así un PNG chico que se infla a gigas no gasta memoria); INVALID si no es un PNG o un
 * JPEG bien formado.
 */
export type ImageInspection =
  | {
      readonly status: 'OK' | 'TOO_LARGE';
      readonly mimeType: ImageMime;
      readonly widthPx: number;
      readonly heightPx: number;
    }
  | { readonly status: 'INVALID' };

const INVALID = { status: 'INVALID' } as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Canales por tipo de color de PNG y las profundidades que admite cada uno (PNG §11.2.2). */
const PNG_COLOR_TYPES: Readonly<Record<number, { channels: number; depths: readonly number[] }>> = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16] },
  2: { channels: 3, depths: [8, 16] },
  3: { channels: 1, depths: [1, 2, 4, 8] },
  4: { channels: 2, depths: [8, 16] },
  6: { channels: 4, depths: [8, 16] },
};
/** Las siete pasadas de Adam7: columna y fila iniciales, y el paso de cada una. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/**
 * Revisa una imagen antes de guardarla: react-pdf solo mira el encabezado al cargarla y descomprime el resto al dibujar,
 * así que un logo dañado rompería todas las fichas de la organización. Un PNG se revisa entero (CRC de cada bloque,
 * datos que se descomprimen al tamaño exacto y un filtro válido por fila); un JPEG, su estructura (marcadores, un SOF
 * de base o progresivo de 8 bits y el cierre). Sin E/S.
 */
export function inspectImage(content: Uint8Array, maxSidePx: number): ImageInspection {
  if (PNG_SIGNATURE.every((byte, i) => content[i] === byte)) return inspectPng(content, maxSidePx);
  if (content[0] === 0xff && content[1] === 0xd8) return inspectJpeg(content, maxSidePx);
  return INVALID;
}

const u16 = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) * 0x10000 + u16(bytes, at + 2);

function inspectPng(content: Uint8Array, maxSidePx: number): ImageInspection {
  let at = PNG_SIGNATURE.length;
  let header: { width: number; height: number; depth: number; colorType: number } | null = null;
  let interlaced = false;
  let palette = false;
  const data: Uint8Array[] = [];
  let ended = false;
  while (!ended) {
    if (at + 12 > content.length) return INVALID;
    const length = u32(content, at);
    const end = at + 12 + length;
    if (end > content.length) return INVALID;
    const typed = content.subarray(at + 4, at + 8 + length);
    if (crc32(typed) !== u32(content, at + 8 + length)) return INVALID;
    const type = String.fromCharCode(...typed.subarray(0, 4));
    const body = typed.subarray(4);
    if (header === null && type !== 'IHDR') return INVALID;
    if (type === 'IHDR') {
      if (header !== null || length !== 13) return INVALID;
      const [depth = 0, colorType = 0, compression, filter, interlace] = body.subarray(8);
      const allowed = PNG_COLOR_TYPES[colorType];
      if (!allowed?.depths.includes(depth) || compression !== 0 || filter !== 0) return INVALID;
      if (interlace !== 0 && interlace !== 1) return INVALID;
      header = { width: u32(body, 0), height: u32(body, 4), depth, colorType };
      interlaced = interlace === 1;
      if (header.width === 0 || header.height === 0) return INVALID;
      if (header.width > maxSidePx || header.height > maxSidePx) {
        return {
          status: 'TOO_LARGE',
          mimeType: 'image/png',
          widthPx: header.width,
          heightPx: header.height,
        };
      }
    } else if (type === 'PLTE') {
      palette = true;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      ended = true;
    }
    at = end;
  }
  // Nada después del cierre: el archivo es solo la imagen.
  if (!header || at !== content.length || data.length === 0) return INVALID;
  const { width, height, depth, colorType } = header;
  if (colorType === 3 && !palette) return INVALID;
  const bitsPerPixel = (PNG_COLOR_TYPES[colorType]?.channels ?? 0) * depth;
  const rowBytes = (pixelsWide: number) => 1 + Math.ceil((pixelsWide * bitsPerPixel) / 8);
  const passes = interlaced
    ? ADAM7.map(([x, y, stepX, stepY]) => ({
        width: width > x ? Math.ceil((width - x) / stepX) : 0,
        height: height > y ? Math.ceil((height - y) / stepY) : 0,
      })).filter((pass) => pass.width > 0 && pass.height > 0)
    : [{ width, height }];
  const expected = passes.reduce((sum, pass) => sum + pass.height * rowBytes(pass.width), 0);
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  } catch {
    return INVALID;
  }
  if (pixels.length !== expected) return INVALID;
  // Cada fila empieza con su filtro: 0 a 4 (png-js lanza con cualquier otro al dibujar).
  let row = 0;
  for (const pass of passes) {
    for (let y = 0; y < pass.height; y += 1) {
      if ((pixels[row] ?? 5) > 4) return INVALID;
      row += rowBytes(pass.width);
    }
  }
  return { status: 'OK', mimeType: 'image/png', widthPx: width, heightPx: height };
}

/** SOF de base, secuencial extendido y progresivo con Huffman: los que DCTDecode dibuja. */
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2]);
/** Los demás SOF: sin pérdida, jerárquicos o con codificación aritmética. */
const OTHER_FRAMES = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7;

function inspectJpeg(content: Uint8Array, maxSidePx: number): ImageInspection {
  let at = 2;
  let frame: { width: number; height: number } | null = null;
  let scans = 0;
  for (;;) {
    if (content[at] !== 0xff) return INVALID;
    while (content[at] === 0xff) at += 1;
    const marker = content[at];
    at += 1;
    if (marker === undefined) return INVALID;
    if (marker === 0xd9) {
      // El cierre va al final, después de al menos una exploración.
      if (!frame || scans === 0 || at !== content.length) return INVALID;
      return { status: 'OK', mimeType: 'image/jpeg', widthPx: frame.width, heightPx: frame.height };
    }
    // Fuera de una exploración no van RSTn, otro SOI ni lo reservado (por debajo de 0xC0).
    if (marker < 0xc0 || isRestart(marker) || marker === 0xd8) return INVALID;
    const length = u16(content, at);
    if (length < 2 || at + length > content.length) return INVALID;
    if (OTHER_FRAMES.has(marker)) return INVALID;
    if (JPEG_FRAMES.has(marker)) {
      if (frame !== null || length < 8) return INVALID;
      const precision = content[at + 2];
      const height = u16(content, at + 3);
      const width = u16(content, at + 5);
      const components = content[at + 7] ?? 0;
      if (precision !== 8 || height === 0 || width === 0) return INVALID;
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) return INVALID;
      frame = { width, height };
      if (width > maxSidePx || height > maxSidePx) {
        return { status: 'TOO_LARGE', mimeType: 'image/jpeg', widthPx: width, heightPx: height };
      }
    }
    at += length;
    if (marker === 0xda) {
      if (!frame) return INVALID;
      scans += 1;
      // Datos de la exploración hasta el siguiente marcador: 0xFF00 es un 0xFF de datos y RSTn va dentro.
      while (
        at < content.length &&
        !(
          content[at] === 0xff &&
          content[at + 1] !== 0x00 &&
          content[at + 1] !== 0xff &&
          !isRestart(content[at + 1] ?? 0)
        )
      ) {
        at += 1;
      }
    }
  }
}
