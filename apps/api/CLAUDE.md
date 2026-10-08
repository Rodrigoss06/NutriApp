# apps/api — reglas del backend

- Un contexto por carpeta en `src/modules/` (Notion 02 Arquitectura). Plantilla:
  domain/ · application/(commands, queries, ports, event-handlers) · adapters/(in/http, in/jobs, in/events, out/persistence)
  · CONTEXTO.module.ts · index.ts (API pública)
- Comandos: un handler por caso de uso dentro de `UnitOfWork.run()`: transacción + set_config de app.org_id,
  app.user_id, app.role y app.patient_id. Consultas: transacción de solo lectura con el mismo contexto.
- Repositorios: cargan y guardan agregados completos, con bloqueo optimista por `version`.
- Eventos: el agregado los acumula; el handler los guarda en platform.outbox_event en la misma transacción,
  con INSERT sin RETURNING. Consumidores idempotentes con platform.processed_event.
- Controladores: validan con @nutricoach/contracts, no tienen lógica, responden errores RFC 9457 con code y rule.
- Guardias en orden: OriginGuard, SessionGuard, TenantGuard, PolicyGuard. Se niega por defecto: cada ruta declara
  @Public, @Authenticated, @PlatformOnly o @RequirePermission (test/access-rules.api.spec.ts lo verifica). Las
  escrituras permitidas en solo lectura llevan @AllowedWhenReadOnly. El paciente usa /api/v1/me/... y nunca envía su id.
- Errores: casos de uso devuelven Result con DomainError; el controlador usa problemFromDomainError. Cuerpos con
  parseBody y su contrato. Entradas sensibles al abuso pasan por RateLimiter (ADR-030).
- Lectura de expediente clínico y exportaciones: AuditPort.record().
- Migraciones: prisma/migrations/AAAAMMDDHHMM_nombre/migration.sql. Toda tabla nueva con organization_id lleva
  en la misma migración `SELECT app.enable_tenant_rls(...)` (o `app.enable_catalog_rls` si NULL es global) y
  `SELECT app.restrict_patient(...)` con lo que el paciente puede ver y escribir (ADR-025). Luego
  pnpm db:migrate && pnpm db:pull. schema.prisma no se edita a mano.
- Permisos: app_user nace con SELECT, INSERT y UPDATE; DELETE y UPDATE por columna se conceden explícitos.
- Tablas particionadas: se crea la padre y se llama app.ensure_monthly_partitions en la migración. Sin FK hacia
  ni desde ellas: un disparador de restricción (ADR-024). Una tabla particionada nueva entra en la lista
  cerrada de la función y en PARTITIONED_TABLES.
- Auditoría con AUDIT_PORT (transacción propia, falla cerrado); campos sensibles con ENCRYPTION_PORT.
- Logs con pino: nunca cuerpos de petición ni datos personales.
- Pruebas de integración (*.int.spec.ts, Testcontainers, rol app_user) por repositorio y por política RLS nueva.
  Junto al código si prueban archivos internos; en test/integration si solo usan la API pública.
