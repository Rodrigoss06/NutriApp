import { defineConfig } from 'prisma/config';

// Base de datos primero (ADR-011, ADR-024): migraciones en SQL aplicadas con `migrate deploy` e
// introspección con `db pull`, ambas como app_owner. La API y el worker usan app_user (DATABASE_URL).
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: las variables llegan del entorno (CI, staging, producción).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Vacía solo para `prisma generate`, que no se conecta.
  datasource: { url: process.env['DATABASE_OWNER_URL'] ?? '' },
});
