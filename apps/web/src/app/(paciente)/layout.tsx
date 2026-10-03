import type { ReactNode } from 'react';

/**
 * App instalable del paciente (02 §11), primero para el celular. Vive bajo /mi, que será el alcance
 * de la PWA. P3 agrega la barra inferior: Hoy, Plan, Entreno, Progreso y Más.
 */
export default function PatientLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-area="paciente">{children}</div>;
}
