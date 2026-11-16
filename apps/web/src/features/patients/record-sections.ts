import type { Features } from '@nutricoach/contracts';

/** Una sección del expediente: la ruta después de /panel/pacientes/:id ('' es el Resumen). */
export interface RecordSection {
  readonly path: string;
  readonly label: string;
  /** La bandera de la organización que la apaga (ADR-127): apagada, no se ofrece. */
  readonly feature?: keyof Features;
  /** Lleva la palabra con que la organización llama a sus pacientes (puede ser «Asesorado»). */
  readonly patientWord?: true;
  /** Otras palabras con que se busca en Ctrl + K. */
  readonly keywords?: readonly string[];
}

export interface RecordGroup {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly RecordSection[];
}

/** La entrada del expediente: el estado del paciente (ADR-138). */
export const RECORD_SUMMARY: RecordSection = {
  path: '',
  label: 'Resumen',
  keywords: ['estado', 'alertas'],
};

/**
 * Las secciones del expediente en seis grupos, según el trabajo del entrenador (ADR-137, ADR-138): lo que se sigue cada día y
 * cada semana, lo que se prescribe por ciclo y, al final, lo administrativo. Las rutas son las de siempre: cambia cómo se llega.
 */
export const RECORD_GROUPS: readonly RecordGroup[] = [
  {
    id: 'seguimiento',
    label: 'Seguimiento',
    sections: [
      { path: '/seguimiento', label: 'Día a día', keywords: ['registros', 'notas', 'hoy'] },
      {
        path: '/entrenamiento/control-semanal',
        label: 'Control semanal',
        keywords: ['semáforo', 'decisión', 'semana'],
      },
      { path: '/analitica', label: 'Analítica de dieta', keywords: ['adherencia', 'adecuación'] },
      {
        path: '/analitica/rutina',
        label: 'Analítica de rutina',
        keywords: ['tonelaje', 'fatiga', 'volumen'],
      },
      {
        path: '/entrenamiento/informes',
        label: 'Informes',
        feature: 'MESOCYCLE_REPORT',
        keywords: ['mesociclo'],
      },
      {
        path: '/entrenamiento/fotos',
        label: 'Fotos',
        feature: 'PROGRESS_PHOTOS',
        keywords: ['progreso'],
      },
    ],
  },
  {
    id: 'nutricion',
    label: 'Nutrición',
    sections: [
      { path: '/energia', label: 'Energía', keywords: ['prescripción', 'kcal', 'tmr'] },
      { path: '/dieta', label: 'Dieta', keywords: ['plan', 'intercambios', 'menú'] },
    ],
  },
  {
    id: 'entrenamiento',
    label: 'Entrenamiento',
    sections: [
      {
        path: '/entrenamiento/programas',
        label: 'Programas',
        keywords: ['rutina', 'mesociclo', 'macrociclo'],
      },
      { path: '/entrenamiento', label: 'Seguridad', keywords: ['llaves', 'alta médica'] },
      { path: '/entrenamiento/perfil', label: 'Perfil', keywords: ['atleta', 'whatsapp'] },
      { path: '/entrenamiento/cribado', label: 'Cribado' },
      { path: '/entrenamiento/postura', label: 'Postura' },
      { path: '/entrenamiento/pruebas', label: 'Pruebas físicas' },
    ],
  },
  {
    id: 'evaluaciones',
    label: 'Evaluaciones',
    sections: [
      {
        path: '/evaluaciones',
        label: 'Evaluaciones',
        keywords: ['antropometría', 'pliegues', 'composición'],
      },
      { path: '/evaluaciones/evolucion', label: 'Evolución', keywords: ['comparativa'] },
    ],
  },
  {
    id: 'expediente',
    label: 'Expediente',
    sections: [
      { path: '/ficha', label: 'Ficha', keywords: ['datos', 'equipo', 'exportar', 'archivar'] },
      { path: '/historia', label: 'Historia clínica', keywords: ['anamnesis'] },
      { path: '/registros', label: 'Condiciones, objetivos y notas' },
      { path: '/consentimientos', label: 'Consentimientos' },
      { path: '/documentos', label: 'Documentos', feature: 'RECORD_DOCUMENTS' },
      { path: '/citas', label: 'Citas', keywords: ['agenda'] },
      { path: '/app', label: 'App del paciente', patientWord: true, keywords: ['tema'] },
      { path: '/linea-de-tiempo', label: 'Línea de tiempo', keywords: ['historial'] },
    ],
  },
];

/** Lo que la organización ofrece: una sección con su bandera apagada no se muestra. Sin banderas (no cargaron), todas. */
export function offered(section: RecordSection, features: Features | null): boolean {
  return section.feature === undefined || features?.[section.feature] !== false;
}

/** El nombre de la sección, con la palabra de la organización para el paciente. */
export function sectionLabel(section: RecordSection, patientLabel: string): string {
  return section.patientWord
    ? section.label.replace('paciente', patientLabel.toLowerCase())
    : section.label;
}

/** Todas las secciones, el Resumen primero. */
export function allSections(): readonly RecordSection[] {
  return [RECORD_SUMMARY, ...RECORD_GROUPS.flatMap((group) => group.sections)];
}

/**
 * La sección de una ruta del expediente: la de ruta más larga que la contiene, así una evaluación queda en Evaluaciones y la
 * evolución, en Evolución. El Resumen, solo en su ruta exacta. Fuera del expediente, ninguna.
 */
export function activeSection(pathname: string, patientId: string): RecordSection | null {
  const base = `/panel/pacientes/${patientId}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length);
  let found: RecordSection | null = null;
  for (const section of allSections()) {
    const inside =
      rest === section.path || (section.path !== '' && rest.startsWith(`${section.path}/`));
    if (inside && (found === null || section.path.length > found.path.length)) found = section;
  }
  return found;
}
