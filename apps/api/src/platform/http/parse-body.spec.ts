import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseBody } from './parse-body.js';
import type { ProblemException } from './problem.js';

describe('06 §4 · los cuerpos se validan con su contrato en el borde', () => {
  const schema = z.object({ email: z.email(), password: z.string().min(1) });

  it('devuelve los datos válidos', () => {
    expect(parseBody(schema, { email: 'a@b.pe', password: 'x' })).toEqual({
      email: 'a@b.pe',
      password: 'x',
    });
  });

  it('400 con los campos que fallan, sin repetir sus valores', () => {
    try {
      parseBody(schema, { email: 'secreto-no-es-correo', password: '' });
      expect.unreachable();
    } catch (error) {
      const problem = error as ProblemException;
      expect(problem.getStatus()).toBe(400);
      const body = JSON.stringify(problem.getResponse());
      expect(body).toContain('"path":"email"');
      expect(body).toContain('"path":"password"');
      expect(body).not.toContain('secreto-no-es-correo');
    }
  });
});
