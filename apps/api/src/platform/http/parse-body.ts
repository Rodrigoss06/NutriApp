import type { z } from 'zod';
import { ProblemException } from './problem.js';

/**
 * Valida un cuerpo con su contrato Zod (06 §4). El 400 dice qué campos fallan y por qué, nunca sus valores: pueden
 * ser contraseñas o datos personales.
 */
export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new ProblemException(400, {
    title: 'Revisa los datos enviados.',
    code: 'NC-PLT-400',
    details: {
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  });
}
