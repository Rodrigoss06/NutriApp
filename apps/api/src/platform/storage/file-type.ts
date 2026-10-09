/** Tipos de archivo admitidos como evidencia (consentimientos y adjuntos): se deciden por los bytes, nunca por la extensión. */
export type AllowedMime = 'application/pdf' | 'image/png' | 'image/jpeg';

const SIGNATURES: readonly { mime: AllowedMime; bytes: readonly number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/** Tipo por bytes mágicos; null si no es uno de los admitidos. */
export function sniffMime(content: Uint8Array): AllowedMime | null {
  for (const { mime, bytes } of SIGNATURES) {
    if (content.length >= bytes.length && bytes.every((byte, i) => content[i] === byte))
      return mime;
  }
  return null;
}

/** 5 MB: el parser multipart corta antes de leer más (decisión 3 de P6). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const EXTENSIONS: Readonly<Record<AllowedMime, string>> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};
