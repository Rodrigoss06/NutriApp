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
- Guardias en orden: SessionGuard, TenantGuard, PolicyGuard. El paciente usa /api/v1/me/... y nunca envía su id.
- Lectura de expediente clínico y exportaciones: AuditPort.record().
- Migraciones: prisma/migrations/AAAAMMDDHHMM_nombre/migration.sql. Toda tabla nueva con organization_id lleva
  ENABLE y FORCE ROW LEVEL SECURITY y su política en la misma migración. Luego pnpm db:migrate && pnpm db:pull.
- Tablas particionadas: se crea la padre y se llama app.ensure_monthly_partitions en la migración.
- Logs con pino: nunca cuerpos de petición ni datos personales.
- Pruebas de integración (*.int.spec.ts, Testcontainers, rol app_user) por repositorio y por política RLS nueva.
