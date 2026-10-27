import { LOGO_LIMITS } from '@nutricoach/contracts';

/** Lo mismo que revisa primero la API (ADR-066): PNG o JPEG por sus primeros bytes, 1 MB y 2000 px por lado. */
const SIGNATURES: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPEG
];

export interface LogoFile {
  readonly size: number;
  readonly head: Uint8Array;
  /** Lo que mide al abrirlo en el navegador; null si no se pudo abrir. */
  readonly widthPx: number | null;
  readonly heightPx: number | null;
}

/** El problema del logo antes de subirlo, o null si sirve. La API lo vuelve a revisar entero. */
export function logoProblem(file: LogoFile): string | null {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > LOGO_LIMITS.maxBytes)
    return 'El logo pesa más de 1 MB. Redúcelo y vuelve a subirlo.';
  if (!SIGNATURES.some((signature) => signature.every((byte, i) => file.head[i] === byte))) {
    return 'El logo debe ser una imagen PNG o JPG.';
  }
  if (file.widthPx === null || file.heightPx === null) {
    return 'No pudimos abrir la imagen. ¿Está dañada? Vuelve a exportarla y súbela otra vez.';
  }
  if (Math.max(file.widthPx, file.heightPx) > LOGO_LIMITS.maxSidePx) {
    return 'El logo mide más de 2000 px de lado. Redúcelo y vuelve a subirlo.';
  }
  return null;
}

/** Lo que mide la imagen al abrirla en el navegador; null si no se puede abrir. */
async function measure(file: File): Promise<{ widthPx: number; heightPx: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { widthPx: bitmap.width, heightPx: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Lee el comienzo del archivo y lo abre en el navegador para medirlo, sin subirlo. */
export async function checkLogo(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const size = await measure(file);
  return logoProblem({
    size: file.size,
    head,
    widthPx: size?.widthPx ?? null,
    heightPx: size?.heightPx ?? null,
  });
}
