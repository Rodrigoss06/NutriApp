import type { PatientExportTable } from '../../clinical/index.js';

/** Lo de content en la exportación del paciente (RN-B04, ADR-131): el material que le asignaron, sus mensajes y su tema de la app. */
export const CONTENT_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'content.resource_assignment', orderBy: 'resource_id' },
  { table: 'content.motivational_message' },
  { table: 'content.patient_app_setting', orderBy: 'patient_id' },
];
