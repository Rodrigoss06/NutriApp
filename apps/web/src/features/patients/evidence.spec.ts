import { describe, expect, it } from 'vitest';
import { checkEvidence, EVIDENCE_MAX_BYTES, evidenceProblem } from './evidence';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

describe('RN-B01 · la evidencia en papel se valida antes de subirla', () => {
  it('acepta PDF, PNG y JPEG por sus bytes; rechaza lo demás, lo vacío y lo de más de 5 MB', () => {
    expect(evidenceProblem({ size: 10, head: new Uint8Array(PDF) })).toBeNull();
    expect(
      evidenceProblem({
        size: 10,
        head: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ).toBeNull();
    expect(
      evidenceProblem({ size: 10, head: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) }),
    ).toBeNull();
    expect(evidenceProblem({ size: 10, head: new TextEncoder().encode('<script>') })).toBe(
      'La evidencia debe ser un PDF, JPG o PNG.',
    );
    expect(evidenceProblem({ size: 0, head: new Uint8Array() })).toBe('El archivo está vacío.');
    expect(evidenceProblem({ size: EVIDENCE_MAX_BYTES + 1, head: new Uint8Array(PDF) })).toMatch(
      /más de 5 MB/,
    );
  });

  it('un archivo con extensión .pdf pero otro contenido no pasa', async () => {
    const fake = new File(['hola'], 'escaneo.pdf', { type: 'application/pdf' });
    expect(await checkEvidence(fake)).toBe('La evidencia debe ser un PDF, JPG o PNG.');
    const real = new File([new Uint8Array(PDF)], 'escaneo.pdf', { type: 'application/pdf' });
    expect(await checkEvidence(real)).toBeNull();
  });
});
