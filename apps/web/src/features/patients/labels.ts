import type {
  AuditEventsQuery,
  CareTeamMember,
  ClinicalHistoryAnswersV1,
  ClinicalNote,
  Condition,
  Consent,
  Goal,
  PatientResponse,
  TimelineItem,
} from '@nutricoach/contracts';

/** Textos del expediente (interfaz en español, regla 9). */
export const SEX_LABELS = { M: 'Masculino', F: 'Femenino' } as const satisfies Record<
  PatientResponse['sex'],
  string
>;

export const POPULATION_LABELS = {
  ADULT: 'Adulto',
  ATHLETE: 'Deportista',
  CHILD: 'Niño',
  ADOLESCENT: 'Adolescente',
  OBESITY: 'Obesidad',
  OLDER_ADULT: 'Adulto mayor',
} as const satisfies Record<PatientResponse['population'], string>;

export const DOCUMENT_TYPE_LABELS = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASAPORTE: 'Pasaporte',
  OTRO: 'Otro documento',
} as const satisfies Record<NonNullable<PatientResponse['documentType']>, string>;

export const PATIENT_STATUS_LABELS = {
  ACTIVE: 'Activo',
  ARCHIVED: 'Archivado',
} as const satisfies Record<PatientResponse['status'], string>;

export const CARE_TEAM_ROLE_LABELS = {
  RESPONSIBLE: 'Responsable',
  NUTRITION: 'Nutrición',
  TRAINING: 'Entrenamiento',
  COLLABORATOR: 'Colaboración',
} as const satisfies Record<CareTeamMember['role'], string>;

export const CARE_TEAM_ACCESS_LABELS = {
  READ: 'Solo lectura',
  WRITE: 'Lectura y escritura',
} as const satisfies Record<CareTeamMember['access'], string>;

export const CONSENT_PURPOSE_LABELS = {
  HEALTH_DATA: 'Datos de salud',
  APP_ACCESS: 'Uso de la app',
  IMAGES: 'Imágenes',
  ANONYMIZED_RESEARCH: 'Investigación anonimizada',
  MARKETING: 'Comunicaciones',
} as const satisfies Record<Consent['purpose'], string>;

export const CONSENT_CHANNEL_LABELS = {
  APP: 'Desde la app',
  IN_PERSON_DIGITAL: 'En consulta, digital',
  PAPER_SCANNED: 'En papel, escaneado',
} as const satisfies Record<Consent['channel'], string>;

export const CONDITION_KIND_LABELS = {
  DISEASE: 'Enfermedad',
  ALLERGY: 'Alergia',
  INTOLERANCE: 'Intolerancia',
  MEDICATION: 'Medicamento',
  SUPPLEMENT: 'Suplemento',
  SURGERY: 'Cirugía',
  INJURY: 'Lesión',
  OTHER: 'Otra',
} as const satisfies Record<Condition['kind'], string>;

export const CONDITION_STATUS_LABELS = {
  ACTIVE: 'Activa',
  RESOLVED: 'Resuelta',
} as const satisfies Record<Condition['status'], string>;

export const GOAL_KIND_LABELS = {
  FAT_LOSS: 'Pérdida de grasa',
  MUSCLE_GAIN: 'Ganancia muscular',
  MAINTENANCE: 'Mantenimiento',
  RECOMPOSITION: 'Recomposición corporal',
  PERFORMANCE: 'Rendimiento',
  HEALTH: 'Salud',
  OTHER: 'Otro',
} as const satisfies Record<Goal['kind'], string>;

export const GOAL_STATUS_LABELS = {
  ACTIVE: 'Activo',
  ACHIEVED: 'Logrado',
  ABANDONED: 'Abandonado',
} as const satisfies Record<Goal['status'], string>;

export const NOTE_VISIBILITY_LABELS = {
  CARE_TEAM: 'Equipo de atención',
  AUTHOR_ONLY: 'Solo yo',
} as const satisfies Record<ClinicalNote['visibility'], string>;

export const TIMELINE_KIND_LABELS = {
  PATIENT_REGISTERED: 'Alta',
  CONSENT_GRANTED: 'Consentimiento otorgado',
  CONSENT_REVOKED: 'Consentimiento revocado',
  HISTORY_REVISED: 'Historia clínica',
  CONDITION_RECORDED: 'Condición',
  GOAL_RECORDED: 'Objetivo',
  NOTE_WRITTEN: 'Nota',
  EVALUATION_CLOSED: 'Evaluación',
  ENERGY_PRESCRIBED: 'Prescripción energética',
  NUTRITION_PLAN_PUBLISHED: 'Plan nutricional publicado',
} as const satisfies Record<TimelineItem['kind'], string>;

export const AUDIT_ACTION_LABELS = {
  READ: 'Lectura',
  CREATE: 'Alta',
  UPDATE: 'Cambio',
  PUBLISH: 'Publicación',
  EXPORT: 'Exportación',
  LOGIN: 'Ingreso',
  LOGIN_FAILED: 'Ingreso fallido',
  LOGOUT: 'Salida',
  GRANT: 'Otorgamiento',
  REVOKE: 'Revocación',
} as const satisfies Record<NonNullable<AuditEventsQuery['action']>, string>;

/** Qué se leyó o cambió, en palabras de la persona; el recurso técnico si no hay texto. */
export const AUDIT_RESOURCE_LABELS: Readonly<Record<string, string>> = {
  'clinical.patient': 'Ficha',
  'clinical.consent': 'Consentimiento',
  'clinical.care_team_member': 'Equipo de atención',
  'clinical.clinical_history': 'Historia clínica',
  'clinical.condition': 'Condiciones',
  'clinical.goal': 'Objetivos',
  'clinical.clinical_note': 'Notas',
  'clinical.timeline': 'Línea de tiempo',
  'assessment.evaluation': 'Evaluación',
  'assessment.measurement': 'Medidas de una evaluación',
  'assessment.bia_reading': 'Bioimpedancia',
  'assessment.calculation_result': 'Resultados de una evaluación',
  'assessment.evaluator_error': 'ETM del evaluador',
  'assessment.method_preference': 'Métodos preferidos',
  'nutrition.energy_basis': 'Datos para la energía',
  'nutrition.energy_prescription': 'Prescripción energética',
  'iam.session': 'Sesión',
  'iam.invitation': 'Invitación',
  'iam.user_account': 'Cuenta',
  'iam.password_reset': 'Recuperación de contraseña',
  'tenancy.member': 'Miembro',
  'tenancy.branding': 'Marca de las fichas',
  'tenancy.organization': 'Organización',
  'tenancy.organization_setting': 'Ajuste',
  'tenancy.subscription': 'Suscripción',
};

/** Los bloques de la historia clínica v1, en el orden de la consulta (⚠️ provisional, ADR-041). */
export const HISTORY_BLOCKS: readonly { key: keyof ClinicalHistoryAnswersV1; label: string }[] = [
  { key: 'personalHistory', label: 'Antecedentes personales' },
  { key: 'familyHistory', label: 'Antecedentes familiares' },
  { key: 'dietHabits', label: 'Hábitos de alimentación' },
  { key: 'physicalActivity', label: 'Actividad física' },
  { key: 'sleep', label: 'Sueño' },
  { key: 'tobacco', label: 'Tabaco' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'medications', label: 'Medicamentos' },
  { key: 'supplements', label: 'Suplementos' },
  { key: 'allergies', label: 'Alergias' },
  { key: 'intolerances', label: 'Intolerancias' },
  { key: 'surgeries', label: 'Cirugías' },
  { key: 'injuries', label: 'Lesiones' },
  { key: 'goals', label: 'Objetivos que cuenta' },
];

/** Solo los 4 últimos dígitos del documento (RN-B06): el número completo no viaja. */
export function maskedDocument(patient: Pick<PatientResponse, 'documentType' | 'documentLast4'>) {
  if (!patient.documentType || !patient.documentLast4) return null;
  return `${DOCUMENT_TYPE_LABELS[patient.documentType]} ···· ${patient.documentLast4}`;
}

/** Opciones de un Select a partir de un mapa de textos. */
export function optionsOf<K extends string>(labels: Readonly<Record<K, string>>) {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}
