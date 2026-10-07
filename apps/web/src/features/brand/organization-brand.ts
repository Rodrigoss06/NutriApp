import 'server-only';
import { DEFAULT_BRAND, type Brand } from '@nutricoach/ui';

/** Marca visible de la organización (RN-H03): colores, nombre y logo. */
export interface OrganizationBrand {
  readonly colors: Brand;
  readonly displayName: string;
  readonly logoUrl: string | null;
  /** Cómo llama la organización a sus pacientes: «Paciente», «Asesorado», «Cliente» (06 §8). */
  readonly patientLabel: string;
}

/**
 * Marca de la organización activa. Hasta que existan la sesión (P5) y la personalización de marca (P19),
 * devuelve la paleta provisional.
 */
export function organizationBrand(): OrganizationBrand {
  return {
    colors: DEFAULT_BRAND,
    displayName: 'NutriCoach',
    logoUrl: null,
    patientLabel: 'Paciente',
  };
}

/** Tema del paciente (content.patient_app_setting.theme_color) sobre la marca de su organización. */
export function patientBrand(organization: Brand, themeColor: string | null): unknown {
  return { primary: themeColor ?? organization.primary, secondary: organization.secondary };
}
