import { z } from 'zod';

/**
 * Aviso o error del motor con la regla que lo origina (RN-D06, ADR-023). ERROR: no se calcula; WARNING: se calcula y
 * el aviso viaja junto al número; INFO: solo se informa.
 */
export const ISSUE_SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;
export const engineIssueSchema = z.object({
  rule: z.string(),
  severity: z.enum(ISSUE_SEVERITIES),
  code: z.string(),
  message: z.string(),
});
export type EngineIssue = z.infer<typeof engineIssueSchema>;
