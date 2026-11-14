import type { PatientExportTable } from '../../clinical/index.js';

/** Lo de scheduling en la exportación del paciente (RN-B04, ADR-131): sus citas, con la nota del profesional. */
export const SCHEDULING_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'scheduling.appointment' },
];
