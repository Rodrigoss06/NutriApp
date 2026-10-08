/** Textos de roles, profesiones y estados (interfaz en español, regla 9). */
export const ROLE_LABELS = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  PROFESSIONAL: 'Profesional',
} as const satisfies Record<string, string>;

export const PROFESSION_LABELS = {
  NUTRITIONIST: 'Nutricionista',
  TRAINER: 'Entrenador',
  BOTH: 'Nutricionista y entrenador',
  OTHER: 'Otra',
} as const satisfies Record<string, string>;

export const ORGANIZATION_STATUS_LABELS = {
  ACTIVE: 'Activa',
  READ_ONLY: 'Solo lectura',
  SUSPENDED: 'Suspendida',
  CLOSED: 'Cerrada',
} as const satisfies Record<string, string>;

/** «Paciente» → «Pacientes», «Asesorado» → «Asesorados», «Cliente» → «Clientes». */
export function pluralLabel(label: string): string {
  return /[aeiouáéíóú]$/i.test(label) ? `${label}s` : `${label}es`;
}
