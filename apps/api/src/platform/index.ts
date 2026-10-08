export { AuditModule } from './audit/audit.module.js';
export { DatabaseModule } from './database/database.module.js';
export { PRISMA, type Db } from './database/prisma.provider.js';
export { ConsumerRegistry, type EventConsumer } from './events/event-consumer.js';
export { EventsModule } from './events/events.module.js';
export type { OutboxEnvelope } from './events/outbox-envelope.js';
export { API_PORT, configureHttp } from './http/configure-http.js';
export type { ContextualRequest } from './http/request-context.js';
export { IdempotencyModule } from './idempotency/idempotency.module.js';
export { HealthModule } from './health/health.module.js';
export { PlatformModule } from './platform.module.js';
export { WorkerPlatformModule } from './worker/worker-platform.module.js';
export { WorkerRuntime } from './worker/worker-runtime.js';
export {
  ACCESS_RULE,
  AllowedWhenReadOnly,
  Authenticated,
  PERMISSIONS,
  PlatformOnly,
  Public,
  RequirePermission,
  type AccessRule,
  type Permission,
} from './auth/access.js';
export { AuthModule } from './auth/auth.module.js';
export {
  SESSION_AUTHENTICATOR,
  type SessionAuthenticator,
  type SessionKind,
  type SessionPrincipal,
} from './auth/session-authenticator.port.js';
export {
  clearSessionCookie,
  hashToken,
  readSessionToken,
  setSessionCookie,
} from './auth/session-cookie.js';
export {
  TENANT_DIRECTORY,
  type MemberRole,
  type MembershipView,
  type OrganizationStatus,
  type TenantDirectory,
} from './auth/tenant-directory.port.js';
export { loadEnv } from './config/env.js';
export { parseBody } from './http/parse-body.js';
export { problemFromDomainError, ProblemException } from './http/problem.js';
export { MAILER, type MailerPort, type MailMessage } from './mail/mailer.port.js';
export {
  RATE_LIMITS,
  RateLimiter,
  rateLimitEmail,
  rateLimitIp,
} from './rate-limit/rate-limiter.js';
