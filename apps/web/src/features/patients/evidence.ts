/** Lo mismo que valida la API (ADR-038): PDF, PNG o JPEG por sus primeros bytes, y 5 MB como máximo. */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_ACCEPT = 'application/pdf,image/png,image/jpeg';

const SIGNATURES: readonly (readonly number[])[] = [
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPEG
];

/** El problema de la evidencia antes de subirla, o null si sirve. */
export function evidenceProblem(file: { size: number; head: Uint8Array }): string | null {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > EVIDENCE_MAX_BYTES)
    return 'El archivo pesa más de 5 MB. Redúcelo y vuelve a subirlo.';
  const known = SIGNATURES.some((signature) => signature.every((byte, i) => file.head[i] === byte));
  return known ? null : 'La evidencia debe ser un PDF, JPG o PNG.';
}

/** Lee los primeros bytes del archivo en el navegador y lo valida, sin subirlo. */
export async function checkEvidence(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return evidenceProblem({ size: file.size, head });
}
