/** Las cinco fichas PDF (RN-H01): dieta por intercambios, menú semanal, resultados antropométricos, evolución y rutina. */
export const SHEET_KINDS = [
  'EXCHANGE_DIET',
  'WEEKLY_MENU',
  'ANTHROPOMETRY',
  'EVOLUTION',
  'TRAINING',
] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** De dónde sale una ficha (RN-H02): un snapshot publicado o una evaluación cerrada. */
export const SOURCE_TYPES = ['NUTRITION_PLAN', 'EVALUATION', 'TRAINING_PROGRAM'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type PlanModality = 'EXCHANGES' | 'COMPOSITION' | 'WEEKLY_MENU';

/**
 * La ficha de un plan: la dieta por intercambios tiene la suya; el menú semanal, la del menú. La composición se imprime
 * con la del menú, como un plan de un día: siguen siendo cinco fichas (RN-H01, ADR-064).
 */
export function planSheetKind(modality: PlanModality): SheetKind {
  return modality === 'EXCHANGES' ? 'EXCHANGE_DIET' : 'WEEKLY_MENU';
}

/** Contacto de una marca (tenancy.branding.contact): lo que la ficha muestra al pie. */
export interface BrandContact {
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
}

/** Una fila de tenancy.branding: la de la organización (sin miembro) o la propia de un profesional. */
export interface BrandRecord {
  readonly displayName: string | null;
  readonly logoFileId: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly contact: BrandContact;
  readonly pdfFooter: string | null;
}

/** La marca con la que se dibuja una ficha. Un color sin fijar se dibuja con la paleta provisional (ADR-027). */
export interface SheetBrand {
  readonly displayName: string;
  readonly logoFileId: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly contact: BrandContact;
  readonly footer: string | null;
}

/**
 * RN-H03: la marca es de la organización y cada profesional puede tener la suya. Cada dato sale de la marca propia de
 * quien publicó el plan o hizo la evaluación; si no lo fijó, de la de la organización. Sin nombre en ninguna, la ficha
 * lleva el de la organización (ADR-064).
 */
export function resolveSheetBrand(
  member: BrandRecord | null,
  organization: BrandRecord | null,
  organizationName: string,
): SheetBrand {
  const pick = <K extends keyof BrandRecord>(key: K): BrandRecord[K] | null =>
    member?.[key] ?? organization?.[key] ?? null;
  const contact = (key: keyof BrandContact): string | null =>
    member?.contact[key] ?? organization?.contact[key] ?? null;
  return {
    displayName: pick('displayName') ?? organizationName,
    logoFileId: pick('logoFileId'),
    primaryColor: pick('primaryColor'),
    secondaryColor: pick('secondaryColor'),
    contact: { phone: contact('phone'), email: contact('email'), website: contact('website') },
    footer: pick('pdfFooter'),
  };
}

const FILE_NAMES: Readonly<Record<SheetKind, string>> = {
  EXCHANGE_DIET: 'ficha-dieta-por-intercambios',
  WEEKLY_MENU: 'ficha-menu',
  ANTHROPOMETRY: 'ficha-resultados-antropometricos',
  EVOLUTION: 'ficha-evolucion',
  TRAINING: 'ficha-rutina',
};

/** Nombre del archivo al descargar: sin datos del paciente (06 §5, ADR-038). */
export function sheetFileName(kind: SheetKind): string {
  return `${FILE_NAMES[kind]}.pdf`;
}

/** Edad cumplida en una fecha, ambas YYYY-MM-DD: la de la ficha es la del día del origen, no la de hoy (RN-H02). */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = onDate.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
