// API pública de migration (02 §2). Solo la CLI la usa.
export {
  AccountImporter,
  type AccountFile,
  type AccountImportRequest,
  type AccountReport,
  type CountCheck,
  type FileReport,
  type SampleCheck,
} from './application/account-importer.js';
export { TEMPLATE_COLUMNS, TEMPLATE_FILES, type TemplateFile } from './domain/account-template.js';
export { MigrationModule } from './migration.module.js';
