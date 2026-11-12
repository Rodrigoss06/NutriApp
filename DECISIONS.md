# DECISIONS — registro de decisiones (ADR)

Cada ADR: contexto, decisión y consecuencias. Estado: aceptada, o reemplazada por ADR-0XX.
Las nuevas se agregan al final con el número siguiente. Ninguna se borra: se reemplaza.
Detalle en Notion: Documento técnico y páginas 01 a 06.

## ADR-001 · Monolito modular con arquitectura hexagonal y DDD — aceptada (2026-10-02)
Contexto: 2 personas, 9 semanas, 24 módulos, un servidor de 4 GB y fases futuras grandes.
Decisión: un despliegue (api, worker y web); contextos delimitados con capas domain, application y adapters;
cada contexto expone solo su index.ts.
Consecuencias: barato de operar; fronteras verificadas con dependency-cruiser; contextos extraíbles a servicios.

## ADR-002 · Un esquema de PostgreSQL por contexto, sin claves foráneas entre contextos — aceptada
Contexto: los contextos deben poder separarse sin migraciones traumáticas.
Decisión: esquema por contexto; entre contextos solo identificadores; consistencia por eventos.
Consecuencias: sin joins de escritura entre contextos; las vistas cruzadas viven en analytics.

## ADR-003 · UUIDv7 generados en el dominio — aceptada
Decisión: el dominio genera UUIDv7 (puerto IdGenerator); uuidv7() de PostgreSQL 18 como respaldo.
Consecuencias: identidad antes de guardar, orden temporal, índices compactos y registros sin conexión.

## ADR-004 · organization_id en cada fila y Row Level Security — aceptada
Decisión: RLS habilitada y forzada en toda tabla con organization_id; la aplicación corre como app_user sin
BYPASSRLS y fija app.org_id, app.user_id, app.role y app.patient_id por transacción.
Consecuencias: un error en una consulta no expone otra organización; prueba automática de aislamiento.

## ADR-005 · Particionado mensual de seguimiento y auditoría — aceptada
Decisión: tablas de tracking y audit.audit_log particionadas por mes; hijas en el esquema part, creadas por
app.ensure_monthly_partitions (función propia, sin pg_partman) que el worker llama a diario.
Consecuencias: Prisma solo ve las tablas padre; archivar historia es separar particiones.

## ADR-006 · Eventos con outbox transaccional y pg-boss, sin Redis — aceptada
Decisión: eventos guardados en platform.outbox_event dentro de la transacción del comando; el worker los
publica con pg-boss; consumidores idempotentes con platform.processed_event.
Consecuencias: entrega al menos una vez; una pieza menos que operar.

## ADR-007 · Motor de cálculo puro y versionado — aceptada
Decisión: packages/engine sin dependencias ni E/S; registro de métodos con código y versión; casos dorados.
Consecuencias: cada número es reproducible años después; el frontend puede usarlo para vistas previas.

## ADR-008 · Inmutabilidad al publicar — aceptada
Decisión: resultados, planes, rutinas y fichas publicados son snapshots inmutables; editar crea una versión.
Consecuencias: la app del paciente y los PDF nunca cambian por detrás; un disparador lo refuerza en la base.

## ADR-009 · Autenticación propia con sesiones opacas — aceptada
Decisión: token opaco de 256 bits en cookie httpOnly, Secure y SameSite=Lax; en la base solo su hash;
contraseñas con argon2id; invitaciones de un solo uso.
Consecuencias: revocación inmediata; nada legible desde el navegador; sin proveedores externos.

## ADR-010 · Una sola aplicación Next.js con grupos de rutas — aceptada
Decisión: (public), (panel), (paciente) y (admin) en apps/web; la app del paciente es una PWA instalable.
Consecuencias: un despliegue y un sistema de diseño; experiencias separadas por layout.

## ADR-011 · Prisma con base de datos primero — aceptada (confirmada por el spike de P2, ADR-024)
Decisión: migraciones en SQL aplicadas con prisma migrate deploy; schema.prisma se regenera con db pull;
nunca prisma migrate dev. CI falla si db pull cambia schema.prisma. Desde P2 no hay FK sobre tablas
particionadas: Prisma no las introspecta y se reemplazan por disparadores de restricción (ADR-024).
Consecuencias: RLS, particiones y restricciones avanzadas viven versionadas en SQL sin pelear con Prisma.

## ADR-012 · Docker Compose en un servidor de Hetzner, con staging en el mismo servidor — aceptada
Decisión: Caddy, web, api, worker y PostgreSQL en contenedores con límites de memoria; staging aparte en el
mismo servidor; despliegue por GitHub Actions.
Consecuencias: el costo cotizado; el crecimiento sigue la ruta de Notion 01 y 05.

## ADR-013 · Código en inglés; interfaz, documentación y commits en español — aceptada
Consecuencias: el glosario del documento técnico es obligatorio para nombrar.

## ADR-014 · Catálogos y puntos de corte como datos versionados — aceptada
Decisión: sitios de medición, rangos de referencia, listas de intercambio, nutrientes, métricas y actividades
son tablas con fuente y versión.
Consecuencias: adaptar una guía o un país no exige desplegar código.

## ADR-015 · Cifrado en tres capas — aceptada
Decisión: disco de datos con LUKS; documento y teléfono con AES-256-GCM e índice ciego HMAC; respaldos
cifrados con llaves fuera del servidor.
Consecuencias: perder las llaves inutiliza los respaldos: se guardan en el gestor de contraseñas y en copia
sellada para el cliente.

## ADR-016 · Estrategia energética aditiva con ejercicio neto por defecto — aceptada
Decisión: GET = TMR × PAL de vida diaria + ejercicio neto (MET − 1); la estrategia factorial existe pero no
suma ejercicio (RN-E02, RN-E03).
Consecuencias: se evita el doble conteo del ejercicio, el error más caro del dominio.

## ADR-017 · API en ESM por NestJS 12 — aceptada (2026-10-03)
Contexto: NestJS 12 publica sus paquetes solo como ESM y su CLI recomienda ESM con Vitest en proyectos nuevos.
Decisión: apps/api con "type": "module", module y moduleResolution nodenext, imports relativos con .js y
verbatimModuleSyntax; compila con SWC (nest build) y se prueba con Vitest y unplugin-swc.
Consecuencias: los tipos se importan con import type (importar una interfaz como valor falla al ejecutar); un ciclo
entre archivos rompe la inyección en ESM: lo atrapa no-circular en lint:arch y, si hiciera falta, forwardRef.

## ADR-018 · TypeScript 6.0 y pnpm 10 fijados — aceptada (2026-10-03)
Contexto: la última versión es TypeScript 7.0, pero typescript-eslint 8.71 soporta hasta la 6.0 y el lint con tipos
es parte de RNF-22. pnpm 12 existe; la rama 10 sigue con parches y es la que el equipo ya usa.
Decisión: typescript ~6.0.3 en el catálogo de pnpm-workspace.yaml y pnpm 10.34.6 en packageManager, que corepack de
Node 24 respeta. Los tsconfig no usan baseUrl: TypeScript 6 lo depreca.
Consecuencias: pasar a TypeScript 7 cuando typescript-eslint lo soporte. El alias @/* de la web se declara para
dependency-cruiser en packages/config/dependency-cruiser.resolve.cjs.

## ADR-019 · Paquetes internos compilados con la condición @nutricoach/source — aceptada (2026-10-03)
Contexto: Node y Next necesitan JavaScript compilado; los tipos, las pruebas y las reglas de arquitectura no deberían
esperar a que se compilen los paquetes de los que dependen.
Decisión: engine, shared-kernel y contracts compilan a dist (ESM con d.ts) y su exports declara además la condición
@nutricoach/source hacia src, que usan TypeScript (customConditions), Vitest y dependency-cruiser. ui no se compila:
Next lo transpila.
Consecuencias: typecheck, lint, test y lint:arch corren sin compilar antes; pnpm dev y pnpm build compilan primero
los paquetes (dependsOn ^build en turbo.json).

## ADR-020 · ESLint 10 sin eslint-config-next — aceptada (2026-10-03)
Contexto: eslint-config-next arrastra eslint-plugin-react, import y jsx-a11y sin soporte claro de ESLint 10.
Decisión: typescript-eslint strictTypeChecked con @next/eslint-plugin-next y eslint-plugin-react-hooks, compuestos en
packages/config.
Consecuencias: el lint no trae reglas jsx-a11y; la accesibilidad se verifica con axe en Playwright (RNF-18, desde P3).

## ADR-021 · Lectura de las reglas de dependencia de 02 §4 — aceptada (2026-10-03)
Contexto: la tabla de 02 §4 dice qué puede importar cada capa y dependency-cruiser no ve los nombres importados.
Decisión: lo que domain puede importar es una lista cerrada: su dominio, shared-kernel y tipos de engine (ni Node ni
otras bibliotecas). src/platform se trata como un módulo: desde fuera solo su index.ts. Además: sin ciclos salvo
imports de solo tipos, paquetes que no dependen de apps, engine y shared-kernel sin dependencias, y web sin
shared-kernel. Que application use de NestJS solo Injectable e Inject lo verifica no-restricted-imports de ESLint.
Consecuencias: usar date-fns u otra biblioteca dentro de domain exige discutirlo y registrar un ADR.

## ADR-022 · Durnin y Womersley con los coeficientes del artículo original — aceptada (2026-10-04)
Contexto: el consenso GREC 2009 imprime m = 0.0799 para hombres de 50 años o más; el artículo original de Durnin y
Womersley (1974) da 0.0779. La guía de dominio y su motor de referencia copiaron la errata.
Decisión: el motor usa 0.0779 y suma las bandas del artículo para 17–19 años (hombres) y 16–19 (mujeres). Se corrigen
docs/reference/engine.ts y la guía en el mismo cambio, para que la referencia siga sirviendo de comparación.
Consecuencias: un hombre de 55 años con 60 mm de suma da 29.20 % de grasa y no 30.85 %; el caso dorado G-26 bloquea
la vuelta a la errata. Los números de Luis (28 años) no cambian.

## ADR-023 · Contrato del motor de cálculo — aceptada (2026-10-06)
Contexto: P7 guarda cada resultado en assessment.calculation_result y la interfaz muestra sus avisos; el motor
tiene que entregar siempre lo mismo y explicar por qué no calcula.
Decisión: runMethod valida los rangos de RN-C04, aplica la validez de cada método con gravedad ERROR,
WARNING o INFO (RN-D06; ERROR no calcula, INFO queda en la definición) y devuelve el sobre de RN-D01 con
inputsHash = SHA-256 del JSON canónico. Cada aviso trae su regla y un código NC-ENG-NNN estable. Los insumos
con orden significativo van como listas, no como objetos (JSONB reordena las claves). Los sitios usan los
códigos de engine/src/sites.ts, que la semilla del catálogo de P7 debe reutilizar. El GET con PAL no tiene
código propio en 02 §9: es una función pura que devuelve sus avisos.
Consecuencias: recalcular desde los insumos guardados reproduce el resultado y su hash. Agregar un aviso o
cambiar su código es un cambio del método y sube su versión.

## ADR-024 · Spike de Prisma 7 con particiones, varios esquemas y RLS — aceptada (2026-10-06)
Contexto: 05 §10 pide confirmar, con la versión estable instalada, que db pull reconoce las tablas padre
particionadas y que el cliente trabaja con `@@id([id, localDate])`. P2 suma la unidad de trabajo con
nestjs-cls y pg-boss.
Hallazgos con Prisma 7.10.0 (la etiqueta `latest` de npm apunta a 8.0.0-rc), @prisma/adapter-pg y PostgreSQL 18:
- db pull ve solo las tablas padre; una partición nueva en `part` no cambia schema.prisma.
- `@@id([id, localDate])` funciona: create y findUnique por `id_localDate`.
- Las tablas con el mismo nombre en dos esquemas (`iam.session`, `training.session`) salen con el esquema
  como prefijo. Los nombres en inglés con `@@map` y `@map` se conservan al volver a introspectar.
- Una FK hacia una tabla particionada rompe db pull (P4002): PostgreSQL la clona hacia cada partición de
  `part`, y agregar `part` a `schemas` cambiaría schema.prisma cada mes.
- Las columnas generadas salen con `@default(dbgenerated(...))`: se leen y nunca se escriben.
- `createMany` no usa RETURNING y respeta la política del outbox; `create` falla con 42501, como se espera.
- @nestjs-cls/transactional 4 con su adaptador de Prisma 2 funciona con Prisma 7 y el adaptador pg:
  set_config(..., true) queda en la transacción y no se filtra; READ ONLY rechaza escrituras.
- `_prisma_migrations` queda en `public`.
- pg-boss 12.37 crea tablas al crear colas y particiones de estadísticas mientras corre.
Decisión: Prisma 7.10.0 y pg-boss 12.37.0 con versión fija. `prisma.config.ts` con la URL de app_owner para
migrar e introspectar; el cliente usa el adaptador pg con app_user. Sin FK sobre tablas particionadas: la
FK de 05.2 de `tracking.set_log` hacia `tracking.workout_log` pasa a un disparador de restricción. El
esquema `pgboss` lo crea una migración con AUTHORIZATION app_user y pg-boss se migra solo dentro de él.
Consecuencias: schema.prisma sigue siendo generado y CI puede compararlo. Toda FK nueva hacia o desde una
tabla particionada se escribe como disparador. Cambio para Notion 05.2 y 05 §10 (/notion-sync).

## ADR-025 · Seguridad de datos en PostgreSQL — aceptada (2026-10-06)
Contexto: 05 §3 fija roles, RLS y políticas especiales; P2 decidió el resto con Rodrigo (decisiones 1 a 9).
Decisión:
- infra/db/init solo hace lo que exige superusuario: roles, base, extensiones y zona horaria UTC, más
  `GRANT app_user TO app_owner WITH INHERIT FALSE, SET TRUE` para crear el esquema pgboss. Esquemas,
  funciones app.* y permisos por defecto van en la migración 0000, de app_owner.
- Toda tabla con organization_id tiene RLS forzada, sin excepciones; iam.invitation también, y se busca sin
  sesión con app.find_invitation(hash). processed_event e idempotency_key tienen RLS propia.
- Segunda capa del paciente como lista de lo permitido (política restrictiva patient_scope en cada tabla).
- PLATFORM_ADMIN solo lee los esquemas clínicos con un CLINICAL_READ vigente, verificado por
  app.has_clinical_support_grant(); nunca escribe ahí.
- Catálogos con organization_id NULL: se lee lo global y lo propio; lo global lo escribe solo SYSTEM.
- Funciones SECURITY DEFINER de app_owner, con search_path fijo y EXECUTE solo para app_user.
- Inmutabilidad: disparadores donde depende del estado (plan, rutina, evaluación cerrada y sus tomas) y
  permisos por columna en el resto (resultados, registros, consentimiento, invitación, suscripción).
- DELETE solo donde se concede: hijos de borradores, equipo de atención, disponibilidad, read models y la
  limpieza de SYSTEM.
- Índice ciego HMAC(organization_id:tipo:documento normalizado) y cifrado con datos asociados por lugar.
Consecuencias: el catálogo de PostgreSQL lo verifica en cada CI (rls-catalog.int.spec.ts). Una tabla nueva
usa app.enable_tenant_rls o app.enable_catalog_rls y app.restrict_patient en su misma migración.

## ADR-026 · Plataforma de eventos, idempotencia y auditoría — aceptada (2026-10-06)
Contexto: 02 §6 pide outbox, consumidores idempotentes, Idempotency-Key y auditoría de lecturas.
Decisión:
- Outbox con createMany (sin RETURNING) en la transacción del comando. El worker despacha cada segundo con
  FOR UPDATE SKIP LOCKED y publica en pg-boss 12; cada consumidor tiene su cola, 5 reintentos con espera
  creciente y la cola de errores platform.dead-letter. processed_event va en la misma transacción que el
  consumidor. Los consumidores comparan occurredAt o versión antes de pisar un read model.
- pg-boss se migra solo en su esquema, con createSchema: false.
- Idempotency-Key: la misma clave y el mismo cuerpo repiten la respuesta; otro cuerpo, 422; en curso, 409;
  las 5xx no se guardan. 24 horas de vida y limpieza diaria.
- AuditPort escribe en una transacción propia (las consultas son de solo lectura) y falla cerrado.
- Mantenimiento diario en UTC: particiones a las 02:00 y limpieza a las 03:30 (outbox de más de 7 días,
  processed_event de más de 30 e idempotencia vencida). El worker también asegura particiones al arrancar.
- /api/health/ready: base, migraciones aplicadas (app.applied_migrations), cola activa (cron de pg-boss en
  los últimos 5 minutos) y partición del mes siguiente.
Consecuencias: entrega al menos una vez; la imagen de la API debe llevar prisma/migrations para /ready.

## ADR-027 · Sistema de diseño y marca en ejecución — aceptada (2026-10-06)
Contexto: P3 pide una interfaz coherente, accesible (WCAG 2.2 AA) y con la marca de la organización y el tema
del paciente cambiables sin tocar componentes (RN-H03).
Decisión:
- Tailwind 4 con tokens en packages/ui/src/styles.css. La marca vive en :root como --brand-*; @theme inline solo
  la referencia con var(). Componentes al estilo shadcn/ui con Radix (paquete radix-ui).
- brandTokens(hex) deriva texto sobre el color (≥ 4.5:1), el color como texto sobre blanco (≥ 4.5:1) y borde y
  foco (≥ 3:1) para el primario y el secundario; el tema del paciente pasa por la misma función.
- BrandStyle pinta las variables desde el servidor en un <style> de :root (sin useEffect, sin parpadeo). Va en
  :root y no en un contenedor porque los diálogos y menús de Radix se montan en <body>. Exige style-src
  'unsafe-inline' en la CSP del despliegue; los scripts siguen estrictos.
- Etiquetas de los métodos en @nutricoach/contracts (las usan web y las fichas PDF de api).
- packages/ui importa sin extensión (moduleResolution Bundler): Turbopack no resuelve `.js` hacia `.tsx`.
- pnpm con virtualStoreDirMaxLength 60: con Playwright como peer opcional de next, la ruta del paquete pasaba
  de 160 caracteres y Turbopack no encontraba next/package.json.
- APP_ENV (local, staging, production) se lee en cada petición: la misma imagen corre en staging y producción.
- PWA con alcance /mi/: «Hoy» vive en /mi/hoy y /mi redirige ahí, para que el inicio quede dentro del alcance.
Consecuencias: un componente nuevo usa solo tokens. Lighthouse en CI queda para cuando exista staging (RNF-03).

## ADR-028 · Bloque de Next.js en apps/web/CLAUDE.md — aceptada (2026-10-06)
Contexto: Next 16.3 escribe en cada `next dev` un bloque entre los marcadores `nextjs-agent-rules` que remite a
la documentación de la versión instalada (node_modules/next/dist/docs); Next 16 cambió APIs.
Decisión: el bloque se commitea y no se edita a mano ni se desactiva (sin `agentRules: false`). Nuestras reglas
van fuera de los marcadores. Si `next dev` crea apps/web/AGENTS.md, también se commitea.
Consecuencias: el árbol queda limpio tras `next dev`. En Notion solo va nuestro contenido. La caché de Next se
borra con `pnpm --filter web clean`, sin `rm -rf`.

## ADR-029 · El GET con PAL es el método TEE_PAL — aceptada (2026-10-07)
Contexto: ADR-023 dejó el GET como función sin código porque 02 §9 no le daba uno.
Decisión: TEE_PAL 1.0.0 en el registro, con estrategia (aditiva o factorial) y modo neto del ejercicio como
insumos, y la validez de la fila «GET con PAL» de 03. Motor 1.1.0. Etiqueta: «Gasto energético total
(TMR × PAL + ejercicio)». Reemplaza en esto a ADR-023.
Consecuencias: el GET guardado lleva método, versión e insumos con hash como cualquier resultado. P7 agrega
tee_method_code y tee_method_version a nutrition.energy_prescription en su migración.

## ADR-030 · Límite de intentos en la base, solo por funciones — aceptada (2026-10-07)
Contexto: RN-A07 pide limitar intentos y 01 §1 que la aplicación no guarde estado en memoria. Usar el rol SYSTEM en
una petición anónima le daría acceso al outbox y a los catálogos globales.
Decisión: tabla platform.rate_limit sin permisos para app_user y con RLS forzada sin políticas. El acceso es solo por
app.hit_rate_limit(clave, ventana, máximo) y app.purge_rate_limits(), SECURITY DEFINER de app_owner. Ventana fija
con un UPSERT atómico. Clave = SHA-256 de «alcance:valor» calculado en la API: correo normalizado e IPv6 agrupada
por /64. IP real con trust proxy 'loopback, uniquelocal'. Valores iniciales: entrar 30 por IP cada 15 min;
recuperar 5 por IP cada 15 min y 3 por correo por hora; enlaces con token 30 por IP cada 15 min.
RATE_LIMIT_FACTOR los multiplica en E2E y k6. Pasado el máximo: 429 con Retry-After.
Consecuencias: ni el correo ni la IP quedan en claro en la base. Caddy no debe confiar en X-Forwarded-For ajeno (P4).

## ADR-031 · Sesiones opacas con tres tipos y entrada que no delata cuentas — aceptada (2026-10-07)
Contexto: RN-A07, RN-A08 y RNF-13; el panel interno (P15) necesita sesiones separadas de las de una organización.
Decisión: token de 256 bits en cookie httpOnly, Secure, SameSite=Lax y Path=/ (__Host-nc_session en staging y
producción); en la base solo su SHA-256. Tipos STAFF, PATIENT y PLATFORM: una cuenta con is_platform_admin entra
como PLATFORM, con las expiraciones de STAFF; TenantGuard rechaza PLATFORM y las rutas de plataforma rechazan STAFF.
Se niega por defecto: cada ruta declara @Public, @Authenticated, @PlatformOnly o un permiso, y una prueba recorre
las rutas. Origin obligatorio e igual a APP_URL en toda escritura. Contraseñas NFKC de 10 a 128 code points con
argon2id; toda falla al entrar responde igual y verifica un hash señuelo; el bloqueo usa locked_until y un UPDATE
atómico. La inactividad se desliza como mucho una vez por minuto.
Consecuencias: quitar una cuenta o un miembro corta el acceso en la petición siguiente.

## ADR-032 · Correos de cuenta desde el worker con el token cifrado — aceptada (2026-10-07)
Contexto: recuperar la contraseña debe responder igual y al instante exista o no la cuenta, y un fallo de Resend
no debe perder el enlace.
Decisión: la petición escribe un evento con el id y el token cifrado con EncryptionPort (datos asociados del pedido);
el worker busca el correo, descifra y envía con MailerPort (SMTP en local, Resend en staging y producción). El
token va en el fragmento del enlace (/recuperar/nueva#TOKEN), armado con APP_URL. Resend sin seguimiento de clics.
Consecuencias: el token nunca queda en claro en la base ni en los logs. Si el pedido ya se usó, no se envía nada.

## ADR-033 · Cupos y «al menos un dueño» con un candado por organización — aceptada (2026-10-07)
Contexto: RN-A03 y RN-A04 se rompen con dos peticiones simultáneas que cuentan antes de escribir.
Decisión: QuotaPolicy en la API pública de tenancy toma pg_advisory_xact_lock(hashtextextended('tenancy:' || org))
dentro de la transacción del caso de uso, cuenta y compara con el límite congelado de la suscripción activa. El
mismo candado protege RN-A04. Cupo de staff: OWNER, ADMIN y PROFESSIONAL activos; al invitar suma las invitaciones
de staff vigentes; al aceptar, activos + 1 sin contar las demás; SUSPENDED no cuenta y reactivar vuelve a verificar.
Aceptar una invitación de staff es síncrono (02 §8): una sola transacción en el contexto de la organización marca
accepted_at con UPDATE condicional, crea o activa la cuenta, da de alta al miembro con QuotaPolicy, abre la sesión y
emite iam.invitation.accepted; si algo falla, se revierte todo. Una invitación pendiente por correo y organización
(índice parcial): reenviar revoca la anterior.
Consecuencias: el perdedor de una carrera recibe 422 con la regla, no un cupo excedido. La profesión del invitado
se fija después en su ficha de miembro (iam.invitation no la guarda).

## ADR-034 · Panel de plataforma, vencimiento RN-A02 y semilla — aceptada (2026-10-07)
Contexto: RF-39 y RN-A02; el primer PLATFORM_ADMIN de un entorno no puede depender de otro.
Decisión: el módulo backoffice orquesta las API públicas de tenancy (PlatformTenancy) e iam (IamApi) con el
contexto PLATFORM_ADMIN de la organización afectada: alta de organización con su suscripción y la invitación al
dueño en una transacción, renovar o cambiar de plan (la anterior pasa a REPLACED y READ_ONLY vuelve a ACTIVE) y
días de gracia. El trabajo tenancy.expire-subscriptions corre cada hora en el worker con contexto PLATFORM_ADMIN
(nunca app_owner) y actor SYSTEM en la auditoría: vence cuando la fecha local de la organización pasa ends_on +
gracia. La CLI create-platform-admin crea la cuenta sin contraseña y un enlace de 24 horas por correo. Las escrituras
de iam y tenancy se auditan desde sus eventos con el consumidor audit.events. pnpm db:seed (solo local y staging,
como app_owner) carga TRAMO_5 y TRAMO_50 con valores provisionales de N9, una organización demo con dueña y
profesional y un PLATFORM_ADMIN demo; en staging la contraseña llega en SEED_DEMO_PASSWORD.
Consecuencias: cuando el cliente cierre N9, los planes se corrigen con una migración de datos, no en la semilla.

## ADR-035 · Cookie Secure según el esquema de APP_URL — aceptada (2026-10-08)
Contexto: precisa ADR-009 y ADR-031. Safari y WebKit no guardan cookies Secure en http://localhost (bug 232088 de
WebKit, abierto), y el E2E del celular corre en WebKit sobre http://localhost.
Decisión: la cookie de sesión es Secure si APP_URL usa https y no lo es con http://localhost. env.ts exige APP_URL
con https cuando APP_ENV es staging o production y cuando SESSION_COOKIE_NAME empieza con __Host-; con NODE_ENV
production sigue exigiendo el prefijo __Host-. httpOnly, SameSite=Lax y Path=/ no cambian.
Consecuencias: fuera de local la cookie siempre es Secure y __Host-; en local y CI la sesión funciona en todos los
navegadores. Un despliegue con http falla al arrancar.

## ADR-036 · Datos y sesión en la web — aceptada (2026-10-08)
Contexto: RF-01 a RF-04 en la web sin duplicar la autorización de la API.
Decisión: el navegador llama a /api con TanStack Query para toda mutación (ninguna Server Action contra la API);
Next reescribe /api a API_INTERNAL_URL, que existe al compilar en CI porque los rewrites quedan en el manifiesto
del build (en staging y producción Caddy atiende /api antes que Next). Los componentes de servidor leen
API_INTERNAL_URL en ejecución, con cache: 'no-store', la cookie y X-Forwarded-For. El layout de (panel) pide la
cuenta en cada petición; sin sesión lleva a /entrar?next= (solo rutas internas) y una sesión PLATFORM va a la
página de (admin)/admin/plataforma, con su guardia en un layout anidado para que /admin/componentes siga sin sesión.
Cambiar de organización o salir vacía la caché de consultas y refresca. Los tokens de invitación y recuperación se
leen del fragmento y se borran con history.replaceState. La interfaz oculta lo que el rol no puede; decide la API.
Consecuencias: no hay proxy.ts; la protección de rutas en la web es solo comodidad.

## ADR-037 · Equipo de atención en la base: care_team_scope — aceptada (2026-10-09)
Contexto: RN-A05 pide que, con visibilidad CARE_TEAM, cada profesional vea solo a sus pacientes; como RN-A01, debe
valer también si una consulta olvida el filtro.
Decisión: la UnitOfWork fija app.member_id. app.can_see_patient(patient_id) es SECURITY DEFINER de app_owner (search_path
fijo, filtra por app.org_id(); sin ella la política de care_team_member se llamaría a sí misma) y deja pasar a OWNER; a
toda la organización si la visibilidad es ORGANIZATION; al responsable y al equipo; a PATIENT, SYSTEM y PLATFORM_ADMIN,
que tienen sus propias políticas; y a ACCOUNT solo para el paciente cuya invitación aceptó o al que ya está vinculado.
ADMIN sigue RN-A05 como PROFESSIONAL (puede no ser clínico: proporcionalidad de la Ley 29733). ACCOUNT existe solo dentro
de la transacción de aceptación, nunca en una sesión, y tiene su lista de lo permitido (account_scope, como
restrict_patient): en los datos clínicos solo la ficha y los consentimientos. app.enable_care_team_scope
crea políticas restrictivas en SELECT, UPDATE y DELETE (en INSERT basta la organización) en toda tabla con patient_id,
salvo audit.audit_log e iam.invitation; una prueba recorre el catálogo. Las notas AUTHOR_ONLY las ve solo su autor,
también frente a OWNER. El cupo (app.count_active_patients) y el documento repetido (app.patient_document_taken) se
consultan con funciones SECURITY DEFINER que solo devuelven un número o un sí/no de la organización; como ese sí/no
dice si alguien es paciente, cada coincidencia deja en la auditoría el intento, con el paciente y el actor.
Consecuencias: un profesional fuera del equipo recibe 404 y no puede esquivar el cupo. Las tablas nuevas con
patient_id usan el mismo helper en su migración.

## ADR-038 · StoragePort local y evidencia de consentimientos — aceptada (2026-10-09)
Contexto: el consentimiento en papel necesita su escaneo; P11 y P15 también guardan archivos.
Decisión: StoragePort con driver local en STORAGE_LOCAL_PATH (obligatoria fuera de local; en el servidor, el volumen
cifrado). Clave ORG/UUIDv7: el nombre original nunca va en la ruta ni en la base. El tipo se decide por bytes mágicos
(PDF, PNG, JPEG) y el parser multipart corta en 5 MB antes de leer más. Evidencia y consentimiento van en un solo
pedido: los bytes se escriben antes de la transacción y se descartan si esta falla. La descarga es solo por la API,
con la visibilidad del paciente, auditoría READ, Content-Disposition: attachment y nosniff. La evidencia de un
consentimiento nunca se borra.
Consecuencias: cambiar a S3 es otro adaptador del puerto. Los archivos de P11 y P15 usan FileRegistry.

## ADR-039 · Consentimiento informado provisional — aceptada (2026-10-09)
Contexto: RN-B01; los textos legales del abogado del cliente aún no llegan.
Decisión: textos de plataforma HEALTH_DATA y APP_ACCESS cargados por una migración de datos idempotente, versión
«0.1-provisional» con su sha256 y el aviso «Texto provisional, pendiente de revisión legal» donde se muestren. En
consulta se otorga con canal IN_PERSON_DIGITAL (profesional, IP, agente y versión del texto) o PAPER_SCANNED con
escaneo obligatorio. La población OBESITY es dato de salud: solo con HEALTH_DATA vigente. ConsentPolicy en la API
pública de clinical. ⚠️ Un menor de 18 no consiente desde la app: se registra en consulta con su padre, madre o tutor
hasta que el abogado lo defina. Pacientes solo ACTIVE o ARCHIVED en la versión 1.0 (INACTIVE serviría para esquivar el
cupo).
Consecuencias: los textos definitivos entran como versión nueva; los consentimientos dados quedan atados a su versión.

## ADR-040 · Acceso del paciente a la app: invitación, aceptación y sesión PATIENT — aceptada (2026-10-11)
Contexto: RN-A06, RN-B01 y RN-B02. iam gobierna cuentas, invitaciones y sesiones; clinical, pacientes y
consentimientos; iam no puede importar clinical (02 §4).
Decisión: la invitación del paciente es una fila de iam.invitation con patient_id y su propio plazo,
patient_invitation.ttl_days (1 a 30, 7 por defecto; N22 sigue abierta). Una pendiente por paciente: reenviar revoca la
anterior. En la versión 1.0 una cuenta se vincula a un solo paciente: un correo con cuenta, o con otra invitación
pendiente en la organización, es 409, también al aceptar si la cuenta apareció entretanto (staff, plataforma u otro
paciente); una invitación de staff tampoco pisa la pendiente de un paciente (409). Invita el equipo con WRITE, a un
paciente activo y sin cuenta; un menor de 14, solo si APP_ACCESS y HEALTH_DATA ya se registraron en consulta
(ADR-042). La página de aceptación se arma con app.patient_invitation_preview(token_hash), SECURITY DEFINER que
responde solo al hash exacto de una invitación PATIENT pendiente, y pide únicamente las finalidades que no están
vigentes, una casilla sin marcar por texto. Aceptar es una transacción con el rol ACCOUNT: marca la invitación, crea
la cuenta, vincula al paciente y registra los consentimientos con canal APP (IP, agente y versión del texto) por el
puerto PATIENT_ENROLLMENT, que define iam e implementa clinical (síncrono, sin ciclos), y abre la sesión PATIENT. Un
error de regla (RN-B01) vuelve como 422 y revierte todo. Todo enlace que ya no sirve responde 410 con el mismo code
(NC-IAM-040) y el mismo mensaje: vencido, usado, revocado, o con el paciente archivado o ya vinculado; así no revela
la causa. La sesión PATIENT resuelve su paciente en cada petición con app.patient_of_account(), SECURITY DEFINER sin
parámetros (solo app.user_id()): sin paciente activo con APP_ACCESS y HEALTH_DATA vigentes, deja de valer al instante
(401), y entrar responde 403 NC-IAM-046 (RN-B02) después de verificar la contraseña. El consumidor
iam.patient-sessions cierra sus sesiones al archivar o al revocar APP_ACCESS o HEALTH_DATA y lo audita como SYSTEM con
el paciente. El puerto es obligatorio (ADR-021: sin @Optional en application): la CLI create-platform-admin no carga
clinical y registra para él, y para ACTIVE_PATIENT_COUNTER, un adaptador explícito que falla si alguien lo usa.
Consecuencias: P13 usa la sesión PATIENT con el paciente que resuelve la sesión; el paciente nunca envía su id (02 §10).
Atender a la misma persona en dos organizaciones exige otro correo en la versión 1.0.

## ADR-041 · Expediente clínico v1 y consulta de auditoría — aceptada (2026-10-11)
Contexto: RF-06, RF-09, RF-10, RN-B01 y RN-B03; la ficha de anamnesis del cliente aún no llega.
Decisión: la historia clínica no se edita: cada guardado es una revisión nueva sobre expectedRevision (409 si alguien
guardó antes), con la ficha del paciente bloqueada hasta el fin de la transacción. Formulario ANAMNESIS v1 de texto
libre por bloque, con cirugías, y esquema estricto (⚠️ provisional). Condiciones y objetivos son filas propias, nunca
se extraen del texto; de ellas solo cambian el estado y las notas (UPDATE por columna). Una nota no se edita: se
enmienda con otra que cita una nota visible; AUTHOR_ONLY la ve solo su autor. Escribir el expediente exige ver al
paciente, que esté activo (archivado: 409), acceso WRITE en el equipo (OWNER fuera del equipo lee, pero no escribe lo
clínico) y HEALTH_DATA vigente (422 RN-B01). La ficha, el consentimiento y la invitación son tareas administrativas y
OWNER las hace aunque no esté en el equipo, salvo poner o quitar la población OBESITY, que es dato de salud (403). La
línea de tiempo une alta, consentimientos, revisiones, condiciones, objetivos y notas, de lo más reciente a lo más
antiguo, con cursor opaco por (fecha, id) y bajo la misma RLS. Toda lectura del expediente deja un READ (RN-B03), solo
si se ve al paciente. La consulta de auditoría vive en el módulo audit: GET /api/v1/audit-events, solo OWNER
(audit.read), rango de fechas obligatorio de 90 días como máximo para usar las particiones, filtros por paciente,
persona y acción, y cursor. Muestra el nombre de quien actuó (IamApi.displayNames) y el código del paciente
(ClinicalApi.patientCodes); nunca correos ni datos clínicos. La RLS deja ver solo la organización: los eventos sin
organización (LOGIN y LOGIN_FAILED) solo los ve la plataforma.
Consecuencias: los contextos que guarden datos de salud usan ClinicalApi.ensureHealthDataConsent. La ficha definitiva
de anamnesis entra como versión 2 del formulario, sin tocar las revisiones guardadas.

## ADR-042 · Consentimiento de menores: umbral de 14 años — aceptada (2026-10-12)
Contexto: RN-B01 y RN-A06 con pacientes niños y adolescentes; la ADR-039 dejaba a todo menor de 18 sin consentir desde
la app. El reglamento de la Ley 29733 deja consentir desde los 14 años con información comprensible para ellos.
Decisión (⚠️ hasta que el abogado lo defina): desde los 14 años el paciente consiente como un adulto, en consulta o
desde la app, y los textos tienen que estar en lenguaje claro. Un menor de 14 no consiente: en consulta solo vale
PAPER_SCANNED, firmado por su padre, madre o tutor, porque la tabla no guarda quién es el tutor (NC-CLI-026). No se le
invita a la app hasta que APP_ACCESS y HEALTH_DATA estén registradas así (NC-CLI-010); si al aceptar falta alguna, la
página no muestra casillas y explica que se registra en consulta, y la API rechaza las que lleguen (422). La edad se
calcula a la fecha local del paciente (CONSENT_AGE en el dominio de clinical).
Consecuencias: reemplaza el punto de menores de ADR-039. Si el abogado fija otra edad o exige registrar al tutor, se
cambia CONSENT_AGE o se agrega el tutor al consentimiento con una migración nueva.

## ADR-043 · Web del expediente y app del paciente con sesión — aceptada (2026-10-12)
Contexto: P6 (PR 3): el expediente en el panel, la auditoría del dueño y la aceptación del paciente; desde P6 existe la
sesión PATIENT (ADR-040).
Decisión: el expediente es un layout con pestañas (ficha, consentimientos, historia clínica, condiciones, objetivos y
notas, línea de tiempo); cada pestaña es una página de servidor que lee lo suyo, y el layout y la página comparten la
lectura de la ficha con cache() de React: un solo READ por petición. El buscador decide por lo escrito: con dígitos
busca el documento exacto por su índice ciego en todos los tipos (la API acepta el número sin tipo); sin dígitos, el
nombre sin tildes. La historia guarda sobre la revisión que se editó: ante un 409 el texto se conserva, se carga la
versión actual para compararla bloque por bloque y se guarda encima. La evidencia en papel se valida en el navegador
por sus primeros bytes y 5 MB antes de subirla, y otra vez en la API. /panel/auditoria aparece solo en el menú del
dueño; la API decide (403). /mi pide la cuenta en cada petición y solo deja pasar sesiones PATIENT; entrar lleva al
paciente a /mi/hoy. La palabra «Paciente» sale de la organización en títulos, botones y menú. La web nunca toca la
base, tampoco en sus pruebas: dependency-cruiser lo impide (web-no-database: ni pg ni Prisma). Que el documento se
guarde cifrado lo prueba la integración de la API; el E2E prueba la búsqueda y los 4 últimos dígitos, y sus pacientes
se preparan por la API, como en producción. STORAGE_LOCAL_PATH pasa a ser obligatoria y absoluta en todo entorno (un
directorio temporal en local y en CI): una ruta relativa dependía de dónde arrancaba el proceso y dejaba archivos
dentro del repositorio. Reemplaza «obligatoria fuera de local» de ADR-038.
Consecuencias: P13 construye la app del paciente sobre esa sesión. Las pruebas de /mi entran con un paciente creado por
la API. Quien use un .env local agrega STORAGE_LOCAL_PATH con una ruta absoluta.

## ADR-044 · Evaluación, cálculo y energía de P7: datos y contratos primero — aceptada (2026-10-13)
Contexto: P7 (Demo 1). Notion no lista los 43 sitios ISAK uno por uno ni sus rangos, no fija el nivel básico ni cómo
se agrupa el ETM, y 05.2 pide los macronutrientes NOT NULL en la prescripción energética aunque RF-18 sea de P9. Las
pantallas las hace Iván en paralelo (reemplazado en ADR-049: las hace Rodrigo).
Decisión:
- Catálogo como dato (ADR-014) en seeds/assessment/measurement-sites.json: 42 sitios de ISAK 2 (⚠️ el noveno diámetro
  espera la guía de acreditación ISAK 2023), 21 de ISAK 1, nivel básico con peso, talla, cintura y cadera, y los 3
  pliegues extra de Jackson y Pollock sin nivel. Códigos del motor (ADR-023). Rangos de rechazo (RN-C04) que dejan
  pasar desde un niño de 100 cm hasta un adulto con obesidad severa; ⚠️ los de perímetros, diámetros y longitudes son
  provisionales. La migración del catálogo se genera una sola vez desde el JSON y queda fija (db:seed no corre en
  producción); todo cambio posterior, como el noveno diámetro, va en una migración nueva que también actualiza el
  JSON, y una prueba de integración compara el catálogo de la base con el JSON.
- seeds/luis/luis.json guarda el caso Luis completo (dos evaluaciones ISAK 2, estudio de ETM de G-04, prescripción y
  valores esperados); lo usan la semilla, el E2E y las pantallas, y una prueba de contratos lo ata al motor.
- Los contratos de cada PR se publican antes que su API.
- ETM (RN-C05): estudio de repetibilidad del evaluador con pares por sitio (se guardan los pares) o ETM declarado por
  sitio. El CMD95 de un sitio usa su ETM; sobre la suma de 6 pliegues, el %ETM agrupado de esos sitios (TEM_ISAK
  sobre todos sus pares). No se traslada a % de grasa.
- Condiciones v1 (RN-C09, ⚠️): hora (de measuredAt), ayuno, actividad intensa en las 24 h previas e hidratación;
  difieren si cambia el evaluador, el ayuno o la actividad, o la hora del día se aleja más de 2 h.
- Bioimpedancia (RN-C08, ⚠️ N19): lista cerrada de 8 indicadores con las unidades de cada equipo y el nombre que les
  da el equipo; queda como lectura, sin series.
- Cálculo: edad decimal al medir; Rocha y Würch dentro de 4 componentes, cada masa con su método; interpretaciones con
  intervalos semiabiertos.
- Coeficiente de grupo de referencia de Lee (RN-D11): ajuste de la organización
  assessment.lee_reference_group_coefficient, de lista cerrada (0, −2 o 1.1) y sin valor por defecto. Ningún nombre
  del código, de la interfaz ni de los logs alude al dato sensible que la ficha no guarda (Ley 29733): el insumo del
  motor pasa a referenceGroupCoefficient (MUSCLE_LEE2000 1.1.0, motor 1.2.0, sin cambiar ningún número).
- RN-D09: cintura/talla y cintura/cadera se muestran con 2 decimales (con 1, 0.491 se vería 0.5, el umbral); los
  demás índices siguen con 1, como el SFR (RN-F07). La interpretación usa siempre el valor sin redondear.
- La prescripción energética incluye los macronutrientes (RN-E07, G-17): RF-18 se adelanta a P7 y P9 solo hace
  intercambios.
Consecuencias: lo que difiera de Notion va al /notion-sync del cierre de P7. Agregar el noveno diámetro es una
migración de datos; el cierre de una evaluación usa in_isak2 del catálogo, así que no se bloquea.

## ADR-045 · Evaluación de P7: tomas, cierre, enmienda, ETM y línea de tiempo — aceptada (2026-10-13)
Contexto: P7 (PR 1). La evaluación es el primer agregado de assessment y el primer contexto que guarda datos de
salud fuera de clinical.
Decisión:
- Escribir una evaluación exige lo mismo que el expediente: ver al paciente, acceso de escritura en su equipo, también
  frente al dueño, y HEALTH_DATA vigente. clinical lo expone como ClinicalApi.ensureRecordWritable, y
  ClinicalApi.patientRef da lo único que cruza (sexo, nacimiento, población, zona horaria y estado; 02 §3).
- Tomas: PUT por sitio con If-Match sobre la versión de la evaluación; se aceptan de a una (el protocolo recorre la
  serie y la repite). La tercera solo si las dos primeras superan la tolerancia (NC-ASM-005). El consolidado se guarda
  para consultas, pero la API y el cálculo lo recalculan desde las tomas con el motor: numeric(7,2) redondearía la
  media (RN-D09). Se aceptan sitios fuera del nivel; el nivel decide los métodos (PR 2).
- Cierre: sitios del nivel consolidados, ninguna tercera toma pendiente y, en BIA o mixta, una lectura. Enmienda:
  una revisión en borrador con motivo que copia encabezado, tomas y bioimpedancia; cada evaluación se enmienda una
  sola vez (índice único) y la original pasa a AMENDED cuando cierra su revisión. La restricción es por evaluación,
  no por cadena: la revisión vigente se vuelve a enmendar (original → revisión 2 → revisión 3).
- measurement y bia_reading no tienen patient_id: una política restrictiva las ata a la RLS de su evaluación, que sí
  tiene care_team_scope. El catálogo de sitios es de solo lectura para app_user y la API lo lee una vez por proceso.
- ETM: evaluator_error guarda los pares del estudio (columna pairs, solo en CALCULATED) y no se edita. Los pares son
  números del evaluador, sin patient_id: no son datos de salud. Lo registra el
  propio evaluador, el dueño o un administrador. El vigente de cada sitio es el de vigencia más reciente hasta hoy en
  la zona de la organización; el agrupado por familia sale de TEM_ISAK sobre los pares (los declarados no entran).
- Toda escritura emite su evento (assessment.evaluation.*, measurement.*, bia.*, technicalerror.recorded) y se audita
  desde él; leer una evaluación deja un READ.
- Línea de tiempo: clinical define TimelineSource y un registro; assessment se registra al iniciar y aporta sus
  evaluaciones cerradas (EVALUATION_CLOSED). clinical mezcla las páginas en el mismo orden que su SQL.
- atomically pasa de clinical a apps/api/src/platform/database: usa la UnitOfWork, y el shared-kernel solo guarda
  bloques de dominio sin dependencias (02 §5).
Consecuencias: nutrition y tracking sumarán sus hechos a la línea de tiempo de la misma forma. Las tres copias de
atomically en iam y backoffice quedan como deuda.

## ADR-046 · Cálculo de P7: plan de métodos, resultados inmutables, interpretación y comparación — aceptada (2026-10-13)
Contexto: P7 (PR 2). Al cerrar, el worker calcula la evaluación; los resultados no se recalculan en silencio (RN-D08)
y cada número lleva su método (RN-D02) y su interpretación con fuente (RN-D10).
Decisión:
- Plan (dominio): los métodos del nivel (RN-C01) y, según la población (RN-D05), todos los de pliegues y masas o solo
  los elegidos: niños, adolescentes y obesidad no tienen ninguno por defecto. Después, sitios y validez los decide el
  motor (RN-D04, RN-D06). 4 componentes usa la masa grasa del método principal de % de grasa; si no se calculó, queda
  «no disponible» por dependencia (NC-ASM-017).
- Principal por propósito: la preferencia del paciente, si no la de su organización para su población, si no la de
  la plataforma (METHODS_BY_POPULATION del motor). En músculo, si el preferido no se calculó, el primero de la
  plataforma que sí. El hueso de Rocha es el de 4 componentes.
- Guardar: con el mismo método, versión y hash no se crea nada. Si cambian, se crea un resultado nuevo y el anterior
  queda SUPERSEDED con superseded_by. Un método que deja de calcularse queda SUPERSEDED sin reemplazo. Si los insumos
  vuelven a ser los de un resultado reemplazado, ese vuelve a ser el vigente (la UNIQUE no admite otro igual).
- Indicadores: result_metric guarda cada número con su método; en 4 componentes la masa ósea es de Rocha y la
  residual de Würch. La masa grasa de 4 componentes no se guarda otra vez: es la del método de 2 componentes. Un
  indicador no se edita (REVOKE UPDATE). Las series (P14) tienen que unir con los resultados vigentes.
- Coeficiente de Lee (RN-D11): el del recálculo; si no, el que quedó en los insumos del Lee vigente; si no, el de la
  organización. Así la elección hecha en la evaluación se mantiene.
- Lo que se muestra: de una cerrada, sus vigentes; de una enmendada, el último de cada método; «calculando» mientras
  el worker no calcula. Al cerrar una revisión, los vigentes de la original pasan a SUPERSEDED, reemplazados por los
  del mismo método.
- Interpretación: rangos de assessment.reference_range (globales por migración; los de la organización ganan), con
  intervalos semiabiertos y sobre el valor sin redondear. ⚠️ Desde los 18 años. ⚠️ La cintura/talla no tiene fuente
  en la guía (los dos, resueltos en ADR-048). La cintura se interpreta como medida (OMS 2008), con el método de la
  consolidación.
- Comparación: con la evaluación cerrada vigente anterior, o la que se indique. CMD95 por sitio con el ETM del
  evaluador de la actual en su fecha; sobre la suma de 6 pliegues, con el %ETM agrupado de sus pares (G-04). Solo
  indicadores del mismo método (RN-D03).
- Preferencias: la organización (OWNER y ADMIN) por población; el paciente, su equipo con escritura. Cambiarlas no
  recalcula.
- Semilla: el caso Luis entra por SQL con sus eventos de cierre en el outbox; sus resultados los calcula el worker.
Consecuencias: RNF-04 se cumple con holgura (el cálculo completo es puro y lleva milisegundos). P14 arma la evolución
sobre result_metric unido a los resultados vigentes.

## ADR-047 · Prescripción energética de P7 y actividades — aceptada (2026-10-13)
Contexto: P7 (PR 3), RF-17 con RF-18 adelantado (ADR-044). 05.2 guarda la prescripción con métodos de TMR, pero cada
componente debe citar el suyo (02 §7) y ADR-029 pide las columnas del GET.
Decisión:
- nutrition.energy_prescription suma evaluation_id (la evaluación cerrada de la que salen peso, talla, edad y masa
  libre de grasa; sin FK), tee_method_code y tee_method_version (ADR-029) y components: el sobre del motor de cada
  componente (TMR, ejercicio, GET, objetivo, proyección y macronutrientes) con método, versión, insumos, hash, salidas
  y avisos. Las columnas numéricas guardan lo mismo redondeado para consultas; la API muestra los valores del sobre.
  No se edita (REVOKE UPDATE): una prescripción nueva reemplaza a la anterior.
- Composición: nutrition la pide con AssessmentApi.compositionBasis y la traduce a su BodyCompositionInput (02 §3):
  peso y talla consolidados, edad decimal al medir y la masa libre de grasa del método principal de % de grasa con su
  método y su resultado. Cunningham y Katch-McArdle sin esa masa no se calculan (NC-ENG-203).
- Objetivo (RN-E04): en kg de grasa por mes, o en kcal por día convertidas a kg por mes con 7700 kcal y 30 días, para
  mostrar el ritmo semanal con FAT_LOSS_7700. Fecha estimada: la fecha local del paciente más meses × 30 días, como
  estimación inicial (RN-E05).
- Actividades: exercise.physical_activity es del contexto exercise; un módulo exercise mínimo la expone por ExerciseApi
  y GET /physical-activities (búsqueda sin tildes). Semilla mínima por migración con códigos y MET oficiales del 2024
  Adult Compendium (12050, correr a 6–6.3 mph, 9.3 MET: G-15); catálogo de solo lectura para app_user. P8 carga el
  resto encima.
- La vista previa calcula lo mismo sin guardar. Leer la base o una prescripción deja un READ; crear una emite
  nutrition.prescription.created (auditada) y aparece en la línea de tiempo (ENERGY_PRESCRIBED).
Consecuencias: P9 toma las metas (kcal y macronutrientes) de la prescripción. Lo que difiere de 05.2 va al
/notion-sync del cierre.

## ADR-048 · Rangos versionados, aviso pediátrico y datos de la Demo 1 — aceptada (2026-10-13)
Contexto: P7 (PR 4). Las dos dudas de ADR-046 quedaron resueltas: los rangos rigen desde los 18 años y la cintura/talla
ya tiene fuente. RN-D10 pide rangos versionados con su fuente. El guion de la Demo 1 necesita una captura en vivo que no
cambie los números de Luis, y que la bioimpedancia de Luis se vea.
Decisión:
- Cintura/talla en una migración nueva. Las dos filas provisionales nunca llegaron a staging y salen. NICE, guía de
  obesidad (recomendaciones de 2022):
  - [0.4, 0.5): «Sin riesgo aumentado»;
  - [0.5, 0.6): «Riesgo aumentado»;
  - 0.6 o más: «Riesgo mayor».
  Las filas del umbral 0.5 citan también a Ashwell y Gibson (BMJ Open, 2016). Por debajo de 0.4 NICE no clasifica, así
  que no hay interpretación. NICE la usa con IMC menor que 35; la tabla no expresa esa condición (ADR-049).
- Versiones (RN-D10): valid_from marca la versión. Para cada indicador y alcance (plataforma u organización) rige la
  versión más reciente que no pase de la fecha local de la evaluación, no la de hoy. Así una versión nueva no cambia la
  interpretación de lo ya medido, como pasa con las listas de RN-E11, y una ficha regenerada dice lo mismo (RN-H02).
  - Una versión trae todas las filas de su indicador.
  - Lo de una organización rige desde su fecha.
  - Antes de la primera versión de la plataforma rige esa primera: no hubo otra.
- Menores (RN-D05): si todos los rangos de un indicador empiezan después de la edad del paciente (hoy, 18 años), el
  valor se muestra con su método, sin interpretación y con el aviso «Sin interpretación pediátrica en la versión
  1.0». El aviso va en `interpretationNote` del indicador y de `siteInterpretations`, cuya `interpretation` puede ser
  null. La edad de corte sale de los rangos, no del código.
- Bioimpedancia (RN-C08): una evaluación solo de bioimpedancia no tiene sitios. Por eso la comparación por defecto es
  con la anterior con antropometría, y la base de energía es la última cerrada con peso y talla.
- Datos de la Demo 1:
  - la evaluación actual de Luis pasa a mixta, con una lectura de bioimpedancia sintética («Marca Demo · BIA-200»);
  - su alta, su consentimiento y su historia van 35 días antes, antes de cualquier dato de salud (RN-B01);
  - Ana (seeds/ana/ana.json) es adulta, con consentimiento e historia y sin evaluaciones. El guion la mide en vivo con
    un tríceps extra para G-01 a G-03 y una enmienda del peso.
- La auditoría de la web traduce los recursos de P7: evaluación, medidas, resultados, bioimpedancia, ETM, métodos y
  energía.
- Guion en docs/demos/demo-1.md, ensayado contra la API sobre una base nueva.
Consecuencias:
- Cargar una tabla nueva es una migración con otra valid_from y todas sus filas.
- Las fichas (P11) y la evolución (P14) interpretan con la fecha de cada evaluación.
- RN-D09 no fija los decimales del ETM, del CMD95, de los meses hasta la meta ni de la superficie corporal: los fija
  ADR-049.

## ADR-049 · Decisiones abiertas de la Demo 1 y pantallas de P7 — aceptada (2026-10-15)
Contexto: el PR 4 de P7 dejó cinco preguntas abiertas, y Rodrigo pidió resolverlas con criterio técnico. Rodrigo
asume también las fases y las partes que Notion asigna a Iván: las pantallas de P7 no se esperan de otra persona.
Decisión:
- Rangos (RN-D10): rige la versión vigente en la fecha local de la evaluación, como dice ADR-048. Con la de hoy, una
  tabla nueva cambiaría lo ya medido y una ficha regenerada no diría lo mismo (RN-H02).
- Cintura/talla por debajo de 0.4: el valor se muestra con su método y sin interpretación. NICE no clasifica esa
  franja; extender «Sin riesgo aumentado» hacia abajo sería inventar un punto de corte.
- Condición de NICE (IMC menor que 35): la versión 1.0 interpreta la cintura/talla con cualquier IMC y no agrega
  aviso. Con IMC de 35 o más, el IMC ya trae su propia interpretación (OMS); el aviso exigiría un punto de corte en el
  código (RN-D10 lo prohíbe) o una columna nueva en reference_range. Queda como limitación conocida.
- Decimales que RN-D09 no fija:
  - ETM, %ETM y CMD95 con 2: son décimas de milímetro y con 1 decimal se pierden (0.374 mm se vería 0.4 y el CMD95
    de un pliegue, 0.8 en vez de 0.78);
  - superficie corporal con 2, como se usa en clínica: 1.8599 m² se ve 1.86;
  - meses hasta la meta con 1: es una estimación inicial (RN-E05) y la fecha estimada da el detalle.
- La E2E de la Demo 1 crea su propio Luis en una organización propia, con los datos de seeds/luis/luis.json: alta,
  consentimiento, historia, evaluaciones ISAK 2, cierre, resultados y energía, como pide el criterio de P7. No
  depende de la semilla de la demo.
- Las pantallas de P7 (captura, resultados, comparación, ETM, preferencias de métodos y energía) van en el PR 5.
Consecuencias: el /notion-sync del cierre de P7 suma esos decimales a RN-D09 y cambia en Notion el responsable de
las fases de Iván. La condición de IMC de NICE se revisa si quien valida los cálculos clínicos pide el aviso.

## ADR-050 · Pantallas de P7 y lectura por lotes de las colas del worker — aceptada (2026-10-15)
Contexto: P7 (PR 5). Faltaban las pantallas de RF-11 a RF-18 y la E2E de la Demo 1. Al correrla, la auditoría de las
escrituras de una evaluación tardaba minutos: el worker leía cada cola de a un evento cada 2 s.
Decisión:
- Dónde vive cada cosa:
  - pestañas «Evaluaciones» y «Energía» en el expediente;
  - la evaluación en borrador muestra la captura; cerrada o enmendada, sus resultados; la comparación tiene su página;
  - el ETM propio, en «Mi cuenta»; los métodos por población y el coeficiente de Lee, en «Ajustes»; los métodos de
    un paciente, en su pestaña «Evaluaciones».
- Captura (RF-11): cada sitio se guarda al salir del campo o con Enter, y las escrituras van en fila con la versión
  de la anterior en If-Match. Enter avanza por series, como el protocolo ISAK, o por sitio. La vista previa usa
  CONSOLIDATE_ISAK del motor para avisar la tercera toma en vivo; decide la API.
- Resultados: cada indicador lleva su MethodBadge, también dentro de una tarjeta de método (RN-D02), y la E2E lo
  comprueba. Mientras el worker calcula, «Calculando los resultados…» y se vuelve a consultar cada 2 s.
- Energía: la vista previa la calcula la API, que tiene la base y los métodos, y se pide al dejar de escribir. No se
  guarda sin una vista previa al día. La cantidad del ajuste se escribe en positivo y el signo sale de la opción.
- Los decimales de ADR-049 son clases de formatNumber: measurementError, bodySurface y months.
- Las tablas que pueden desbordar en el celular van en TableScroll, una región con nombre que se puede enfocar
  (WCAG 2.1.1).
- Worker: cada consumidor lee hasta 50 eventos por vez y sigue sin pausa mientras los lotes lleguen llenos
  (CONSUMER_WORK_OPTIONS). Si un evento falla, se reintenta el lote; los ya procesados no se repiten
  (processed_event).
Consecuencias:
- La auditoría de las escrituras llega en segundos (RN-B03).
- Registrar el ETM de otro miembro, que la API permite al dueño y a los administradores, no tiene pantalla todavía.

## ADR-051 · Rediseño «Instrumento», animaciones y escala de referencia — aceptada (2026-10-18)
Contexto: a Rodrigo no le convencía la interfaz de P3: el aspecto por defecto de shadcn (Inter, verde azulado sobre
blanco) y resultados sin jerarquía. Pidió animaciones reutilizables en lo que debe llamar la atención y un fondo
animado. De tres direcciones en una vista previa eligió «Instrumento» con fondo de curvas de nivel.
Decisión:
- Dirección «Instrumento»: la interfaz como un instrumento de medición.
  - Papel claro (#f3f5f4) con tarjetas blancas y líneas finas.
  - Tinta azul pizarra y un riel oscuro teñido con la marca de la organización.
  - Un amarillo de cinta métrica (--signal) solo para marcadores.
  - Radios por jerarquía: 8 px los controles, 12 px las tarjetas y 16 px las zonas destacadas.
- Tipografía: Archivo, autoalojada con next/font, en lugar de Inter. Es una sola familia con eje de ancho:
  - los títulos se ensanchan;
  - las etiquetas pequeñas se estrechan (font-label);
  - trae cifras tabulares.
- La marca sigue siendo solo --brand-* (ADR-027). El texto y los bordes de marca se oscurecen contra el papel (PAPER)
  y no contra el blanco, así cumplen AA sobre ambos.
- Animaciones solo con CSS (sin Motion ni GSAP, que cambiarían el stack de Notion):
  - todas parten de un estado inicial y terminan en el estilo normal del elemento;
  - con «reducir movimiento» o sin animación queda el valor final;
  - solo transform y opacity;
  - una sola entrada escalonada por pantalla (nc-enter con enterStyle);
  - marcador de regla, crecimiento de barras, brillo del botón principal (attention) y pulso de dos latidos para un
    aviso nuevo.
- Fondo de curvas de nivel (ContourBackground) en las zonas destacadas: entrar, inicio del panel y cabecera de Hoy.
  - Las curvas se dibujan en el navegador: no pesan en el HTML ni retrasan la primera pintura.
  - Se pausa con su botón (WCAG 2.2.2), fuera de la vista y con la pestaña oculta. La preferencia de pausa queda en
    el navegador.
  - En la franja de índices de los resultados va quieto, como textura.
- Las cifras nunca cuentan desde cero: el número sale exacto y lo que se mueve es el indicador. Así lo que se lee, se
  captura o se prueba es siempre el valor real.
- Escala de referencia (RN-D10): los resultados traen, por indicador con rangos, la tabla completa que interpreta el
  valor (referenceScale).
  - Es la tabla de la banda que contiene el valor o, si cae en un hueco, la más específica que aplica al paciente.
  - La web solo la dibuja (ReferenceRuler) y nunca guarda puntos de corte en el código.
  - La geometría (extremos abiertos con aire, marcas a paso redondo, rótulos que no se pisan) es solo presentación.
- La barra de composición de Kerr no muestra cifras: las masas se leen debajo, cada una con su método (RN-D02).
- «Inicio» del riel solo queda activo en /panel (antes lo estaba en todas las secciones).
Consecuencias:
- Cambiar el primario de la organización tiñe el riel, las zonas destacadas, los botones y la marca de la sección
  activa (RN-H03).
- El contrato de resultados suma referenceScale (null sin rangos para el indicador o el paciente, RN-D05).
- Las herramientas de diseño (frontend-design, ui-ux-pro-max, ui-skills y los MCP de shadcn, Context7 y Playwright)
  quedan en el usuario de Claude Code, no en el repositorio: .mcp.json y .claude/settings.json siguen idénticos a
  Notion.

## ADR-052 · Datos maestros: importador de catálogos, TPCA 2017 y Compendium 2024 — aceptada (2026-10-20)
Contexto: P8 pide catálogos con fuente y versión, cargados por un importador confiable y buscables (RF-38, RN-I01 a
RN-I04). La TPCA 2017 prohíbe reproducirla sin autorización del INS; el Compendium 2024 permite el uso comercial si se
lo cita y no se cambian sus MET. Rodrigo decidió (2026-10-20):
- usar la TPCA mientras se tramita la autorización;
- no cargar su grupo S, de preparaciones;
- cargar 7 encabezados del Compendium;
- preparar la captura por foto sin construir la parte de visión.
Decisión:
- Importador genérico en platform/import:
  - CSV RFC 4180 propio;
  - cada archivo es un lote de platform.import_batch con su hash SHA-256, sus conteos y los primeros 100 errores por
    fila;
  - cada módulo aporta su tipo (CatalogImport: columnas, validación por fila, clave y guardado con upserts) y lo
    registra al iniciar en ImportRegistry, como los trabajos del worker.
- Un lote es una transacción de SYSTEM con un candado por organización y tipo:
  - el mismo archivo ya aplicado deja un lote DUPLICATE y no toca los datos; el índice único import_batch_once lo
    garantiza en la base;
  - una fila mala no detiene a las demás (COMPLETED_WITH_ERRORS); sin filas válidas, FAILED;
  - si guardar falla, se revierte todo y otra transacción deja el lote FAILED.
- CLI catalog:import y catalog:load:
  - corre como app_user con el rol SYSTEM y registra como responsable (started_by) a un PLATFORM_ADMIN activo, buscado
    por su correo;
  - no depende de db:seed: los catálogos existen en todo entorno, también en producción.
- Lo global sin organization_id lo escribe solo SYSTEM:
  - app.enable_global_rls (todos leen; solo SYSTEM inserta y actualiza) en exercise.physical_activity y food.source;
  - fuentes, nutrientes, grupos y la lista DEMO llegan por migración, y app_user pierde INSERT y UPDATE sobre ellos,
    salvo food.source.imported_at.
- TPCA 2017, 928 alimentos de 14 grupos:
  - CARTBEQ por el <CARTBQ> de la tabla y FOL para «Ácido fólico», que no trae identificador;
  - «sin dato» queda NULL con MISSING, las trazas 0 con TRACE y los valores de un alimento imputado con IMPUTED, con
    la tabla de origen como etiqueta;
  - la tabla no trae parte comestible: queda en 100 % hasta la TAFERA;
  - el estado sale del nombre oficial: COOKED si nombra una cocción (cocido, sancochado, frito, asado, hervido,
    horneado, guisado, tostado, precocido) y si no RAW, «crudo o tal como se compra». PROCESSED y READY quedan para
    los alimentos propios y las preparaciones (aprobado por Rodrigo, 2026-10-20);
  - sin alias derivados del nombre: «pilado o pulido» daría alias falsos, y la búsqueda ya cubre las palabras del
    nombre (aprobado por Rodrigo, 2026-10-20).
- Los CSV de seeds/ son la publicación tal cual, más la traducción del Compendium; las derivaciones viven en el código,
  con pruebas. Como el mismo archivo no se vuelve a aplicar, una regla de derivación nueva llega con el siguiente
  archivo o con una migración de datos.
- Las diferencias de la propia fuente se conservan tal cual, y seeds/README.md las lista (criterio delegado por
  Rodrigo, 2026-10-20). Son los kJ de la TPCA que no son kcal × 4.184, la linaza con 0 g de carbohidratos y las
  equivalencias propias del Compendium que no son exactas. Corregirlas haría que la aplicación no coincida con la
  publicación que consulta el profesional, y en algunas no se sabe cuál de los dos números es el bueno. Los cálculos
  usan las kcal y el MET, que no tienen diferencias, y la descripción oficial queda junto a la traducción.
- Compendium 2024, 560 actividades de 7 encabezados:
  - código, MET y descripción oficial en inglés (columna nueva description_en), y traducción propia;
  - el extractor verifica la traducción: conserva todos los números del original y cada equivalencia entre paréntesis
    (km/h, min/km, kg, cm, m/min) es la conversión exacta;
  - las 9 de P7 conservan código y MET; su descripción pasa a la traducción nueva.
- Lista de intercambio DEMO del motor en food.exchange_list, con la columna nueva provisional en true (riesgo R4) y
  sus 6 grupos, con kcal por Atwater como las calcula el motor.
- Captura por foto: sin IA en el producto (regla 10). Un modelo propio, como una CNN, también cuenta como IA, así que
  la visión espera un acuerdo con Jeremy. P8 deja lo que no depende de ella: el estado de cada alimento y, en sus
  próximos PR, resolver un término a candidatos (FoodApi.resolve) y la composición de un plato.
Consecuencias:
- 05.2 y 05.3 de Notion: provisional en exchange_list; file_name y los estados en import_batch; description_en y la
  RLS en physical_activity; la RLS en food.source (/notion-sync al cerrar P8).
- La E2E de la Demo 1 corre con los catálogos cargados, y su guion los carga en «Antes de empezar». La actividad de
  Luis se busca por su descripción nueva.
- Riesgo nuevo, como R4: la licencia de la TPCA. Si el INS no la autoriza, el plan B es USDA FoodData Central, de
  dominio público (decisión de Rodrigo, 2026-10-20).

## ADR-053 · TAFERA 2016: medidas caseras y factores de cocción enlazados con la TPCA 2017 — aceptada (2026-10-21)
Contexto: P8 pide medidas caseras por alimento (RF-38). La TAFERA 2016 del INS-CENAN trae 1027 medidas con peso bruto
y neto y % comestible (módulo I) y 228 factores de conversión de peso cocido a crudo (módulo II), y autoriza
reproducirla citando la fuente. Sus nutrientes son los de la TPCA 2009 y no trae los códigos de la TPCA.
Decisión:
- Extractor scripts/catalogs/extract-tafera.ts, que lee cada palabra con su posición:
  - una forma de un alimento son sus filas con el mismo perfil de nutrientes por 100 g, aunque se alternen fila por
    fila (con y sin cáscara);
  - el nombre de cada fila sale de los bloques centrados en sus filas, sin letras voladas ni símbolos de nota; «*»
    marca datos de 1985 (columna datos_1985);
  - el peso bruto, con el % comestible publicado, es el candidato que lo reproduce (±5 puntos); en los cortes de cuy y
    pollo, el peso con pellejo (nota «d»). Si ninguno lo reproduce, queda vacío;
  - las formas que las notas explican llevan su nombre: almeja con y sin bolsa digestiva, camarón entero o solo la
    cola, trucha entera o filete, tomate sin cáscara.
- Enlace con la TPCA 2017 por forma y nombre:
  - automático si el perfil casi coincide y se distingue del segundo, o si el nombre se parece y el perfil está cerca;
  - lo demás, a mano en LINKS y FACTOR_LINKS, cada decisión con su motivo en el código;
  - criterio: el mismo alimento, en el mismo estado y forma. Si la TPCA 2017 no lo tiene, el de la variedad o el corte
    con que la TAFERA calculó (manzanas, cortes de cuy y pollo). Si la TAFERA usó otro alimento (corazón de conejo
    calculado como el de pollo) o no hay equivalente, no se carga;
  - cuando el nombre y el perfil discrepan, manda el nombre: la cebolla de cabeza va a «Cebolla de cabeza» aunque su
    perfil sea el de la perilla, y la uva blanca a «Uva blanca».
- Resultado: 933 de las 983 medidas con nutrientes, de 194 alimentos, y 213 de los 228 factores, de 126. No se cargan
  las 44 filas sin nutrientes (formas que la tabla no calcula) ni 50 medidas y 15 factores sin equivalente.
- La medida se muestra con su unidad; si un alimento de la TPCA recibe medidas de varios de la TAFERA (fideos, cortes
  de pollo), con el de la TAFERA entre paréntesis.
- food.household_measure: grams es el peso neto, la parte comestible (RN-E12). Columnas nuevas gross_grams,
  source_code y source_measure_code, con índice único por fuente y código y la regla bruto ≥ neto.
- food.cooking_factor nueva: peso crudo = peso cocido × factor, para el alimento crudo de la TPCA, con la RLS de
  catálogo (RN-I01).
- food.edible_portion_pct de la TPCA queda en 100, no lo llena la TAFERA: su % es de cada medida y de su unidad de
  compra (un ala con hueso, una naranja con cáscara), no del alimento de la TPCA (pollo, carne pulpa). El bruto de cada
  medida cubre el peso de compra.
- Importadores TAFERA_MEASURES y TAFERA_COOKING_FACTORS en food. Fallan enteros si falta un alimento de la TPCA, y
  catalog:load los carga después de ella.
- Diferencias de la fuente que se conservan, listadas en seeds/README.md: el código 11-91 repetido (la segunda fila es
  la 11-92, que falta), medidas con el mismo nombre y pesos distintos y cuatro % comestibles que difieren 3 a 5 puntos
  de sus pesos.
Consecuencias:
- 05.2 de Notion: household_measure y cooking_factor (/notion-sync al cerrar P8).
- Los enlaces dependen de la TPCA 2017, cuya licencia está pendiente: con el plan B (USDA FoodData Central) se rehacen.
- Si llega la TPCA 2009, sus códigos permitirían verificar los enlaces por perfil.

## ADR-054 · Búsqueda de alimentos, alimentos propios y composición de un plato — aceptada (2026-10-22)
Contexto: P8 pide buscar alimentos sin tildes en menos de 100 ms con el catálogo completo y que cada organización cree
los suyos (RN-I01). El plan aprobado de P8 adelanta además la composición de un plato (RF-20) y FoodApi.resolve, que
usarán el registro a mano (P13) y, si se contrata, la captura por foto.
Decisión:
- Búsqueda sobre food.food.search_text, sin tildes ni mayúsculas, con pg_trgm:
  - entra el alimento que tiene todas las palabras del término, en cualquier orden, o que se le parece palabra por
    palabra (umbral 0.6 de pg_trgm);
  - el orden: primero los que empiezan con el término, después los que lo contienen entero, los del estado pedido, los
    más parecidos y los de nombre más corto;
  - con la TPCA cargada tarda unos 4 ms.
- Las actividades del Compendium siguen la misma regla, con las que contienen el término entero primero: «correr a 6»
  sigue dando la actividad de la Demo 1 entre las primeras.
- FoodApi en la API pública de food:
  - search;
  - resolve: candidatos con su parecido de 0 a 1; si el término dice el estado («arroz cocido», «pescado crudo»), los
    de ese estado van primero;
  - foodsById y compose.
- Composición de un plato: POST /foods/composition, sin guardar nada.
  - Usa el método RECIPE_NUTRIENTS del motor como una receta de una porción, con su versión y el hash de los insumos
    (RN-D01).
  - Cada ingrediente va en gramos de parte comestible o como medida casera por cantidad (RN-E12).
  - Un total es «sin dato» si le falta a alguno de sus alimentos (RN-I03), y lleva el aviso de que la 1.0 no aplica
    factores de retención.
  - Como solo calcula, vale con la organización en solo lectura.
- Alimentos propios:
  - fuente ORG con un código correlativo por organización (platform.counter «food»);
  - guardan todos los nutrientes del catálogo, y lo que no se envía queda MISSING;
  - se rechaza lo que no cabe en 100 g: un nutriente sobre su máximo, o proteínas, grasa y carbohidratos que sumen más
    de 100 g, con 1 g de margen por el redondeo de una etiqueta. También un alimento sin ningún nutriente y dos medidas
    con el mismo nombre;
  - se editan con If-Match (columna nueva food.food.version) y editar reemplaza sus medidas. La política de borrado
    nueva de household_measure solo alcanza a las de la propia organización;
  - los eventos food.food.created y food.food.updated se auditan (RN-B03).
- Permisos nuevos catalog.read y catalog.write para dueño, administrador y profesional. La búsqueda de actividades pasa
  a catalog.read.
Consecuencias:
- Notion: 05.2 (food.food.version y la política de borrado de las medidas), 02 (FoodApi) y 04 (RF-20 adelantado en
  parte). Van en el /notion-sync al cerrar P8.
- El PR 4 hace las pantallas: Biblioteca, alimento propio, «Armar un plato» y el buscador de actividades.

## ADR-055 · Uso de la TPCA 2017 sin autorización expresa del INS — aceptada (2026-10-22)
Contexto: la TPCA 2017 dice «Prohibida la reproducción total o parcial de esta obra por cualquier medio sin
autorización del Instituto Nacional de Salud». ADR-052 la cargó mientras se tramitaba esa autorización, con USDA
FoodData Central como plan B. Rodrigo lo revisó con un abogado y autorizó un camino que no la necesita.
Decisión (Rodrigo, 2026-10-22, tras consultar con un abogado):
- La API pública no devuelve el código del alimento en su fuente (sourceFoodCode). Queda dentro del sistema: en los
  CSV de seeds/, en la base y en los enlaces de la TAFERA. Los 14 grupos y los nombres de los alimentos no cambian.
- Ningún texto de la app llama «oficiales» a las tablas: el error NC-FOOD-003 dice «Los alimentos de referencia no se
  editan».
- La app cita sus fuentes en «Acerca de» o en los Términos y Condiciones. La línea llega con el PR de pantallas de P8
  y nombra solo las fuentes que de verdad se cargan: TPCA y TAFERA (INS/CENAN) y el Compendium 2024.
- Ningún logo del INS, MINSA ni CENAN, y ninguna frase de aval o patrocinio del Estado: es un desarrollo independiente
  que toma fuentes públicas.
Consecuencias:
- Deja de ser necesaria la autorización del INS y el plan B de USDA FoodData Central queda sin uso.
- food.source.license de TPCA_2017 todavía dice «Autorización pendiente» y el detalle del alimento lo devuelve: se
  actualiza con una migración de datos cuando se decida el texto.
- Notion: el riesgo de la licencia y RN-I02 (/notion-sync al cerrar P8).

## ADR-056 · Pantallas de la Biblioteca, «Acerca de» y la licencia de la TPCA fuera de la API — aceptada (2026-10-22)
Contexto: el PR 4 de P8 hace las pantallas del plan aprobado (Biblioteca, alimento propio, «Armar un plato» y el
buscador de actividades) y cumple la condición 3 de ADR-055. Rodrigo aprobó (2026-10-22) limpiar el texto de la
licencia en la base y dejar de devolverla en el detalle del alimento («opción B»), y aclaró que la atribución basta con
que aparezca una vez, en los Términos o en «Acerca de».
Decisión:
- Licencia:
  - la migración 202610220100_food_source_license cambia food.source.license de TPCA_2017 a «Uso referencial, con
    atribución de la fuente en la app (ADR-055)»;
  - GET /foods/:id devuelve la fuente con su código, nombre y edición, sin la licencia. La base la conserva (RN-I02).
- «Acerca de» en /acerca, pública, es el único lugar con la atribución:
  - nombra la TPCA 2017 y la TAFERA 2016 (INS/CENAN) y el Compendium 2024 con su cita;
  - dice que ninguna entidad del Estado avala ni patrocina la app, sin logos;
  - se llega desde el riel del panel, desde «Más» en la app del paciente y desde la pantalla de entrada.
  Todavía no hay página de Términos: sus textos los revisa el abogado del cliente.
- Biblioteca en /panel/biblioteca, con cuatro pestañas:
  - Alimentos: búsqueda mientras se escribe (los 50 primeros), que queda en la dirección (?q=) para volver atrás. El
    detalle muestra la fuente y su edición, los nutrientes por 100 g de parte comestible en dos tablas (energía y
    macronutrientes; otros nutrientes), «sin dato» en cursiva, la calidad del valor (trazas, imputado, calculado), las
    medidas caseras con su peso neto y bruto y los factores de cocción. Un alimento de referencia no muestra «Editar».
  - Alimento propio: formulario con los nutrientes del catálogo (GET /foods/nutrients, nuevo), la parte comestible y
    las medidas; lo vacío queda «sin dato». FormError lista los problemas que la API detalla (details.problems de
    NC-FOOD-001).
  - Armar un plato: cada alimento en gramos o en una medida casera por su cantidad. La composición la calcula
    POST /foods/composition mientras se escribe, con su método (RN-D02), el peso del plato y los gramos que equivale
    cada medida. No guarda nada.
  - Actividades: el mismo buscador que la prescripción energética, que muestra de 10 en 10 las 50 que da la API.
  - Listas de intercambio: GET /exchange-lists (nuevo, en food, con catalog.read) devuelve las publicadas con sus
    grupos. La DEMO lleva la marca «Provisional» y su nota (riesgo R4).
- Decimales:
  - el detalle de un alimento muestra cada valor por 100 g con los decimales con que la TPCA publica ese nutriente:
    es un dato de la fuente, no un resultado. kcal, kJ, calcio, fósforo, carotenos, vitamina A, folato, sodio y potasio
    van enteros; zinc, hierro, tiamina, riboflavina, niacina y vitamina C con 2 decimales; el resto con 1;
  - los totales de un plato siguen RN-D09 (kcal y gramos enteros). Los mg y µg, que RN-D09 no fija, van con los
    decimales de su fuente.
Consecuencias:
- ADR-055 queda cumplido entero.
- Notion (/notion-sync al cerrar P8):
  - 02: las rutas GET /foods/nutrients y GET /exchange-lists de food;
  - 03, RN-D09: los valores del catálogo por 100 g se muestran como los publica su fuente.

## ADR-057 · Dieta por intercambios: borrador con metas exactas, ajustes a mano e inmutabilidad en la base — aceptada (2026-10-22)
Contexto: P9 pide el agregado NutritionPlan por intercambios (RF-19, RF-23, RN-E08 a RN-E15) en tres PR: borrador,
publicación con tracking y pantallas. Rodrigo aprobó el plan y decidió (2026-10-22):
- hacer antes el PR 4 de P8;
- la porción de cada alimento permitido la escribe el profesional, y la app sugiere los gramos que aportan el
  macronutriente que define al grupo: carbohidratos en verduras, frutas y almidones, proteína en lácteos y carnes, y
  grasa en grasas. Con la lista DEMO son 5, 15, 8, 15, 7 y 5 g. Los gramos son lo que aporta un intercambio de la lista
  ÷ ese macronutriente por 100 g del alimento × 100;
- como ayuda para la hidratación (RN-E13), las ingestas adecuadas de agua total de EFSA 2010 (2.0 L mujeres, 2.5 L
  hombres) e IOM 2004 (2.7 L y 3.7 L), sin valor por defecto;
- el plan vale desde el día de su publicación, en la fecha local del paciente, sin fechas futuras en la 1.0;
- publicar se bloquea si un grupo con intercambios en un tiempo de comida no tiene ningún alimento permitido;
- la lista DEMO, provisional, mientras siga pendiente R4.
Decisión (PR 1, el borrador):
- POST /patients/:id/nutrition-plans crea un borrador desde una prescripción del paciente y una lista con los seis
  grupos del método clásico. Empieza sin grupos fijos, con los tiempos de G-19 (que se cambian), sin alimentos ni
  hidratación. PUT /nutrition-plans/:id con If-Match reemplaza el borrador entero; GET lee uno o el historial.
- Metas exactas: las del sobre MACROS de la prescripción (targetKcal de sus insumos y los gramos de sus salidas). Las
  columnas target_* las guardan redondeadas a 1 decimal solo para listar: con 51.0 g de grasa, G-18 daría 103.9 % en
  vez de 104.0 %.
- Intercambios (RN-E08): verduras, frutas y lácteos los escribe el profesional. Almidones, carnes y grasas salen de
  EXCHANGES_CLASSIC, salvo el ajuste a mano, que queda en plan_exchange.is_manual. La respuesta trae también lo que
  daba el método.
- Reparto (RN-E09): MEAL_SPLIT_LARGEST_REMAINDER por grupo, con los porcentajes de los tiempos, que suman 100 contados
  en centésimas. El profesional puede repartir a mano un grupo entero (splitOverrides), y ese reparto debe sumar el
  total del día; queda en la columna nueva plan_meal_exchange.is_manual.
- Adecuación (RN-E10): ADEQUACY de las kcal y de cada macronutriente contra las metas exactas, con el rango de la
  organización en dos ajustes nuevos: nutrition.adequacy_min_pct (de 50 a 100; 90 por defecto) y
  nutrition.adequacy_max_pct (de 100 a 150; 110).
- Alimentos permitidos (RN-G05): solo en un grupo con intercambios en ese tiempo, sin repetirse en el mismo grupo,
  visibles para la organización (RN-I01), con gramos y el texto de la medida casera. La columna nueva
  plan_meal_allowed_food.position conserva el orden en que se listaron.
- El borrador se guarda como lo escribió el profesional y se recalcula al leerlo, porque el cálculo es determinista.
  Lo publicado se leerá de su snapshot (PR 2). publishProblems dice lo que falta para publicar.
- La base protege lo publicado (migración 202610230000_nutrition_plans):
  - el disparador guard_plan_children deja insertar, cambiar o borrar en los cinco hijos del plan solo mientras el
    plan está en DRAFT; el borrado en cascada de un tiempo de comida pasa, porque su propio disparador ya lo exigió;
  - fuera de borrador, el plan exige snapshot, su versión de esquema, su hash, published_at, published_by y valid_from;
  - un solo borrador por lineage, share_pct entre 0 y 100, gramos mayores que 0 y una posición única por tiempo.
- Errores NC-NUT-006 a NC-NUT-011; editar un plan publicado responde 409 con RN-E15. Los eventos
  nutrition.plan.created y nutrition.plan.updated se auditan, este con las partes que cambiaron.
- FoodApi.exchangeList(id) da una lista por su id en cualquier estado: un plan sigue con la versión que usó (RN-E11).
Consecuencias:
- PR 2: publicar con snapshot y valid_from, el plan anterior a SUPERSEDED, versiones nuevas desde un publicado y el
  consumidor de tracking. PR 3: pantallas, la sugerencia de gramos y las referencias de hidratación.
- Notion al cerrar P9: 05.2 (columnas, índices y disparador), 02 (eventos del plan y FoodApi.exchangeList), 03 (RN-E10
  con los ajustes de la organización) y los ajustes nuevos de tenancy.

## ADR-058 · Publicar un plan: snapshot con hash, versiones nuevas y la copia del plan vigente en tracking — aceptada (2026-10-22)
Contexto: el PR 2 de P9 publica el plan por intercambios (RF-23, RN-E14, RN-E15) y deja lista la app del paciente para
leerlo: tracking guarda una copia del plan vigente y la meta de cada día (02 §3, RN-G03). Sigue las decisiones de
ADR-057.
Decisión:
- POST /nutrition-plans/:id/publish con If-Match:
  - sin hidratación, o sin un alimento permitido por grupo con intercambios en cada tiempo, responde 422 NC-NUT-012
    con cada problema (RN-E13, RN-G05);
  - el plan publicado del paciente pasa a SUPERSEDED y el borrador a PUBLISHED, en la misma transacción. El
    disparador del plan solo deja cambiar su estado, así que el anterior no lleva valid_to: lo termina el valid_from
    del que lo reemplaza;
  - valid_from es el día de la publicación en la fecha local del paciente (ADR-057).
- Snapshot, versión de esquema 1. Tiene:
  - el plan entero: metas exactas, la lista con su versión y sus grupos, los intercambios con lo que daba el método,
    el reparto, los alimentos permitidos con su nombre y sus nutrientes principales por 100 g, totales y adecuación
    con su rango;
  - cada método (RN-D01) y la versión del motor;
  - valid_from, quién y cuándo publicó.
  Su hash es el SHA-256 del JSON canónico. Un plan que ya no es borrador se lee de su snapshot y no se recalcula
  (RN-D08).
- POST /nutrition-plans/:id/revisions crea la versión siguiente del plan en borrador, copiando lo que tenía. Si el plan
  ya tiene un borrador, responde 409 NC-NUT-013 con su id.
- Eventos nutrition.plan.published (auditado como PUBLISH) y nutrition.plan.superseded (UPDATE de status). El plan
  publicado entra en la línea de tiempo del expediente (NUTRITION_PLAN_PUBLISHED, RF-10).
- Módulo tracking, mínimo:
  - el consumidor tracking.plans lee el snapshot por NutritionApi.publishedPlan, guarda la copia en
    active_plan_view y fija la meta de hoy en la fecha local del paciente, reemplazándola si ya existía;
  - la copia solo avanza: un evento de un plan publicado antes, que llega tarde, no la pisa (compara publishedAt);
  - es idempotente por processed_event;
  - el trabajo tracking.daily-targets (a los 15 minutos de cada hora) crea la meta del día local que falta a cada
    paciente con plan vigente, sin tocar la que ya existe. Nunca se reescriben días anteriores (RN-G03);
  - lista las organizaciones con TenancyApi.organizationIds en el contexto de plataforma, como el vencimiento de
    suscripciones.
- La lectura del plan por la app del paciente (GET /me/...) llega con sus pantallas en P13; la RLS ya le deja leer su
  active_plan_view y su meta diaria.
Consecuencias:
- La deuda «quién escribe tracking.daily_target» y «que active_plan_view compare el publishedAt del snapshot» queda
  resuelta.
- Notion al cerrar P9: 02 (NutritionApi, tracking.plans, el trabajo diario y los eventos), 05.2 (valid_to sin uso y
  el snapshot) y la línea de tiempo (RF-10).

## ADR-059 · Pantallas de la dieta por intercambios: editor en tres pasos con vista previa, porción sugerida e historial — aceptada (2026-10-22)
Contexto: el PR 3 de P9 hace las pantallas del plan por intercambios (RF-19, RF-23): editor en tres pasos, adecuación en
vivo e historial de versiones, con la porción sugerida y las referencias de hidratación que Rodrigo decidió en ADR-057.
Decisión:
- Vista previa en la API: POST /nutrition-plans/:id/preview recibe el cuerpo de PUT y devuelve lo que calcula el
  motor (intercambios, reparto por tiempo, totales, adecuación, métodos y lo que falta para publicar) sin guardar.
  Pide patients.read y deja un READ, como la vista previa de energía; con un plan publicado responde 409 (RN-E15) y con
  un borrador que no cuadra, 422 con cada problema. El editor no guarda solo: así no hay un evento updated y una
  auditoría por tecla. «Guardar borrador» manda PUT con If-Match y el navegador avisa si se sale con cambios.
- Editor en /panel/pacientes/:id/dieta/:planId, en tres pasos:
  - Metas: las metas exactas de la prescripción con su método, la lista con su versión (la DEMO, «provisional») y la
    meta de hidratación. Debajo, las ingestas adecuadas de agua total según el sexo del paciente (EFSA 2010: 2.0 L y
    2.5 L; IOM 2004: 2.7 L y 3.7 L), cada una con un botón «Usar»; el campo empieza vacío (RN-E13);
  - Intercambios: verduras, frutas y lácteos se escriben; almidones, carnes y grasas muestran lo que da el método, con
    «Ajustar» y «Volver al método» (RN-E08);
  - Reparto y alimentos: tiempos de comida con nombre, hora y % (de 1 a 8, la suma a la vista), el reparto por mayor
    residuo con «a mano» por grupo (RN-E09), los alimentos permitidos de cada grupo con intercambios en cada tiempo
    (RN-G05) y las indicaciones.
  La adecuación queda en una columna aparte en los tres pasos (RN-E10), con lo que falta para publicar. Publicar pide
  confirmación y no se puede con cambios sin guardar o con algo pendiente.
- Porción sugerida en la web: al agregar un alimento, el campo de gramos se llena con lo que aporta un intercambio ÷ el
  macronutriente que define al grupo por 100 g del alimento × 100, redondeado a gramos enteros; la fila muestra la
  cuenta. Sin el dato no hay sugerencia (RN-I03). No va en el motor porque no es un resultado guardado ni lleva método:
  la porción es la que escribe el profesional. Los carbohidratos son los totales de la TPCA (CHOCDF), los que la app
  muestra como «Carbohidratos», no los disponibles (CHOAVL): lo decidió Rodrigo (2026-10-22). GET del plan trae los
  nutrientes principales de cada alimento permitido (los mismos del snapshot).
- Historial en /dieta: cada versión con su estado (borrador, vigente, reemplazado), desde cuándo vale, la meta y la
  lista. Un plan publicado se ve desde su snapshot, con «Crear versión nueva»; si ya hay un borrador, la API responde
  409 con su id y se abre ese.
- TableScroll es relative: un texto sr-only de una columna fuera de la pantalla ensanchaba la página en el celular.
Consecuencias:
- P9 cumple sus tres criterios: G-17 a G-19 por HTTP y en la E2E de Luis (escritorio y celular), un plan publicado que
  ni la API ni la base dejan editar, y la publicación que crea active_plan_view y la meta del día.
- Notion al cerrar P9: 02 (la ruta de vista previa), 04 (las pantallas de RF-19 y RF-23) y lo que ya listaban ADR-057
  y ADR-058.

## ADR-060 · Texto de marca legible en el hover y vistas previas que no se vuelven a renderizar — aceptada (2026-10-22)
Contexto: al cerrar P9 quedaron dos detalles del sistema de diseño, fuera de P9, que Rodrigo pidió arreglar en el mismo
PR. En el hover del botón secundario (y de las filas de la lista de pacientes) el texto de marca queda sobre --muted
(#e3e8e6), más oscuro que el papel contra el que se calculaba: con la marca por defecto, 4.42:1 (WCAG 1.4.3 pide
4.5:1). Y useDebounced, con un objeto nuevo en cada render, reiniciaba la espera y volvía a renderizar cada 300 ms sin
parar en el formulario de energía y en «Armar un plato».
Decisión:
- brandTokens oscurece el texto y el borde de marca contra DARKEST_SURFACE (--muted), el fondo claro más oscuro sobre
  el que se escribe con la marca, y no contra el papel: lo que cumple ahí cumple también en el papel y en blanco. Una
  prueba fija que --muted es DARKEST_SURFACE y que el papel y --surface son más claros. Con la paleta provisional, el
  texto primario pasa de #0f766e a #0f746c (un paso de 2 %), el secundario de #a95d05 a #9c5604 y su borde de #d57506
  a #c86d06; el color de la marca no cambia. La E2E de P9 ya no aparta el puntero antes de axe.
- useDebounced solo acepta valores que se comparan por valor (texto, número, booleano o null): un objeto es un error de
  tipos. El formulario de energía y «Armar un plato» pasan el texto JSON del cuerpo, como el editor de la dieta.
Consecuencias:
- Cualquier marca de una organización (P15) cumple 4.5:1 en el hover sin tocar los componentes.
- Nada cambia en Notion: 02 §11 pide contraste AA y no fija cómo se calcula el texto de marca.

## ADR-061 · Recetario con caché de nutrientes por porción y «al menos» cuando falta un dato — aceptada (2026-10-23)
Contexto: P10 (PR 1) pide el recetario (RF-21): una receta con ingredientes, rendimiento y nutrientes por porción
calculados por el motor (RECIPE_NUTRIENTS), con una caché que se recalcula al cambiar los ingredientes. Con la TPCA,
casi todo total de micronutrientes de un plato o un día queda «sin dato», porque basta que a un alimento le falte el
valor (RN-I03). Rodrigo eligió (2026-10-23) mostrar la suma de lo que sí se conoce, con en cuántos alimentos falta, en
vez de dejar solo «sin dato».
Decisión:
- `RECIPE_NUTRIENTS` 1.1.0 (motor 1.3.0) suma aparte lo conocido (`knownTotals`, `knownPerServing`) y cuenta los
  ingredientes sin el dato (`missingIngredients`). Los totales no cambian: un dato que falta deja el total en null. La
  interfaz muestra «al menos X · falta en N de M»; si lo conocido es 0 (o se ve 0 al redondear), «0 g · falta en N de
  M», sin «al menos», porque un nutriente no baja de 0 (Rodrigo, 2026-10-23); si falta en todos, «sin dato». Vale para
  la receta y para «Armar un plato», y valdrá para los totales del día en composición y menú (PR 2).
- La caché `food.recipe.nutrients_per_serving` guarda el sobre del método: código, versión, versión del motor, hash de
  los insumos (RN-D01), ingredientes, peso, rendimiento, por porción (valor, conocido y faltantes), por 100 g cocidos y
  avisos. Se recalcula en la misma transacción al crear o editar la receta, y al editar un alimento propio que la receta
  usa. Ese recálculo no cambia la versión de la receta ni deja evento: es un dato derivado, no una edición.
- Las cantidades quedan con los dos decimales que guarda la base (gramos, porciones y peso cocido): se calcula con lo
  mismo que se guarda.
- La medida casera se guarda como texto («0.5 × Taza de acero al ras») junto a los gramos; no se agrega measure_id. Al
  editar, el ingrediente vuelve en gramos con su texto, y se puede volver a elegir una medida.
- Una receta no se borra: se archiva y se restaura con If-Match (status ACTIVE o ARCHIVED). Archivada sale de la
  búsqueda de activas; los planes que ya la usan la conservan en su snapshot.
- API /api/v1/recipes: búsqueda sin tildes (search_text con trigramas, como food.food), detalle, vista previa sin
  guardar (catalog.read, vale en solo lectura), crear y editar (catalog.write, If-Match), archivar y restaurar.
  Errores: NC-FOOD-006 (no existe, 404), NC-FOOD-007 (no se puede calcular, 422, RN-E12) y NC-FOOD-008 (versión, 409);
  un ingrediente que la organización no ve es NC-FOOD-002 con 422. Eventos food.recipe.created, .updated (con los
  nombres de los campos), .archived y .restored, auditados.
- Migración 202610230100_food_recipes: CHECK del estado, porciones y peso cocido mayores que cero, search_text con su
  índice e índice de recipe_ingredient por alimento.
- Pasan al PR 2, donde se diseñan las modalidades: los CHECK de nutrition.plan_item y FoodApi.recipesById.
Consecuencias:
- Reimportar un catálogo global no recalcula las cachés de las recetas (deuda); los planes publicados no cambian
  porque llevan su snapshot (RN-E15).
- Para Notion (/notion-sync): 03 RN-I03 («al menos» con los faltantes), 05.2 food.recipe (CHECK, search_text, índices y
  contenido de la caché), 02 §8 (eventos food.recipe.*) y 04 RF-21 (archivar en vez de borrar).

## ADR-062 · Composición y menú semanal: totales con el motor, opción A para el día y adecuación con lo conocido — aceptada (2026-10-23)
Contexto: P10 (PR 2) agrega las otras dos formas de prescribir (RF-20, RF-21, RN-E16) al plan nutricional de P9
(ADR-057), con la misma publicación. Faltaba decidir cómo se suman los días del menú, qué se exige para publicar y qué
hacer con la adecuación cuando a un alimento le falta un macronutriente: en la TPCA, los huevos y los pescados (53
alimentos) no traen carbohidratos y los jugos no traen grasa ni proteína. Rodrigo eligió (2026-10-23) la opción A para
los totales del día, exigir hidratación y algo en cada tiempo para publicar, y la adecuación con lo conocido.
Decisión:
- La modalidad se elige al crear el plan (`POST .../nutrition-plans` con `modality`) y no cambia: un PUT o una vista
  previa de otra modalidad responde 422 con NC-NUT-014. Solo los intercambios llevan lista (RN-E11).
- Composición: tiempos de comida (con su % de la meta del día, que suman 100, RN-E09) y en cada uno alimentos con sus
  gramos de parte comestible y la medida casera como texto. Las recetas van solo en el menú (RN-E16).
- Menú semanal: los mismos tiempos de lunes a domingo; en cada día, una celda por tiempo con opción A y, si se quiere,
  opción B, cada una con alimentos en gramos o recetas en porciones. En la base, cada tiempo de cada día es un
  `plan_meal` con su `day_of_week` (1 = lunes), y cada alimento o receta un `plan_item` con `option_label` A o B.
- Totales con `RECIPE_NUTRIENTS` como una receta de una porción: por tiempo (o celda y opción), por día y, en el menú,
  por porción de cada receta. Una receta entra como sus ingredientes escalados a las porciones. El total del día del
  menú usa la opción A de cada tiempo; la B tiene su propio subtotal para comparar. Sin alimentos, el total es 0 y no se
  llama al motor. Los cálculos de insumos iguales cuentan una vez en `methods`.
- Promedio semanal por nutriente: «sin dato» si falta en algún día, con lo conocido aparte y en cuántos días falta.
- Adecuación (RN-E10, `ADEQUACY`) con la suma de lo conocido de cada día, nunca tomando el dato que falta como 0
  (RN-I03): si falta, se muestra «al menos» con en cuántos alimentos (composición) o días (menú) falta. En el menú es la
  del promedio de los siete días, con los días en rango (RN-G09).
- Para publicar, además de la hidratación (RN-E13): en composición, al menos un alimento por tiempo; en el menú, la
  opción A en cada tiempo de los siete días. Los mensajes agrupan los días por tiempo («Almuerzo: falta la opción A el
  martes y el jueves»).
- El snapshot sigue en la versión 1 y `modality` distingue su forma. Composición y menú congelan cada alimento usado con
  todos sus nutrientes por 100 g y, en el menú, cada receta con lo que rinde, sus ingredientes y lo de una porción: lo
  que el paciente registre desde su plan (P13) sale de ahí. tracking no cambia: lee las metas y la hidratación, que
  están en toda modalidad.
- Migración 202610232000_plan_modalities: la lista solo en intercambios (`plan_exchange_list_by_modality`); en
  `plan_item`, un alimento con gramos y sin porciones, una receta con porciones y sin gramos ni medida
  (`plan_item_quantity`), la opción A o B (`plan_item_option`) y el orden único por tiempo y opción.
- La web de P9 manda `modality: 'EXCHANGES'`, el historial muestra la modalidad y un plan de otra modalidad muestra un
  aviso hasta que lleguen sus pantallas (PR 3).
Consecuencias:
- El historial (`GET .../nutrition-plans`) trae `modality`, y la lista y su versión pueden ser null.
- Para Notion (/notion-sync): 03 RN-E16 y RN-G05 (lo que se exige para publicar composición y menú) y RN-E10 (con lo
  conocido); 05.2 nutrition.plan y plan_item (CHECK nuevos y `option_label` A o B en vez de «Opción A»); 02 §7
  (modalidad fija y snapshot por modalidad); 04 RF-20 y RF-21.

## ADR-063 · Pantallas de composición y menú semanal — aceptada (2026-10-24)
Contexto: P10 (PR 3) pide el editor por composición con buscador, el menú semanal en grilla y la vista de lo publicado
(RF-20, RF-21), sobre la API del PR 2 (ADR-062).
Decisión:
- Plan nuevo: se elige la modalidad (Intercambios, Composición o Menú semanal) junto con la prescripción; la lista de
  intercambio aparece solo para los intercambios.
- Composición, en una página: metas, hidratación con sus referencias, tiempos de comida (nombre, hora y % que suman
  100) y, en cada tiempo, sus alimentos en gramos o en medidas caseras con lo que aporta; abajo, todos los nutrientes
  del día; al costado, la adecuación y el panel para guardar y publicar.
- Menú semanal: los tiempos de comida comunes y, debajo, pestañas de lunes a domingo (patrón de pestañas de WAI-ARIA,
  con las kcal de cada día); en cada tiempo, la opción A y la B una debajo de la otra, con alimentos o recetas. «Copiar
  el lunes a los demás días» (con confirmación) llena la semana desde un día. El resumen de la semana muestra cada día
  con la opción A y el promedio. Lo publicado se ve en una grilla de días por tiempos en escritorio y por pestañas en el
  celular.
- El buscador de alimentos (y de recetas, en el menú) se abre a pedido con «Agregar», para no llenar la pantalla de
  buscadores; el resto del nombre del botón («a Almuerzo del lunes, opción A») queda para el lector de pantalla, y así
  el botón no ensancha la página en el celular.
- Adecuación de composición y menú en tres columnas: lo planeado con su meta debajo, y la adecuación. Con datos que
  faltan: «al menos» y «Faltan datos», salvo que lo conocido ya pase el máximo («Por encima»).
- Las medidas caseras de los alimentos de un borrador las trae la página del plan, como al editar una receta.
- Piezas comunes a los tres editores: usePlanDraft (vista previa, guardar con If-Match, publicar y aviso al salir con
  cambios), el panel del borrador, las metas y la hidratación; el editor por intercambios también las usa. El buscador
  de alimentos del recetario pasa a features/food y se suma uno de recetas.
- Las pruebas unitarias de la web resuelven el alias @, como tsconfig.
Consecuencias:
- Las plantillas de plan (RF-22, deseable) quedan fuera de P10.

## ADR-064 · Fichas PDF: contexto documents, PDF reutilizado por sus hashes y generado en el worker — aceptada (2026-10-25)
Contexto: P11 (PR 1) pide fichas PDF reproducibles con la marca del profesional (RF-24, RN-H02, RN-H03), generadas en
el worker y reutilizadas si nada cambió. Rodrigo decidió (2026-10-25): un plan por composición se imprime con la ficha
del menú, como un plan de un día (siguen siendo cinco fichas, RN-H01); la ficha lleva el nombre y el código del
paciente; la marca es la del profesional que firma o, si no, la de la organización, y en P11 solo se edita la de la
organización; la semilla de la Demo 2 deja intercambios y composición publicados y el menú se arma en vivo.
Decisión:
- Contexto `documents` (02 §2). SheetSources arma la ficha desde las API públicas: NutritionApi.publishedPlan,
  `planStatus` y `energySummary` (las metas con sus métodos, RN-D02), ClinicalApi.patientCard (nombre y código; solo
  para documents) y TenancyApi.sheetBranding.
- Un PDF se identifica por su tipo, su origen, el SHA-256 del JSON canónico de lo que muestra (source_hash, sin la
  marca), la versión de la plantilla y el SHA-256 de la marca resuelta (branding_hash). Con todo igual se reutiliza; si
  dos trabajos lo generan a la vez, el índice único generated_document_reuse deja uno y el otro descarta su archivo.
  Regenerar da los mismos bytes: la fecha del PDF es la del origen (publicación o cierre), nunca el reloj, y la edad
  del paciente es la cumplida ese día.
- La marca se resuelve dato por dato: la propia de quien publicó el plan o hizo la evaluación; si no fijó ese dato, la
  de la organización; sin nombre, el de la organización; sin color, la paleta provisional (DEFAULT_BRAND).
- Generación en el worker con el consumidor `documents.sheets`: de `nutrition.plan.published`, sin que nadie la pida, y
  de `documents.document.requested`. API: `POST /patients/:id/documents` responde 200 con la ficha si ya existe o 202
  y la pide al worker (vale en solo lectura: exportar, RN-A02); `GET …/documents/status` dice si ya está;
  `GET /documents/:id/file` la entrega como adjunto, auditada como EXPORT (RN-B03). Cada PDF nuevo deja
  `documents.document.generated`, auditado como CREATE. Errores NC-DOC-001 (404) y NC-DOC-002 (422, RN-H02: un
  borrador no tiene ficha).
- Render con @react-pdf/renderer 4.9.0, fijo en el catálogo porque los bytes dependen de la versión, y la letra Archivo
  (OFL) de @fontsource, la misma del panel. Las plantillas se escriben en TypeScript con createElement: con JSX, SWC
  leería todos los `.ts` de la API como TSX y rompería los genéricos en flecha. El interlineado va en el cuerpo y no en
  la página: en la página, react-pdf saca de la hoja el pie con posición absoluta y calcula sobre sus 18 pt por defecto.
- Plantillas registradas por tipo y versión en el código; `documents.template` guarda la versión activa, una por tipo y
  alcance. Migración 202610250000_documents_generation: CHECK del estado de la plantilla, del tipo y del origen de la
  ficha, índices de reutilización y por paciente, y la plantilla global EXCHANGE_DIET 1.0.0.
- `formatNumber` (RN-D09) y `brandTokens` pasan de @nutricoach/ui a @nutricoach/contracts, que ui reexporta: la ficha
  redondea y contrasta igual que el panel, como ya pasaba con las etiquetas de los métodos (ADR-027).
- La ficha de intercambios tarda unos 220 ms en dibujarse. El p95 de RNF-04 (3 s o menos) se mide en la integración:
  20 fichas generadas por el worker con la base, una tras otra. En las unitarias no se mide: con los paquetes probándose
  en paralelo y la cobertura, una ficha llega a tardar 3 s. El renderizador registra la duración y el tamaño de cada
  ficha, sin datos del paciente.
Consecuencias:
- Una versión nueva de react-pdf puede cambiar los bytes aunque el origen no cambie: lo ya generado se reutiliza, y
  todo cambio visual sube la versión de la plantilla.
- Los PDF con datos del paciente quedan en el almacenamiento (cifrado en disco, RNF-14): la supresión (RN-B05, P15)
  tiene que borrarlos.
- Para Notion (/notion-sync): 02 §3 (ClinicalApi.patientCard, NutritionApi y TenancyApi), §7 y §8 (documents, su
  consumidor y sus eventos); 05.3 (CHECK e índices de documents); 03 RN-H02 (qué identifica un PDF) y RN-H03 (la marca
  dato por dato).

## ADR-065 · Fichas del menú, la composición y los resultados antropométricos — aceptada (2026-10-26)
Contexto: P11 (PR 2) pide las otras dos fichas de la Demo 2 (RF-24, RN-H01): el menú semanal y los resultados
antropométricos, con el método junto a cada número (RN-D02, RN-H04, criterio 2). Rodrigo decidió (2026-10-25) que la
composición se imprima con la ficha del menú (ADR-064).
Decisión:
- Ficha del menú (WEEKLY_MENU 1.0.0): metas con su método, la adecuación del promedio con los días en rango (RN-G09),
  cada día con lo de cada tiempo en su opción A y B y el total con la opción A (RN-E16), el promedio de la semana y
  cada receta con sus ingredientes y lo de una porción (RN-E12). Un dato que falta se ve como «al menos X · falta en
  N de M» (ADR-061). La composición usa la misma plantilla como un plan de un día: un solo día sin nombre, sin opción
  B ni promedio, y el título «Dieta por composición».
- Ficha de resultados (ANTHROPOMETRY 1.0.0): condiciones de la medición (RN-C09), cada resultado vigente con su método
  y versión, cada indicador con su método al lado («% de grasa (Durnin & Womersley (1974) + Siri)»; el IMC no lo
  repite), su interpretación con la fuente de la tabla vigente en la fecha (RN-D10), los avisos (RN-D06), las medidas
  con interpretación propia, las medidas consolidadas por familia (RN-C03) y la bioimpedancia como lectura del equipo
  (RN-C08). La firma el evaluador (su marca propia, RN-H03) y lleva como fecha la del cierre.
- AssessmentApi.evaluationSheet entrega la evaluación con sus resultados. El armado de los resultados pasa a
  ResultsAssembly, que usan la pantalla y la ficha: dicen lo mismo. Las etiquetas y el redondeo de la evaluación
  (niveles, familias, indicadores, unidades y bioimpedancia) pasan de la web a @nutricoach/contracts.
- La ficha de resultados se genera a pedido, no al cerrar: los resultados los calcula el worker después del cierre.
  Mientras tanto, pedirla responde 409 con NC-DOC-003.
- El paciente y la explicación de las metas pasan a piezas comunes (plan-parts); la ficha de intercambios 1.0.0 sigue
  dando los mismos bytes.
- Migración 202610250100_documents_templates: las plantillas globales WEEKLY_MENU y ANTHROPOMETRY 1.0.0.
- La marca mínima, que el plan ponía en este PR, pasa a uno propio (PR 3) para que cada PR se revise solo.
Consecuencias:
- Para Notion (/notion-sync): 02 §3 (AssessmentApi.evaluationSheet) y el error NC-DOC-003; 03 RN-H01 (la composición
  se imprime con la ficha del menú).


## ADR-066 · Marca mínima de las fichas: API, logo revisado entero y pantalla — aceptada (2026-10-27)
Contexto: P11 (alcance 4) pide la edición mínima de logo y colores si P15 no llegó; la marca completa (RF-36: avatar,
vista previa del tema del paciente y marca propia de cada profesional) es de P15. ADR-065 la separó en su propio PR.
Decisión:
- API de tenancy: GET y PUT /organization/branding (nombre visible, colores, teléfono, correo, web y pie) y el logo
  aparte: PUT /organization/branding/logo (multipart, campo «logo»), DELETE y GET (como adjunto y con nosniff; no se
  audita, no es un dato personal). La ven todos los miembros (organization.read) y la cambian el dueño y los
  administradores (organization.update). Solo la de la organización (member_id NULL); la de cada profesional, en P15.
  Sin If-Match, como los ajustes: gana la última escritura. Texto y logo se guardan por separado para no pisarse, y
  cada escritura toma el candado de la organización (una fila por organización y miembro).
- Evento tenancy.branding.changed con memberId y los nombres de los campos, nunca los valores; audit lo registra
  como UPDATE de tenancy.branding. Lo que no cambia no se escribe ni se audita.
- Logo: PNG o JPEG de hasta 1 MB (lo corta el parser: 413) y 2000 px por lado (422, NC-TEN-041), revisado entero
  antes de guardarlo (platform/storage/image-info): en PNG, el CRC de cada bloque, datos que se descomprimen al
  tamaño exacto y un filtro válido por fila; en JPEG, los marcadores, un SOF de base o progresivo de 8 bits con 1, 3
  o 4 componentes y el cierre. react-pdf solo mira el encabezado al cargarlo y descomprime al dibujar: un logo
  dañado rompería todas las fichas de la organización, también las que se generan al publicar. Lo que no pasa es
  415 (NC-TEN-040). Se guarda con FileRegistry (purpose BRANDING_LOGO); el anterior queda guardado, sin uso.
- Largos: nombre 60, teléfono 30, correo 80, web 60 y pie 120 caracteres. Con todos al máximo y un logo ancho, el
  encabezado y el pie de la ficha no pisan el cuerpo (una prueba lo mide con las posiciones del texto en el PDF): las
  plantillas siguen en 1.0.0.
- Pantalla «Marca de las fichas» en /panel/organizacion: el logo se sube al elegirlo (el navegador revisa antes el
  tipo, el peso y las medidas); el color de la ficha con su contraste (blanco o negro encima y, como texto sobre el
  papel, oscurecido lo justo, con brandTokens); nombre, contacto y pie; y una vista previa del encabezado y el pie
  con las variables --brand-* redefinidas solo en ella. Solo el color principal: las plantillas solo usan ese
  (encabezado, nombre y títulos); el secundario queda en la API para P15. Solo cambian las fichas: el panel y el tema
  del paciente siguen con la paleta provisional hasta P15.
- Con otra marca cambia el branding_hash: la ficha se vuelve a generar al pedirla y las ya generadas no cambian
  (RN-H02, ADR-064).
Consecuencias:
- Para Notion (/notion-sync): 02 §8 (tenancy.branding.changed hacia audit); 05.1 tenancy.branding (las claves de
  contact y los largos); los códigos NC-TEN-040 a NC-TEN-044; 04 RF-36 adelantado en parte por P11.
- P15 completa la marca: la propia de cada profesional (la ficha ya la usa si existe), el avatar, la vista previa del
  tema del paciente, la marca en el panel y la limpieza de los logos sin uso.

## ADR-067 · Descargas de las fichas en el panel — aceptada (2026-10-27)
Contexto: P11 (alcance 3) pide el botón de descarga en el plan y en la evaluación. La API ya pide la ficha (200 si
existe un PDF igual, 202 si la genera el worker), dice si está lista y la entrega como adjunto auditado (ADR-064).
Decisión:
- «Descargar ficha (PDF)» en el plan publicado o reemplazado y en la evaluación cerrada o enmendada, solo cuando sus
  resultados ya están calculados: antes, la API respondería 409 (NC-DOC-003). No depende de poder escribir: exportar
  vale en solo lectura (RN-A02).
- Al pulsarlo se pide la ficha; si queda en la cola del worker, el botón dice «Generando…» (y un aviso para lectores de
  pantalla) y se pregunta cada segundo, un minuto como máximo. Pasado el minuto se avisa que tarda más de lo normal y
  que basta con volver a pedirla. Si se sale de la pantalla, se deja de preguntar.
- La descarga es un enlace a /api/v1/documents/:id/file con el nombre de la ficha: el navegador la guarda como adjunto,
  sin pasar por la memoria de la página, y la API la audita como EXPORT (RN-B03).
Consecuencias:
- E2E e2e/fichas.spec.ts: la dieta publicada y los resultados de Luis se descargan como PDF con el logo de la marca, en
  escritorio y celular.
- La app del paciente descargará sus fichas por /api/v1/me en P13.

## ADR-068 · Semilla, guion y acta de la Demo 2 — aceptada (2026-10-28)
Contexto: P11 (alcance 5) pide la semilla con los planes de Luis, el guion y el borrador del acta. Rodrigo decidió
(2026-10-25) que la semilla deje la dieta por intercambios publicada y después reemplazada por la composición, que
queda vigente, con la receta de arroz con pollo; el menú semanal se arma en vivo.
Decisión:
- `pnpm demo:2` (apps/api/scripts/demo-2.ts) siembra por la API, con la API y el worker corriendo, como la dueña demo
  de `pnpm db:seed`. Así los snapshots, la adecuación y las fichas son los reales: nada se escribe a mano en la base.
  Crea la prescripción de Luis si no la tiene (esperando a que el worker calcule sus resultados), la receta, la dieta
  por intercambios y después la de composición, cada una publicada.
- Se puede correr dos veces: un plan publicado o reemplazado de esa modalidad no se repite; el borrador de una corrida
  cortada se retoma. Con la composición ya publicada no se crea la dieta por intercambios, porque quedaría vigente.
- Los datos van en seeds/luis/demo-2.json, con los nombres de la TPCA y la TAFERA. La porción de cada alimento
  permitido es la sugerida del editor (ADR-057). La composición usa medidas caseras de la TAFERA y queda en el rango
  de adecuación de la organización: de 94 a 103 %.
- El guion (docs/demos/demo-2.md) sigue el formato de la Demo 1. Sus cifras salen de un ensayo por las pantallas
  sobre una base nueva, bajando cada ficha.
- La Demo 2 no tiene un spec propio: cada paso ya tiene su E2E en escritorio y celular (biblioteca, dieta, recetas,
  menú, fichas y marca), y test/integration/demo-2.int.spec.ts corre la semilla dos veces.
- El acta (docs/actas/demo-2.md) es un borrador: los nombres de las partes como en Notion, sin DNI ni correos, y la
  fecha, la modalidad y las firmas en blanco. Se confirma contra el contrato antes de enviarla.
- La etiqueta v0.2.0 va sobre main después de fusionar, con la confirmación de Rodrigo para el push.
Consecuencias:
- La ficha de resultados repite «Masa ósea (Masa ósea (Rocha))»: su arreglo, con la plantilla 1.0.1, va en un PR
  aparte antes de la demo (decidido por Rodrigo, 2026-10-28; ADR-069).
- Para Notion (/notion-sync de P11): el comando de la semilla de la Demo 2 en la creación del proyecto, si se lista ahí.

## ADR-069 · Ficha de resultados 1.0.1: el método sin repetir el indicador — aceptada (2026-10-28)
Contexto: la ficha de resultados 1.0.0 (ADR-065) pone cada indicador con su método entre paréntesis y solo evita
repetirlo cuando los dos se llaman igual (IMC). Cuando el nombre del método ya empieza con el del indicador, se repite:
«Masa ósea (Masa ósea (Rocha))», «Masa residual (Masa residual (Würch))» y la masa muscular de Lee. Rodrigo eligió
arreglarlo en un PR aparte, antes de la Demo 2.
Decisión:
- Plantilla ANTHROPOMETRY 1.0.1: si el nombre del método empieza con el del indicador, va solo el método: «Masa ósea
  (Rocha)». Lo demás no cambia.
- Un cambio visual es una versión nueva (ADR-064): la migración 202610280000_documents_anthropometry_1_0_1 retira la
  1.0.0 y activa la 1.0.1. El código sigue dibujando la 1.0.0, con los mismos bytes, para volver a generar lo que ya se
  generó con ella (RN-H02).
- La ficha siguiente de cada evaluación sale con la 1.0.1: la versión de plantilla es parte de la clave de la ficha.
Consecuencias:
- Para Notion (/notion-sync de P11): la plantilla 1.0.1 de resultados en 05.3, si la página lista las versiones.

## ADR-070 · Método de JV Fitness en el motor: perfil de rendimiento, llaves de seguridad, propuesta y macrociclo — aceptada (2026-10-30)
Contexto: P12 (PR 1). G-29 a G-35 y G-40 reproducen la plantilla V3 (07 §14). El paquete de Jeremy trae el libro de
formularios con dos versiones del cribado y de la anamnesis, y las preguntas abiertas de 07 §15 dejan huecos que el
prompt manda construir con su propuesta. Rodrigo decidió los puntos abiertos el 2026-10-30.
Decisión:
- `PRI_JV` 2.0.0, en el registro de métodos, con su sobre (RN-D01): puntos de las 29 preguntas, dominios de 0 a 100, PRI y
  clases (RN-F16, 07 §12). Semver y no «V2» como dice el comentario de 05.2, porque el registro lo exige. Sin ninguna
  respuesta no hay PRI. Una clase queda sin dato si falta uno de sus dominios, como la hoja, y la prioridad es el dominio
  más bajo con empate para el primero de la hoja.
- Reglas sin sobre, porque no son un cálculo que se guarde como resultado, sino estados con su versión (`rule_version`
  de 05.2): `screeningStatus`, `movementTestStatus` y `prescriptionStatus` (`SAFETY_RULE_VERSION`), en el motor para que
  las usen clinical, assessment y training sin cruzar dominios.
- Propuesta y macrociclo como funciones puras que reciben las tablas: `proposeRoutine` (`ROUTINE_TEMPLATE_VERSION`),
  `macrocycleWeeks`, `macrocycleMesocycles`, `weekSets` y `proposalWeek`. Las tablas son datos: seeds/training/
  periodization-v3.json (48 filas, valid_from 2026-10-15, la fecha de corte del paquete) y seeds/exercise/
  pattern-choice-v3.json (45 filas). Los casos dorados leen esos mismos archivos.
- Lo que decidió Rodrigo:
  - Formularios: manda Notion. Notion y G-35 usan `01_Form_Anamnesis` y `02_Form_Cribado`, las que tienen puntaje, aunque
    las llama V2; `08_ANAMNESIS_V2` y `09_CRIBADO_V2` tienen otros códigos y no puntúan (con la 09, S02 no es crítica y
    G-35 no daría rojo). Se pregunta a Jeremy (P-15).
  - P-06, RIR: las series de la semana son máx(1, redondeo de base × factor) y el RIR de cada serie es el objetivo de su
    semana (4 en descarga). La plantilla conserva el RIR 2 de la hoja: con ella se compara el criterio 4.
  - Llaves: sin cribado respondido, bloquea (BLOQUEADO · CRIBADO SIN REVISAR); sin evaluación postural no bloquea, como
    la V3, y la pantalla avisa; con la revisión «derivar» sigue bloqueado con un estado nuevo, BLOQUEADO · DERIVADO, aunque
    Notion dice que cualquier revisión abre la llave.
  - Programa manual con una llave cerrada: se permite con un aviso visible, porque la V3 solo bloquea «la asignación
    automática». La propuesta no se genera ni se publica con una llave cerrada.
  - P-04, quinto día: Notion dice que la V3 no lo trae, pero la hoja PRESCRIPCION tiene sus fórmulas, cortadas porque solo
    la primera fila lleva el día: empuje horizontal, tracción horizontal, sentadilla, bisagra, hombro, bíceps, tríceps y
    acondicionamiento. Se usan, con «Sesión 1» a «Sesión 5». Jeremy lo confirma.
  - El CSV de ejercicios base lo redacta Claude, marcado «Provisional» hasta que Jeremy lo revise (PR 2).
- Propuestas de 07 §15 que entran aquí: P-01 (las cuatro tablas), P-03 (los rótulos de la V3), P-07 (la tabla se corta),
  P-10 (el PRI pondera solo los dominios respondidos), P-11 (manda la tabla; «RDL con mancuernas» es un alias) y P-14 (el
  dolor manda aunque falte un lado).
- La propuesta da a todos los bloques 3 × 8-12, RIR 2, tempo 2-1-2 y 90 s, también a «Caminata inclinada», porque la hoja
  lo hace así y el criterio 4 pide que coincida. El coach lo ajusta y se pregunta a Jeremy (P-16).
Consecuencias:
- Motor 1.4.0. Ningún método existente cambia.
- `ROUTINE_TEMPLATE_VERSION` se guarda en el snapshot del programa (PR 5): el DDL no tiene columna para ella.
- Para Notion (/notion-sync de P12): 07 §6 (el quinto día y BLOQUEADO · DERIVADO), 07 §15 (P-04, P-06 con el RIR, P-15 y
  P-16), 03 RN-F15 (sin cribado bloquea y derivar sigue bloqueado), el comentario de `method_version` en 05.2, 06 §6
  (casos dorados G-01 a G-28) y la copia de packages/engine/CLAUDE.md, si «Archivos del repositorio» la incluye.

## ADR-071 · Biblioteca de ejercicios: CSV provisional, ejercicios propios y tabla patrón × nivel — aceptada (2026-10-30)
Contexto: P12 (PR 2). RF-25 pide la biblioteca global y propia, y RF-38 los ejercicios base con importador. El prompt pide
150 o más desde un «CSV del equipo» que no existía: el paquete de Jeremy trae 23. Rodrigo decidió (2026-10-30) que Claude
redacte los demás y queden marcados como provisionales hasta que Jeremy los revise, y que en P16 se revisen todas las
marcas de «Provisional».
Decisión:
- seeds/exercise/ejercicios-base.csv, 169 ejercicios: los 23 de la hoja EJERCICIOS con sus datos, comparados con la hoja;
  15 que pide la tabla patrón × nivel; 14 que la hoja nombra como alternativa; y 117 más. La columna `provisional` llega a
  exercise.exercise y la app lo muestra en la lista, la ficha y la tabla. A los 23 de la V3 también les agregamos regresión
  y progresión (P-13), que Jeremy tiene que revisar.
- Importador EXERCISE_LIBRARY en catalog:load (RN-I04): upsert por código, que un ejercicio sin cambios no toca; las
  variantes se enlazan cuando ya existen todos los ejercicios del archivo. Una variante que no existe, un músculo o un
  equipo desconocidos hacen fallar el archivo entero.
- La tabla patrón × nivel pasa de JSON a seeds/exercise/pattern-choice-v3.csv, una sola fuente para el importador
  EXERCISE_PATTERN_CHOICES y para los casos dorados del motor. Cada fila comprueba que el código exista, que el nombre
  coincida y que el ejercicio sea de ese patrón.
- Diferencias con 05.2, para llevar a Notion: `exercise.code` con índice único (07 §5 lo pide y el importador lo necesita);
  `version` y `updated_at` para If-Match; `base_measure` (REPS, SECONDS o MINUTES), porque la hoja pone 20 «repeticiones» a
  la caminata y son minutos; `provisional`; el CHECK de `status`; y RLS global también en muscle_group y equipment, que
  no la tenían.
- FULL_GYM («Gimnasio completo») es un equipo del catálogo solo para el perfil de entrenamiento (07 §2): ningún ejercicio
  lo lleva. Un ejercicio tiene un solo equipo, como el DDL: si la hoja da dos opciones, va el que menos pide.
- Ejercicios propios (RN-I01): POST y PUT con If-Match, archivar y restaurar, sin borrar. Editar reemplaza los músculos.
  Los globales responden 403 (NC-EXE-003). Un músculo va en una sola lista, porque cuentan distinto (RN-F06); el enlace del
  video solo con https. Eventos exercise.exercise.created, .updated, .archived y .restored, auditados con los nombres de
  los campos.
- Búsqueda sin tildes también por los alias, con filtros por patrón, nivel, equipo y músculo. El catálogo es de unos cientos
  de filas, así que los alias no llevan índice.
- Tabla patrón × nivel configurable por organización (07 §5): PUT y DELETE en /exercise-pattern-choices/:pattern/:level.
  Vale para toda la organización, así que la cambian el dueño y el administrador (`organization.update`, como la marca);
  un profesional la lee. Solo admite un ejercicio activo de ese patrón (NC-EXE-005, RN-F14) y solo cuenta para las
  propuestas siguientes. Si después ese ejercicio propio se archiva o cambia de patrón, la fila no cuenta y queda la de la
  V3; no se borra, y vuelve a contar si el ejercicio vuelve a servir. Evento exercise.choice.changed, auditado.
- Pantallas: Biblioteca > Ejercicios (lista con filtros en la dirección, ficha, ejercicio propio) y Biblioteca > Patrón y
  nivel. ExercisePicker queda para las sustituciones del editor de programas.
- El paciente no borra lo que puede leer (05 §3). `patient_scope` deja leer con USING y le prohíbe escribir con WITH CHECK,
  pero DELETE solo evalúa USING. La revisión lo encontró en exercise_muscle (este PR) y en cinco tablas anteriores:
  food.household_measure, food.recipe_ingredient y tres de analytics. Ninguna ruta del paciente borraba. Una migración
  aparte agrega la política restrictiva `patient_no_delete` a las seis, y una prueba del catálogo falla si aparece otra.
Consecuencias:
- ExerciseApi entrega la biblioteca y la tabla: la usa training en el PR 5.
- Las series de cardio cuentan «Cardiorrespiratorio» como grupo: P14 lo deja fuera del volumen por grupo muscular (RN-F06).
- «Acerca de» nombra a JV Fitness como fuente de la biblioteca (RN-I02) y dice que hay ejercicios provisionales: esa línea
  también se revisa en P16.
- Para Notion (/notion-sync de P12): lo de arriba en 05.2; 05 §3 (`patient_no_delete`); 02 §8 (eventos de exercise hacia
  audit) y §3 (ExerciseApi); 03 RN-I02 (los ejercicios base provisionales) y RN-F14 (quién cambia la tabla, y que un
  ejercicio que ya no sirve no cuenta); los códigos NC-EXE-001 a NC-EXE-005.

## ADR-072 · Anamnesis V2 y perfil de rendimiento: la historia v1 queda de solo lectura — aceptada (2026-10-30)
Contexto: P12 (PR 3). RF-43 pide la anamnesis de JV Fitness, presencial u online, como versión 2 de la historia clínica, con
su perfil de rendimiento (RN-F16). La v1 de P6 era texto libre «hasta tener la ficha del cliente» (RF-09). Rodrigo decidió
que manda la hoja `01_Form_Anamnesis` y que se pregunte a Jeremy por `08_ANAMNESIS_V2` (P-15, ADR-070).
Decisión:
- Cada guardado es una revisión de clinical.clinical_history con form_code `JV_ANAMNESIS` y form_version `V2`, en la misma
  numeración que la v1. PUT /clinical-history ya no acepta los bloques de la v1 (400): esas revisiones solo se leen.
- Las 43 preguntas de la hoja, con sus códigos y su texto, salvo ID01 a ID04 (correo, nombre, teléfono y nacimiento), que ya
  están en la ficha. Presencial u online es un campo de las respuestas (`modality`): las dos variantes del paquete solo
  se diferencian en el enlace. Se guarda aunque falten respuestas, porque las vacías no cuentan. Lo que no se responde no
  viaja; una elección ya marcada se puede quitar. El esquema y el formulario están en @nutricoach/contracts, con pruebas
  contra el motor: las 29 preguntas con puntaje, sus opciones y que todo lo que acepta el contrato lo acepte PRI_JV.
- clinical.performance_profile guarda el perfil de cada revisión en la misma transacción, con método, versión, insumos y
  hash (RN-D01), y sin UPDATE (RN-D08). A los insumos van solo las 29 respuestas que puntúan: el texto se queda en la
  historia. Sin respuestas que den puntaje, la fila existe con PRI y clases en null.
- GET /clinical-history/revisions/:revision lee cualquier revisión, con su READ (RN-B03): es lo que deja consultar la v1 y
  los perfiles anteriores. Si el motor rechazara una respuesta, NC-CLI-028 (RN-F16) y no se guarda nada.
- Pantallas: la pestaña Historia clínica muestra el perfil con su método, el formulario, y las revisiones como enlaces a una
  página de solo lectura. El PRI y los dominios van con 1 decimal, como los índices (RN-D09).
- El formulario respeta el permiso de escritura (RN-A05): quien no está en el equipo de atención con WRITE ve «Solo lectura»
  y no se le ofrece guardar. Es lo que el plan de P12 pidió para sus pantallas nuevas; Condiciones, Notas y Evaluaciones
  siguen pendientes.
- Diferencia con 05.2, para llevar a Notion: `pri` es numeric(7,4) y no numeric(5,2). Con 2 decimales, cerca de 1 de cada 20
  PRI se vería con 0.1 de diferencia al redondear otra vez a 1 decimal (RN-D09).
Consecuencias:
- Las semillas de Luis y Ana conservan su historia v1: son el caso real de solo lectura. El guion de la Demo 1 sigue
  hablando de la historia por temas, porque es el registro de esa demo.
- N05 sigue siendo texto y nunca se interpreta. El formulario recuerda registrar las alergias e intolerancias también como
  condiciones; lo que hace la dieta con ellas está en ADR-073.
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir las respuestas V2, que traen texto libre, y los
  insumos del perfil.
- Para Notion (/notion-sync de P12): 04 RF-09 (la v1 quedó de solo lectura) y RF-43; 05.1 (form_code y form_version de
  clinical_history); 05.2 (`pri`, y `method_version` semver, ya en ADR-070); 02 §3 (la ruta de una revisión); 07 §12 (ID01 a
  ID04 no se piden; `modality`); el código NC-CLI-028.

## ADR-073 · Alergias al armar la dieta: un aviso, mientras falta la regla de exclusión — aceptada (2026-10-30), ampliada por ADR-074
Contexto: 07 §12 y la hoja de mapeo de Jeremy piden «exclusión obligatoria» de alergias e intolerancias en la dieta. Ninguna
regla RN ni prompt la cubre, y la dieta no leía clinical.condition: se podía armar un plan con un alimento al que el
paciente es alérgico, sin aviso. La revisión del PR 3 de P12 lo encontró y Rodrigo pidió resolverlo en ese mismo PR.
Decisión:
- Un aviso en Nuevo plan y en cada plan, borrador o publicado y en sus tres modalidades, con las alergias e intolerancias
  activas y lo que dice de ellas la última revisión de la historia (N05, o los bloques de la v1), tal cual. Así se ve
  también lo que se anotó en la anamnesis y no se registró como condición.
- El aviso dice que la app no las cruza con los alimentos. No bloquea publicar y no lleva a la ficha PDF: excluir de verdad
  exige enlazar cada alergia con alimentos, la TPCA no trae alérgenos y esa regla clínica no se inventa (regla 11).
- Si las condiciones o la historia no se pudieron leer, el aviso lo dice: callar parecería que no hay ninguna. Sin nada
  registrado no se muestra nada.
- Solo pantalla: usa GET /conditions y GET /clinical-history, que ya dejan su READ (RN-B03). Abrir un plan suma esas dos
  lecturas a la auditoría, y son ciertas: quien lo abre las ve.
Consecuencias:
- Pregunta nueva para Jeremy (P-17): cómo se enlaza una alergia con los alimentos para excluirlos de verdad.
- Para Notion (/notion-sync de P12): 07 §12 (hoy es un aviso) y §15 (P-17).

## ADR-074 · Exclusión obligatoria de alimentos por alergia o intolerancia — aceptada (2026-10-30)
Contexto: ADR-073 dejó un aviso y la pregunta P-17 para Jeremy. Rodrigo pidió impedir que se use el alimento alérgico, con el
visto bueno de Jeremy (2026-10-30). 07 §12 lo pide como «exclusión obligatoria».
Decisión:
- Regla nueva RN-E17: un plan no lleva un alimento enlazado a una alergia o intolerancia activa del paciente, tampoco dentro
  de una receta del menú. No se guarda ni se publica (NC-NUT-015, con cuál, dónde y por qué), y el editor lo muestra en lo
  que falta para publicar mientras se escribe. Una intolerancia excluye igual que una alergia (07 §12). Al resolver la
  condición deja de excluir y sus enlaces se conservan: al reactivarla, vuelve.
- El enlace lo hace quien atiende, condición por condición, en «Condiciones, objetivos y notas». El nombre de la condición
  nunca se compara con el de los alimentos: «Lactosa» no se parece a «Leche», y comparar textos daría una falsa seguridad.
  Sin enlaces no se bloquea nada, y la pantalla lo dice.
- El recetario es de la organización y no tiene paciente: ahí no hay con qué comparar, así que crear una receta no cambia.
  La receta se bloquea cuando entra al plan de ese paciente, con sus ingredientes actuales.
- Lo publicado no cambia (RN-E15). Si se enlaza un alimento que lleva el plan vigente, GET /food-exclusions y el aviso de
  Dieta lo dicen. La versión nueva se crea igual, porque es como se corrige, y no se publica hasta quitarlo.
- nutrition.food_exclusion vive en nutrition, sin claves foráneas hacia clinical ni food, para que clinical no dependa de food.
  ClinicalApi.dietaryConditions entrega solo las alergias e intolerancias activas.
- Escribir exige lo mismo que el expediente (RN-A05, RN-B01) y queda auditado (nutrition.exclusion.changed, solo con el
  nombre del campo). Leer deja su READ (RN-B03). El paciente no lo ve. Códigos NC-NUT-016 (no es una alergia o intolerancia
  activa) y NC-NUT-017 (el alimento no existe para la organización).
Consecuencias:
- Mientras no se publique otra versión, un plan vigente con un alimento recién enlazado se sigue viendo en la app del
  paciente. El aviso en rojo le dice al coach que lo corrija; la app no lo retira sola.
- El registro diario del paciente no se bloquea: anota lo que comió, aunque sea un alimento excluido.
- Se borró de git un temporal que entró por error en P10 (`composition-editor.tsx.tmp.*`) y .gitignore ya los ignora.
- Para Notion (/notion-sync de P12): 03 RN-E17 (nueva); 07 §12 (exclusión) y §15 (P-17 resuelta); 05.2 (`food_exclusion`);
  02 §3 (`ClinicalApi.dietaryConditions`, las rutas de food-exclusions); los códigos NC-NUT-015 a NC-NUT-017.


## ADR-075 · Seguridad antes de prescribir: perfil, cribado, postura y pruebas físicas — aceptada (2026-10-31)
Contexto: P12, PR 4 (RF-41, RN-F15; 07 §2 a §4). El motor ya decide las tres llaves (ADR-070); falta de dónde salen sus datos
y las pantallas del coach.
Decisión:
- Cada dato vive en su contexto. Perfil de entrenamiento en `training` (módulo nuevo, `training.athlete_profile`, una revisión
  por cambio). Cribado en `clinical` (`clinical.pre_exercise_screening`, una fila por respuesta). Postura y pruebas físicas en
  `assessment`, como evaluaciones `MOVEMENT` y `FITNESS` que heredan evaluador, fecha, cierre y enmienda (RN-D08), con una fila
  por prueba (`movement_screen`, `physical_test_result`) y los catálogos globales `movement_test` (14) y `physical_test` (15).
  `TrainingSafety` en `training` junta los tres por sus API públicas y el motor decide.
- La llave de la postura lee las pruebas de la última evaluación cerrada y las de todos los borradores: el dolor no espera al
  cierre, y un borrador sin dolor (o una enmienda a medias) no abre la llave. Sin evaluación cerrada no se bloquea y la pantalla
  avisa (ADR-070). De los cribados manda el más reciente: uno nuevo vuelve a pedir revisión aunque el anterior la tuviera.
- La revisión del cribado se escribe una sola vez, solo en rojo o ámbar y nunca como paciente, con un disparador además de la
  regla del caso de uso. Por eso app_user solo tiene UPDATE de las columnas de revisión.
- Las evaluaciones funcionales no se mezclan con la antropometría: `find` y `listByPatient` del store antropométrico filtran
  por tipo, así que `/evaluations`, cálculo, comparación, fichas y prescripción no las ven, y el consumidor del cálculo ignora
  su cierre. Tienen sus rutas, `/functional-evaluations`. En la línea de tiempo salen con su nombre.
- Evidencia de una prueba: archivo PDF, PNG o JPEG de hasta 5 MB (ADR-038) o enlace https a una carpeta restringida, con la
  columna `evidence_url`, que no está en 05.2. Las dos exigen el consentimiento IMAGES vigente (07 §4, RN-B01, NC-CLI-031).
- No existía ningún texto de consentimiento IMAGES, así que la regla habría impedido toda evidencia. Se agrega como
  `0.1-provisional`, igual que los otros dos (migración `202610310100_images_consent_text`): lo ve Rodrigo y pasa por el abogado
  del cliente con los demás textos legales antes de la entrega. No entra al alta del paciente: se otorga en Consentimientos.
- Por ahora el cribado lo registra el equipo en consulta. Responderlo desde la app, MENSTRUAL_TRACKING y por lo tanto
  `hormonal_contraception` llegan en P13: la columna no se crea hasta entonces.
- El resumen de pruebas físicas da un valor por prueba y momento: de dos evaluaciones del mismo momento vale la más reciente
  que la midió.
- El perfil rechaza los decimales que sus columnas no guardan, como las pruebas físicas: 7,75 horas de sueño se responde con un
  error y no se guarda como 7,8 (RN-D09).
- Códigos: NC-CLI-029 (cribado no encontrado), NC-CLI-030 (no se puede revisar), NC-CLI-031 (falta IMAGES), NC-ASM-022 a
  NC-ASM-026 (evaluación o prueba no encontrada, evaluación vacía, evidencia no admitida, falta el archivo), NC-TRA-001
  (conflicto de revisión) y NC-TRA-002 (equipo o prueba que no existe).
Consecuencias:
- Un borrador con dolor sigue bloqueando hasta que se corrija la prueba o se quite. No hay cómo descartar un borrador entero.
- Quitar un archivo de un borrador no borra sus bytes, porque una revisión puede compartirlo con la evaluación original. Queda
  guardado sin ruta de acceso.
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir el perfil, los cribados con su texto libre, las
  pruebas y su evidencia, también esos archivos que ya no tienen ruta.
- Revocar IMAGES impide evidencia nueva, y también volver a guardar una prueba que lleva un enlace hasta quitarlo. Lo ya
  registrado se conserva en solo lectura.
- La propuesta (PR 5) todavía no consume `TrainingSafety`: esta entrega muestra el estado, y el bloqueo real de generar y
  publicar llega con ella.
- Para Notion (/notion-sync de P12): 05.2 (`evidence_url` en las dos tablas, sin `hormonal_contraception` hasta P13,
  `evaluation_moment_only_fitness`, `guard_screening_review`, `screening_by_patient`); 05.1 (texto IMAGES); 02 §3 (módulo
  training y sus rutas, `/functional-evaluations`, `/screenings`, `ClinicalApi.latestScreening`, `ensureImagesConsent`,
  `lockPatient`, `AssessmentApi.movementKeys`, `physicalTestCodes`); 02 §8 (eventos `assessment.functional.recorded` y
  `.removed`, `clinical.screening.recorded` y `.reviewed`, `training.profile.revised`); los códigos de arriba.

## ADR-076 · La interfaz oculta lo que la API negaría en el expediente — aceptada (2026-10-31)
Contexto: quien no estaba en el equipo de atención veía «Nueva evaluación» y los formularios de Condiciones, Objetivos y Notas,
y al usarlos recibía un 403 (NC-CLI-013). Rodrigo pidió recordarlo (2026-10-18) y aprobó hacerlo (2026-10-31). Las pantallas de
P12 ya lo respetaban. apps/web/CLAUDE.md: «La interfaz oculta lo que el rol no puede; decide la API».
Decisión:
- La web aplica las mismas tres reglas que la API (`features/patients/record-access.ts`, espejo de `clinical-rules.ts`):
  - `writesRecord` (canWriteRecord): datos de salud. Historia, condiciones, objetivos, notas, evaluaciones, métodos del paciente,
    energía, dieta y entrenamiento. Solo el equipo con WRITE, también frente al dueño.
  - `writesClinical` (canWriteClinical): datos de la ficha, consentimientos e invitación a la app. El dueño o el equipo con WRITE.
  - `managesPatient` (canManagePatient): archivar, reactivar, cambiar de responsable y armar el equipo. El responsable, el dueño
    o un administrador.
- Lo que no se puede no se muestra, y un aviso dice por qué con un enlace a la Ficha (`CareTeamNotice`). Dice «necesitas estar en
  su equipo de atención» y no «agrégate», como proponía el recordatorio, porque un colaborador no puede agregarse solo.
- Se lee lo que se puede leer: una evaluación en borrador se ve con sus campos deshabilitados, un plan en borrador con su vista
  de solo lectura, y entrar por la URL a una pantalla de creación muestra solo el aviso.
- Un paciente archivado y una organización en solo lectura no cambian: esos controles siguen deshabilitados.
Consecuencias:
- La API sigue decidiendo y sus pruebas no cambian. Si cambia una regla en `clinical-rules.ts`, hay que cambiarla también en
  `record-access.ts`.
- La pestaña Historia ya lo hacía a su manera (ADR-072) y queda como estaba.

## ADR-077 · Programa de entrenamiento: manual o propuesta, por semanas, con aprobación por bloque — aceptada (2026-10-31)
Contexto: P12, PR 5 (RF-26, RN-F01 a RN-F04, RN-F10, RN-F12 a RN-F14). El motor ya da la propuesta y el macrociclo (ADR-070) y
las llaves se conocen por el PR 4 (ADR-075); falta el agregado, publicarlo y que llegue a la app.
Decisión:
- Dos orígenes. A mano (`MANUAL`) nace vacío y se le agregan mesociclos, contiguos (02 §7). La propuesta (`PROPOSAL`) sale del perfil vigente
  con las semanas de su macrociclo y guarda la versión de la tabla de fases, la de la plantilla y el perfil que usó; sus mesociclos no se
  agregan ni se quitan.
- Se edita de a una semana (`PUT /training-programs/:id/weeks/:weekId`), no el árbol entero: un macrociclo de 12 semanas pasa de 1000 series
  y no cabe cómodo en un pedido. Duplicar copia las sesiones a las semanas de destino, reemplaza lo que tuvieran y no toca su fase.
- La aprobación es por bloque: el día y el orden en la plantilla, en todas las semanas (`POST .../blocks/approve`), con sustitución y nota. Un
  bloque se repite en cada semana, y aprobar 384 filas una por una no sería una revisión. Lo que es de la propuesta (patrón, sugerido,
  aprobación) no viene del navegador: el servidor lo conserva por fila, y cambiar el ejercicio de una fila le quita la aprobación.
- Publicar una propuesta exige todos los bloques aprobados y las llaves abiertas (RN-F14, RN-F15), también si se cerraron después de generarla.
  A mano se permite con una llave cerrada (ADR-070): la pantalla avisa y el evento lleva `closedKey` para la auditoría.
- El snapshot congela los músculos, la precaución y las variantes de cada ejercicio (RN-F11, RN-F12), con su hash. Un borrador se arma con la
  biblioteca de hoy; publicado se lee del snapshot. Las series por músculo las da `FRACTIONAL_SETS` con su método (RN-F06, RN-D01). Los hijos
  de un programa publicado tampoco cambian en la base (`guard_program_children`), como los de un plan.
- La fórmula de 1RM es del paciente (RN-F04): el primer programa la elige, Epley por defecto; los siguientes la heredan y no aceptan otra.
- La tabla de fases de la V3 entra por la migración, y una prueba comprueba que coincide con `seeds/training/periodization-v3.json`. Vale la
  versión más reciente de la organización si tiene una; si no, la de la V3.
- tracking guarda la copia del programa en `active_plan_view` y la meta de entrenamiento del día en `daily_target`: `planned_sessions` y
  `planned_sets`. Sigue 07 §8: los días 1 a N de cada semana son las sesiones 1 a N y los demás, descanso; una sesión con su día de la semana va
  ese día. El snapshot lleva un `schedule` corto para que el trabajo de cada hora no lea el programa entero.
- Corrige un hueco de P9: `setDailyTarget` en modo KEEP hacía `DO NOTHING`, así que una fila creada por el programa dejaba el día sin la meta de
  la dieta. Ahora completa la fila si le falta. Lo mismo a la inversa.
- Códigos: NC-TRA-003 a NC-TRA-019.
Consecuencias:
- Un día sin sesión tiene meta con `planned_sessions` 0: descansar es la meta del día, no la falta de ella. Fuera del programa no hay fila.
- `template_version` no está en 05.2: hace falta en el borrador, porque la plantilla puede cambiar entre generar la propuesta y publicarla.
- El plan semanal no lleva las kcal por tipo de día (P-08, sin responder): solo entrenamiento y descanso.
- El bloque de acondicionamiento sigue la plantilla (3 series de 8 a 12): la V3 no lo prescribe en minutos. El coach puede cambiarlo a duración y
  MET (RN-F10).
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir los programas y sus snapshots.
- El snapshot lleva las notas del coach y la nota de sustitución, que pueden hablar de una lesión: la app del paciente (P13) no debe
  mostrarlas sin que se decida.
- Para Notion (/notion-sync de P12): 05.2 (`template_version`, `program_published_has_snapshot`, `program_one_draft`,
  `prescribed_exercise_approved_together`, `guard_program_children`, `program_by_patient`, índices de los hijos); 02 §3 (rutas de `training-programs`, `TrainingApi`) y §8
  (`training.program.created` y `.updated`); los códigos de arriba.

## ADR-078 · Programa en la web: una semana a la vez, guardar a la vista y aprobar por bloque — aceptada (2026-10-31)
Contexto: P12, PR 6 (RF-26, RN-F12 a RN-F15). La API del programa está en ADR-077; faltaban sus pantallas.
Decisión:
- Dos rutas dentro de Entrenamiento: `programas` (la lista, generar la propuesta y crear a mano) y `programas/:programId` (el editor o la lectura).
  Un solo editor para los dos orígenes: a mano suma los mesociclos; la propuesta suma la aprobación por bloque.
- La semana se escribe como texto en el navegador y se valida con el mismo contrato de la API (`saveProgramWeekSchema`), diciendo dónde está lo
  que falla; lo que solo sabe la API vuelve en su lista de problemas. Lo que la pantalla no edita (`distanceM`, `supersetGroup`) se conserva al guardar.
- Con cambios sin guardar no se cambia de semana, no se aprueba, no se quita un mesociclo, no se duplica y no se publica: al guardar después, esos
  cambios pisarían lo que pasó en medio, como una sustitución recién aprobada.
- Sin panel lateral: la tabla de series necesita todo el ancho. Guardar es una barra fija que aparece solo con cambios; publicar va junto al
  encabezado. En el celular, guardar quedaba al final de una página muy larga.
- Una sesión con 4 ejercicios o más empieza cerrada: una semana de propuesta son 32 filas, y así se ve entera.
- La aprobación muestra las series de la primera semana en la que aparece el bloque, rotuladas con su semana, porque cambian con el factor de volumen.
  Si en alguna semana el bloque tiene otro ejercicio, lo dice: la API aprueba por día y orden, así que aprobarlo también aprueba ese.
- Sustituir solo ofrece ejercicios del patrón del bloque (RN-F14).
- No hay «aprobar todos»: RN-F14 pide aprobar o sustituir cada ejercicio. Aprobado uno, el foco pasa al siguiente, y con el teclado se recorre rápido.
- Duplicar marca por defecto las semanas vacías; reemplazar una semana con sesiones pide confirmación.
- Las series de la semana por grupo muscular son la suma, en la web, de lo que da la API por sesión (RN-F06), con su método.
- `Select` de `@nutricoach/ui` gana `hideLabel`: dentro de una tabla, la cabecera nombra la columna y la etiqueta queda para el lector de pantalla.
Consecuencias:
- Dos personas en el mismo borrador: quien guarda después recibe el 409, se trae lo vigente y lo que escribió sigue en su formulario. Si guarda de
  todos modos, su semana reemplaza a la otra.
- El criterio 1 de P12 (armar y publicar en menos de 5 minutos) lo recorre la E2E con un robot; el tiempo de una persona se mide en la demo.
- Sin cambios de datos ni reglas: no hay nada nuevo para Notion, salvo los textos de la lista de ADR-077.

## ADR-079 · Ficha de la rutina: lo publicado, con las semanas iguales juntas — aceptada (2026-10-31)
Contexto: P12, PR 7 (RF-24, RN-H01 a RN-H04). documents ya tenía el tipo `TRAINING` y el origen `TRAINING_PROGRAM` desde P11 (ADR-064), sin
plantilla; 02 §8 pide generar la ficha al publicarse el programa. 07 no describe la ficha impresa.
Decisión:
- La ficha sale del snapshot del programa publicado (RN-F12), como las del plan: el worker la genera al recibir `training.program.published` y se
  pide desde el panel. La firma quien publicó (RN-H03) y su fecha es la de la publicación (RN-H02). La edad es la del primer día del programa.
- Plantilla `TRAINING@1.0.0`: el programa con su fórmula de 1RM rotulada como estimada (RN-F04); el macrociclo con la versión de su tabla de fases
  (RN-F13); cada semana con su plan de 7 días (07 §8), sus sesiones y las series por grupo muscular con su método (RN-F06, RN-H04); y cada
  ejercicio una vez, con sus músculos, su precaución, su alternativa y sus variantes (RN-F11).
- Las semanas que se imprimen igual van juntas («Semanas 2 y 6»): una propuesta de 12 semanas pasa de 380 filas de ejercicios y casi todas se
  repiten con las mismas series y el mismo RIR. Así sale en 8 páginas. Solo se juntan si además cuentan los mismos músculos.
- Las series iguales de un ejercicio van en una línea; si cambian (un calentamiento), en una tabla. El título de la semana, su plan y sus series por
  músculo no se cortan entre páginas; una sesión sí, entre ejercicios.
- Van las notas de la sesión y del ejercicio, que el coach escribe para el paciente, como las indicaciones de un plan. No van la nota de la
  sustitución ni quién aprobó: son de la aprobación (ADR-077).
- El plan semanal pasa a `@nutricoach/contracts` (`weekPlan`, `sessionDay`): la pantalla del programa y la ficha dicen lo mismo.
- `TrainingApi.programStatus` distingue un borrador (422, NC-DOC-002) de lo que no existe o no se ve (404), como en los planes.
- La plantilla global entra por la migración `202610310400_documents_training_template`. El botón «Descargar ficha (PDF)» va en el programa
  publicado o reemplazado, también para quien solo lee (RN-A02).
Consecuencias:
- Una nota del ejercicio que mencione una lesión sale en la ficha: es lo que el coach escribió para el paciente. La app del paciente (P13) puede
  seguir el mismo criterio.
- Un cambio visual sube la versión de la plantilla y la 1.0.0 se sigue dibujando igual (RN-H02).
- Para Notion (/notion-sync de P12): 04 RF-24 (la ficha de rutina queda hecha en P12, antes de la Demo 3); 02 §3 (`TrainingApi.programStatus` y
  `TRAINING_PROGRAM` como origen de `POST /patients/:id/documents`); el texto de NC-DOC-002.

## ADR-080 · App del paciente: decisiones de P13 y recuperación del día en el motor — aceptada (2026-11-01)
Contexto: P13 (RF-27 a RF-29, RN-G01 a RN-G17). Rodrigo aprobó el plan el 2026-11-01, con cinco decisiones que Notion no fija. El PR 1 trae el
cálculo del día de la plantilla V3 (07 §9), que es la base de la indicación que ve el paciente en Hoy.
Decisión:
- `READINESS_JV` 3.0.0 en el registro de métodos, con su sobre (RN-D01): carga sRPE (minutos × RPE), rendimiento (real ÷ planificado × 100, con
  tope de 120 %), las cuatro partes de la recuperación (sueño, FC en reposo, HRV y subjetiva), su promedio y la indicación (RN-G14, RN-G15). Semver
  y no «V3» como dice el comentario de 05.2, igual que `PRI_JV` (ADR-070).
- Los umbrales de la organización son un insumo: el método los recibe de `training.readiness_threshold` y quedan en el hash. Las constantes de las
  fórmulas (6 puntos por latido, piso de 20, tope de 120 %, síntomas en 3) son del método y cambian con su versión (05.2).
- Un dato que falta no es cero: una parte sin su dato del día o sin su línea base vale el neutral de la organización y queda marcada. La parte
  subjetiva promedia solo lo respondido (P-02). La recuperación se calcula si el día tiene al menos un dato de recuperación (sueño, FC, HRV o una
  respuesta subjetiva); con solo la sesión o los síntomas no hay recuperación ni indicación: «Completa tu registro diario».
- P-19, pregunta nueva para Jeremy: la fórmula de la FC no tiene tope y con la FC bajo la basal pasa de 100, aunque la recuperación se declara de
  0 a 100. Se construye con tope de 100, como el sueño y la HRV.
- Funciones puras `srpeLoad`, `performancePct` y `dailyIndication` para la API y la web. Insumos fuera de rango: NC-ENG-406 (registro diario,
  RN-G11), NC-ENG-407 (línea base) y NC-ENG-408 (umbrales). El motor pasa a 1.5.0.
- Decisiones aprobadas para los PR siguientes:
  - un alimento sin carbohidratos, proteína o grasa (58 de los 928 de la TPCA) se registra igual: esas columnas de `tracking.food_log` aceptan
    vacío y el total del día muestra «al menos» (RN-I03), en vez del NOT NULL de 05.2;
  - rendimiento del día (P-09): el real es el tonelaje registrado de la sesión (RN-F03) y el planificado, el tonelaje prescrito solo si la sesión
    tiene kg y repeticiones fijas; con RIR o rangos queda vacío y el paciente puede escribirlo, y sin ambos la indicación usa solo la recuperación;
  - la anticoncepción hormonal es un sí o no opcional del perfil de entrenamiento, lo registra el coach y solo con MENSTRUAL_TRACKING vigente;
  - la ventana para crear, corregir o anular registros es de 3 días (RN-G10), ajustable por la organización de 0 a 7;
  - las fichas en la app del paciente pasan a P14, junto con la evolución (reemplaza la consecuencia de ADR-067).
- Lo que se toma de Notion sin preguntar: una comida de un plan por intercambios suma los valores del grupo por porción (guía de dominio §7.1),
  con la porción que el plan da a ese tiempo por defecto; la app muestra las notas del coach de la sesión y del ejercicio, no la de sustitución
  (07, P-18); en P13 los umbrales solo se leen y editarlos es de P14.
Consecuencias:
- G-36 a G-38 en verde, con G-01 a G-35 y G-40 iguales.
- Para Notion (/notion-sync de P13): 02 §9 (`READINESS_JV` en la familia de entrenamiento); 05.2 (`method_version` 3.0.0 de `daily_readiness`);
  07 §9 (qué es «al menos un dato») y §15 (P-19); los códigos de arriba.

## ADR-081 · Registros del paciente por /me y la app: comida, agua, notas, peso, ajustes y mensajes — aceptada (2026-11-01)
Contexto: P13, PR 2 (RF-27, RF-28, RN-G01 a RN-G10, RN-G12). 02 §10 pide rutas /me donde el paciente nunca envía su id; no existían.
tracking solo tenía la copia del plan y las metas del día, y content no tenía módulo.
Decisión:
- Regla de acceso `@PatientOnly`: solo sesiones PATIENT (otra, 403 NC-PLT-013). La organización y el paciente del contexto salen de la sesión,
  y la organización se lee con el contexto del paciente: suspendida o cerrada, 403; en solo lectura no acepta registros (422, RN-A02).
- Rutas: GET /me/today, /me/plan?date=, /me/days/:date, /me/foods?q= y /me/app; POST /me/food-logs, /me/food-logs/:id/correct y /void,
  /me/hydration-logs (y /void), /me/notes, /me/metrics (y /void).
- Una comida sale del plan o del catálogo (RN-G05):
  - intercambios: un alimento permitido del grupo y del tiempo, con las porciones del tiempo por defecto, que suman los valores del grupo por
    porción (guía de dominio §7.1);
  - composición: el alimento del tiempo por sus nutrientes por 100 g, con los gramos del plan por defecto;
  - menú: la opción del día, con un registro por alimento o receta;
  - catálogo: queda fuera del plan.
  Los nutrientes se congelan; uno que falta queda sin dato y el total dice «al menos» (RN-I03): kcal y macronutrientes aceptan NULL en
  `food_log` (migración `202611010000_tracking_records`, ADR-080).
- RN-G08: índice único (paciente, clientId, día) en cada tabla de registros; 05.2 lo tenía solo en comidas. Un reintento devuelve lo de la
  primera vez con 200, aunque el día ya esté cerrado. La opción de un menú deriva un clientId por registro (UUID v8 con SHA-256), así el
  reintento los encuentra todos. La Idempotency-Key de la petición sigue valiendo.
- RN-G10: el ajuste `tracking.edit_window_days` de tenancy, 3 días por defecto, de 0 a 7, en la fecha local del paciente (RN-G04).
- RN-G12: corregir anula el registro y lo reemplaza en su mismo día (`replaced_by_id`); anular solo cambia el estado. Una nota no se anula.
- El plan vigente se lee de su snapshot en `active_plan_view` con su `validFrom`: `effective_from` es de la fila, que comparten el plan y el
  programa. Antes de esa fecha, lo del plan no se registra (NC-TRK-003). La sesión de Hoy sale del snapshot del programa, desde su primer día.
- Peso en casa: la métrica global `BODY_WEIGHT` (20 a 300 kg, RN-C04), solo si la app lo permite. `tracking.metric_definition` no tenía RLS
  y cualquier sesión podía cambiarla: pasa a catálogo global, como los de ADR-052 (migración `202611010100`).
- content: ajustes de la app del paciente (tema #rrggbb, bienvenida, secciones y peso) y mensajes motivacionales. Los del paciente los
  escribe su equipo con acceso de escritura, sin exigir HEALTH_DATA porque no son datos de salud (`ClinicalApi.ensurePatientWritable`);
  los de todos, el dueño o un administrador. Nada se borra: un mensaje termina con su fecha de fin. El de hoy: los del paciente antes que los
  de todos, y rota cada día entre los vigentes.
- Eventos (02 §8): `tracking.food.logged` y `.voided`, `tracking.hydration.logged` y `.voided`, `tracking.metric.logged` y `.voided`, y
  `tracking.note.logged`, solo con el paciente, el día y si fue del plan. `content.settings.changed`, `content.message.created` y `.updated`
  van a la auditoría con los nombres de los campos (RN-B03). Los registros del paciente no se auditan: son su diario y los lee la analítica
  (05 §8).
- Códigos: NC-TRK-001 a NC-TRK-009, NC-CON-001, NC-CON-002 y NC-PLT-013.
Consecuencias:
- La sesión del día en Hoy da su nombre y cuántos ejercicios; el detalle llega con el entreno (PR 4).
- Para Notion (/notion-sync de P13): 05.2 (kcal y macronutrientes con NULL en `food_log`, los índices `*_idem` y `*_day`, `BODY_WEIGHT` y
  la RLS de `metric_definition`); 02 §3 (`ContentApi`, `ClinicalApi.ensurePatientWritable`, `TenancyApi.trackingEditWindowDays`), §7
  (registros), §8 (`tracking.*.voided` y `content.*`) y §10 (`@PatientOnly` y las rutas /me); 06 (los códigos).

## ADR-082 · Pantallas de la app del paciente: Hoy registra, el plan, Más y su app en el panel — aceptada (2026-11-01)
Contexto: P13, PR 3 (RF-27, RF-28, RN-G05, RN-G06, RNF-03, RNF-17). Las pantallas de /mi eran de muestra; la API llegó con el PR 2
(ADR-081).
Decisión:
- Hoy es la pantalla de inicio y desde ella se registra: el saludo y el mensaje del día (o la bienvenida), lo que va del día frente a la
  meta (kcal y macronutrientes, con «al menos» si falta un dato, RN-I03), las comidas del plan, el agua, la sesión del día y lo
  registrado, con «Anular».
- Tres toques desde Hoy (RN-G06): el tiempo de comida, un alimento permitido o la opción del menú, y «Registrar» con la porción del
  plan. Antes de registrar, la porción cambia con «menos» y «más» de 44 px; si es la del plan, el pedido no la envía y la API usa la
  suya.
- Plan: las indicaciones, la meta de agua, las mismas comidas para registrar y algo fuera del plan desde el catálogo, con su cantidad y
  su momento.
- Más: notas para el equipo, el peso si está habilitado, instalar la app (el aviso del navegador en Android y Chrome; en el iPhone,
  «Agregar a inicio») y salir.
- Cada registro genera su clientId en el celular y lo usa también como Idempotency-Key; un reintento repite los dos (RN-G08). La cola
  sin conexión (RF-31) no entra en este PR.
- El color del tema del paciente pinta los tokens de marca (ADR-027) y la barra inferior muestra solo las secciones habilitadas: Plan,
  Entreno y Progreso; Hoy y Más siempre están.
- Panel: la pestaña «App del paciente» del expediente, con sus ajustes y sus mensajes (su equipo con acceso de escritura); en Ajustes,
  el plazo de los registros (0 a 7 días) y los mensajes para todos (dueño y administradores).
Consecuencias:
- E2E `e2e/app-paciente.spec.ts`: el desayuno del plan en tres toques desde Hoy, anular, agua, nota y peso; el equipo cambia el tema y
  el mensaje, y Hoy los muestra. 2 de 2 en escritorio y 2 de 2 en el celular.
- Lighthouse móvil en Hoy con plan, agua y mensaje (local, 5 corridas): rendimiento 96 de mediana y accesibilidad 100. LCP de 2.11 a
  2.73 s, con mediana de 2.12 s: la variación de la fuente que ya estaba anotada.

## ADR-083 · Registro diario, indicación del día, entreno, MENSTRUAL_TRACKING y cribado del paciente por /me — aceptada (2026-11-02)
Contexto: P13, PR 4a (RF-29, RN-G11, RN-G12, RN-G14, RN-G15, RN-G17, RN-F03, RN-F06; 07 §2, §3.2, §9 y §11; ADR-080). El motor ya calcula
el día (PR 1); faltaban dónde guardarlo, cómo lo registra el paciente y lo que el paciente no puede leer. El PR 4 se divide en 4a (API) y
4b (pantallas): P13 queda en 6 PR.
Decisión:
- Migración `202611020000_tracking_daily_readiness`:
  - MENSTRUAL_TRACKING en el CHECK de `clinical.consent`, con su texto 0.1-provisional, que revisa el abogado;
  - `training.athlete_profile.hormonal_contraception` (sí, no o vacío);
  - `training.readiness_threshold`, catálogo con RLS (`enable_catalog_rls`) que el paciente no lee: una fila global con los valores de
    07 §11 desde 2026-10-21; la de la organización, si existe, manda. En P13 solo se lee; editarlo es de P14;
  - las columnas del registro diario en `tracking.daily_checkin` (07 §9), con sus rangos;
  - `tracking.daily_readiness`, particionada por mes: el resultado del motor por registro diario, con método, versión, versión del
    motor, umbral, insumos y su hash (RN-D01). Disparador de restricción hacia el registro diario (ADR-024), equipo de atención, el
    paciente lee y escribe lo suyo y solo se actualiza `status`. Entra en la lista cerrada de particiones y en `PARTITIONED_TABLES`;
  - `app.readiness_basis(fecha)`, SECURITY DEFINER y solo para la sesión PATIENT: la línea base de su perfil vigente y el umbral vigente.
    No devuelve nada más del perfil.
- Migración `202611020100_tracking_set_log_by_workout`: índice de `set_log` por entreno, para su tonelaje y su anulación.
- Migración `202611020200_tracking_readiness_account_scope`: ACCOUNT no ve la recuperación, como el resto de los registros (P6).
- Registro diario (POST /me/checkins y /:id/void): uno vigente por día. Registrarlo otra vez anula el anterior y deja su recuperación
  SUPERSEDED (RN-G12). La recuperación se calcula con `READINESS_JV` en la misma transacción y se guarda con el umbral usado. Anular el
  registro deja Hoy sin indicación. Con síntomas del ciclo exige MENSTRUAL_TRACKING vigente (NC-CLI-032, RN-G17); sin síntomas, no.
- Rendimiento del día (P-09, ADR-080):
  - si el paciente registró ese día sesiones del programa, no omitidas y con tonelaje, el planificado es su tonelaje prescrito, solo si
    todas tienen kg y repeticiones fijas, y el real, su tonelaje registrado. Una sesión marcada hecha sin series o sin peso no cuenta:
    no dice nada del rendimiento y no debe valer 0 % ni dar amarillo;
  - si no, vale el par que escribe el paciente. Las dos fuentes no se mezclan, porque pueden estar en unidades distintas;
  - anular un entreno no recalcula el registro diario ya hecho (RN-D08): el paciente lo vuelve a registrar.
- Entreno (POST /me/workouts y /:id/void):
  - exige programa vigente: desde su primer día hasta su última semana (NC-TRK-010). Fuera de ellas, el registro diario tampoco lleva
    programa;
  - una sesión omitida no lleva series (contrato);
  - la sesión debe ser del snapshot y se guarda en su semana, aunque se haga otro día;
  - cada ejercicio, de esa sesión o, sin sesión, del programa (NC-TRK-011). La alternativa y las variantes todavía no se registran: no
    traen sus músculos en el snapshot;
  - cada serie congela el nombre del ejercicio y sus músculos, principal 1 y secundario 0.5 (RN-F06), y la base calcula su tonelaje sin
    el calentamiento (RN-F03). Su clientId sale del de la petición (UUID v8, como los del menú);
  - 05.2 no tiene columna de duración: `finished_at` es el momento del registro y `started_at`, ese momento menos los minutos; sin
    minutos, los dos quedan vacíos.
- Lecturas:
  - GET /me/training: la semana del programa con su fase y su RIR objetivo, las sesiones de hoy como las ve el paciente (sin la nota de
    la sustitución, ADR-079) con su tonelaje prescrito, lo registrado y el registro diario;
  - GET /me/today trae la recuperación de hoy y GET /me/days/:date, el registro diario y los entrenos del día;
  - los textos de cada indicación y la nota visible de 07 §9 están en contracts (`INDICATION_TEXTS`, `READINESS_NOTE`) para la web.
- clinical, para el paciente:
  - GET y POST /me/consents, y POST /me/consents/MENSTRUAL_TRACKING/revoke: solo esa finalidad, por el canal APP y con el texto vigente;
  - GET y POST /me/screening: el cribado lo responde él; en rojo o ámbar espera la revisión del coach (RN-F15).
- La anticoncepción hormonal la registra el coach en el perfil y, si no está vacía, exige MENSTRUAL_TRACKING vigente (NC-CLI-032).
- `RecordGate` reúne lo que todo registro comprueba: HEALTH_DATA, la ventana y su evento. Lo usan `RecordCommands` y el nuevo
  `TrainingLogCommands`.
- `Idempotency-Key` obligatoria en toda escritura de las rutas `@PatientOnly`, como pide 06 §5: sin ella, 400 NC-PLT-004. Hasta el PR 2 era
  opcional y solo el clientId protegía de un reintento; `POST /me/screening` y `POST /me/consents` no tienen clientId. La web la envía en
  cada registro y al anular (`void:<id>`). El PR 4b genera una clave por cada acción en el consentimiento y el cribado: retirar y volver a
  autorizar son dos acciones.
- Eventos: `tracking.checkin.logged` y `.voided`, `tracking.workout.logged` y `.voided`, solo con el paciente y el día; nunca los síntomas
  ni la indicación.
- Códigos: NC-TRK-010 a NC-TRK-012, NC-CLI-032 y NC-PLT-004.
Consecuencias:
- Unitarias de la aplicación con dobles en memoria: `training-log.application.spec.ts` y `patient-self-service.spec.ts`. Cubren RN-D08 (anular
  un entreno no recalcula) y ADR-042 (un menor de 14 no autoriza desde la app). Contratos: los esquemas nuevos y los textos de 07 §9.
- E2E `e2e/app-paciente.spec.ts`, porque anular cambió en la web: 2 de 2 en escritorio y 2 de 2 en el celular con WebKit.
- Integración: en `patient-app.int.spec.ts`, la clave obligatoria. `test/integration/patient-training.int.spec.ts` (14 casos, como app_user)
  cubre:
  - la sesión de hoy y su registro con series;
  - el registro diario en verde, la corrección en amarillo, anular y «sin datos»;
  - el criterio 6 de P13: sin MENSTRUAL_TRACKING se rechazan los síntomas; con él, síntomas en 3 dan rojo;
  - la anticoncepción hormonal, el cribado propio y que `app.readiness_basis` no responde a otra sesión.
- Para Notion (/notion-sync de P13):
  - 05.1: MENSTRUAL_TRACKING y `hormonal_contraception`;
  - 05.2: `readiness_threshold`, las columnas de `daily_checkin`, `daily_readiness`, el índice `set_log_by_workout` y
    `app.readiness_basis`;
  - 02: §7 (registro diario y entreno), §8 (los eventos) y §10 (las rutas /me);
  - 06: los códigos (06 §5 ya pedía la clave y no cambia);
  - 07 §9: el rendimiento de la sesión registrada, la sesión sin tonelaje y los textos ya en contracts.
- Para el PR 4b: el formulario del perfil debe enviar `hormonalContraception`, porque hoy guardarlo lo dejaría vacío; y si el paciente retiró
  MENSTRUAL_TRACKING con el valor en «sí», debe permitir vaciarlo para que el coach guarde lo demás (si no, 422 NC-CLI-032). Registrar la
  sesión después del registro diario tampoco lo recalcula (RN-D08): la pantalla debe ofrecer actualizarlo.

## ADR-084 · Pantallas del registro diario, la indicación del día, Entreno, el ciclo y el cribado — aceptada (2026-11-05)
Contexto: P13, PR 4b (RF-28, RF-29, RN-G11, RN-G12, RN-G15, RN-G17, RN-D02, RN-F11; 07 §2, §3.2 y §9). La API llegó con el PR 4a
(ADR-083); las pantallas de Entreno eran de muestra y no había registro diario.
Decisión:
- Hoy, con la sección CHECKIN a la vista, muestra la indicación del día arriba:
  - su etiqueta y su texto de 07 §9, con color, ícono y texto;
  - la recuperación con el método que la calculó (RN-D02), el rendimiento y la carga de la sesión;
  - si a la recuperación le faltó una parte, lo dice: usó el valor neutral y no cuenta como mal estado;
  - «es un consejo para hoy: tu plan solo cambia cuando tu coach lo decide», con la nota visible de 07 §9;
  - sin registro, la de «sin datos» lleva al registro diario.
- Registro diario en /mi/registro, pensado para menos de 2 minutos:
  - la sesión (duración y RPE, que vienen de la sesión registrada), el sueño, cuatro escalas de un toque (fatiga, dolor muscular,
    estrés y motivación) y la alimentación;
  - lo demás plegado y opcional: carbohidratos, el rendimiento si no sale de la sesión y los datos del reloj a mano;
  - los síntomas del ciclo, solo con MENSTRUAL_TRACKING vigente;
  - la nota visible de 07 §9 encabeza el formulario; un registro vacío no se guarda;
  - si ya se hizo, el formulario lo trae para corregirlo (RN-G12); al guardar vuelve a Hoy.
- Entreno:
  - la semana del programa con su fase, su RIR objetivo y si es de descarga;
  - la sesión de hoy por ejercicio: cada serie parte de lo prescrito y se marca hecha; se corrigen las repeticiones, el peso y el RIR
    o RPE según se prescribió; el cardio va en minutos y metros;
  - el tonelaje se ve mientras se registra, con el método TONNAGE del motor; el que vale lo da la API (RN-F03);
  - «Hoy no hice esta sesión» la deja omitida, sin series;
  - lo registrado se muestra con su tonelaje y se anula sin borrar; si ya hizo el registro diario, invita a actualizarlo (RN-D08);
  - muestra la precaución, la alternativa, las variantes, las instrucciones y el enlace al video (RN-F11). La alternativa todavía
    no se registra (ADR-083).
- Estímulo y fatiga (RF-29): se anotan una vez por ejercicio y la API los guarda en cada una de sus series, como los pide 05.2.
  Pedirlos serie por serie duplicaba las preguntas sin cambiar la analítica de RF-33.
- Más:
  - el seguimiento del ciclo menstrual con su texto vigente (0.1-provisional) para autorizarlo, y «Retirar la autorización» con
    confirmación;
  - el cribado de seguridad: las ocho preguntas de Sí o No, el detalle si alguna es Sí y su estado, si espera la revisión del coach;
  - una Idempotency-Key nueva por cada acción (ADR-083).
- Panel: el perfil de entrenamiento lleva «Seguimiento menstrual» con la anticoncepción hormonal (sí, no o sin dato), solo con la
  autorización vigente. Sin ella el campo no está y, si el paciente la retiró con un valor guardado, se avisa que la revisión nueva lo
  deja vacío; lo anterior queda en el historial.
- `@nutricoach/ui`: `NumberField` puede ir sin unidad (escalas y conteos), suma las unidades h, min, lpm, ms y m, y abre el teclado
  numérico para enteros. contracts: el tipo de número `trainingLoad` (tonelaje y carga sRPE, sin decimales).
Consecuencias:
- E2E `e2e/app-paciente.spec.ts`, 5 de 5 en escritorio y 5 de 5 en el celular con WebKit:
  - la sesión de hoy serie por serie, con el tonelaje a la vista y el registrado;
  - el registro diario desde Hoy, con la duración y el RPE de la sesión ya puestos, en menos de 2 minutos, y Hoy en verde con el
    rendimiento de 100 % (criterio de P13);
  - autorizar el seguimiento del ciclo, que hace aparecer los síntomas; la anticoncepción hormonal desde el panel; retirarlo, que los
    quita;
  - el cribado respondido desde Más.
- Lighthouse móvil en Hoy con la indicación del día (local, 5 corridas): rendimiento 97 de mediana y accesibilidad 100. LCP de 2.12 a
  2.57 s, con mediana de 2.12 s: la variación de la fuente ya anotada.
- Para Notion (/notion-sync de P13): 07 §9 (cómo se ve el registro diario y la indicación; el estímulo y la fatiga por ejercicio) y
  02 §11 (las rutas /mi/registro y /mi/entreno).

## ADR-085 · El profesional y los registros del paciente: solo lectura, ajustes con motivo y notas leídas — aceptada (2026-11-05)
Contexto: P13, PR 5 (RN-G01, RN-G02, RN-G13, RN-B03; criterio de P13: «el profesional no puede editar un registro; su ajuste queda con
autor y motivo»). Rodrigo decidió el 2026-11-05: se corrigen la cantidad y los valores; la cola sin conexión (RF-31) queda fuera de P13;
el paciente no ve los ajustes.
Decisión:
- Rutas para el equipo:
  - GET /patients/:id/records/:date: el día con sus registros vigentes, sus ajustes y los totales con y sin ajustes;
  - GET /patients/:id/app-notes/unread y POST /patients/:id/app-notes/read: las notas del paciente. `/notes` ya era de las notas
    clínicas;
  - POST /patients/:id/record-adjustments.
  Leer el día o las notas deja un READ en la auditoría (RN-B03).
- Ajustes (RN-G02): cualquier registro se excluye; se corrigen:
  - la comida: la cantidad en la unidad en que se registró (porciones si las tiene; si no, gramos), y sus nutrientes congelados se
    escalan en proporción; un nutriente sin dato sigue sin dato (RN-I03);
  - el agua: los ml; el peso: el valor, dentro de su rango (RN-C04);
  - la serie: repeticiones y peso, con su tonelaje sin el calentamiento (RN-F03); la sesión: duración y RPE;
  - el registro diario solo se excluye: corregirlo obligaría a recalcular la recuperación (RN-D08).
- El ajuste guarda lo corregido y lo que se deriva (los nutrientes, el tonelaje): la analítica de P14 lo usa sin recalcular. Vale el más
  reciente de cada registro; los anteriores quedan como historial. Motivo de 10 caracteres o más.
- Ajusta el equipo con acceso de escritura y HEALTH_DATA vigente (`ensureRecordWritable`), también frente al dueño (RN-A05). El registro
  se busca entre los vigentes de ese paciente y ese día: uno de otro paciente, de otro día o anulado no existe para el ajuste
  (NC-TRK-005); una corrección que no corresponde al registro, NC-TRK-013.
- Migración `202611050000_tracking_adjustments`: app_user pierde UPDATE sobre `log_adjustment` (un ajuste no se edita), un CHECK exige
  que excluir no lleve valores y corregir sí, y un índice parcial para las notas sin leer.
- El paciente no ve los ajustes: la política de P2 se mantiene y su app muestra lo que registró.
- Notas (RN-G13): aparecen nuevas en la pestaña Seguimiento hasta que alguien del equipo las abre; abrirlas las marca leídas por ese
  miembro (`read_by` es el miembro). /me no devuelve quién ni cuándo las leyó.
- Eventos `tracking.log.adjusted`, con los nombres de lo corregido y nunca sus valores, y `tracking.note.read`; los dos van a la
  auditoría.
- Panel: la pestaña «Seguimiento» del expediente (`/registros` ya era la de condiciones, objetivos y notas):
  - las notas nuevas arriba;
  - el día con su navegación, en la fecha local del paciente (RN-G04);
  - los totales con ajustes y lo registrado; comidas, agua y peso, entrenos con sus series, el registro diario con su método y las notas
    del día;
  - cada registro con su ajuste, su autor y su motivo, y «Ajustar» para quien escribe en el expediente.
- La cola sin conexión (RF-31, deseable) queda fuera de P13: cada registro ya lleva su clientId y su Idempotency-Key.
Consecuencias:
- Integración `test/integration/patient-records.int.spec.ts` (11 casos, como app_user); unitarias del dominio y de la aplicación;
  contratos; E2E del panel en `e2e/app-paciente.spec.ts`.
- Para Notion (/notion-sync de P13):
  - 05.2: `log_adjustment` sin UPDATE, su CHECK y lo derivado en `corrected_values`; el índice de notas sin leer;
  - 03 RN-G02: qué se corrige de cada tipo;
  - 02 §7, §8 y §10: las rutas y los eventos; 06: NC-TRK-013;
  - 04 RF-31: fuera de P13.

## ADR-086 · Plan de P14 y control semanal en el motor — aceptada (2026-11-05)
Contexto: P14 (RF-30, RF-32 a RF-35, RF-42; RN-G16, RN-F17; 07 §10 y §11). Rodrigo aprobó el plan el 2026-11-05: 7 PR, con cuatro
decisiones que Notion no fija. El PR 1 trae el control semanal al motor.
Decisión:
- `WEEKLY_REVIEW_JV` 3.0.0 en el registro de métodos, con su sobre (RN-D01): los agregados de la semana, el semáforo con sus razones, el
  factor ajustado y la decisión sugerida (07 §10). Semver y no «V3» como dice el comentario de 05.2; la mayor sigue a la plantilla V3, como
  `READINESS_JV` (ADR-080).
  - Los umbrales de la organización son un insumo (`training.readiness_threshold`); × 0.75, × 0.90 y los síntomas en 2 son del método.
  - El rendimiento de cada día es el que guardó `READINESS_JV` (con su tope de 120 %).
  - Un promedio sin dato no enciende el semáforo: la falta de un dato no es mal estado. Sin sesiones, «falta registro», sin factor
    sugerido.
  - Insumos fuera de rango: NC-ENG-409 (la semana, hasta 7 días) y NC-ENG-410 (el factor del plan y los umbrales). Motor 1.6.0.
- Proyecciones: un módulo `analytics` recalcula el día o la semana afectados desde los datos de origen, que pide a las API públicas de
  tracking, nutrition y training (tracking ya aplica el ajuste vigente, ADR-085), y reemplaza esas filas. `analytics:rebuild` usa la misma
  función: reconstruir da los mismos números. Lo que depende del paso del tiempo (días sin registro) se calcula al leer.
- Decisiones de Rodrigo:
  - adherencia por tiempo de comida (RF-32): columna `meal_slots jsonb` en `analytics.patient_daily_summary` (por tiempo, las comidas
    planificadas y las registradas), en vez de sumarla al leer;
  - alertas del panel (RF-34): sin registros en 3 días; adherencia de 7 días (días en rango ÷ días con meta, RN-G09) baja si es menor que
    80 %, la alimentación mínima de 07 §11;
  - el generador de `pnpm seed:load` de 500 pacientes con dos años de historia entra en P14, para el criterio de 300 ms; el de 3 000 y k6
    siguen en P16;
  - ajustar o descargar crea la versión nueva del programa en borrador con el factor decidido en la semana siguiente: en una propuesta se
    recalculan sus series (P-06); en un programa a mano el coach las ajusta. Publica el coach (RN-F17, RN-F12).
- Por defecto: el paciente marca `viewed_at` al abrir un recurso; la ficha de evolución usa la última evaluación cerrada como origen, sin
  cambiar el DDL de documents.
- PR: 1, motor; 2, analítica por la API; 3, control semanal por la API; 4, web de la analítica y del control semanal; 5, evolución y su
  ficha; 6, panel con alertas, material educativo y fichas en la app; 7, Demo 3 (`seed:load`, p95, `pnpm demo:3`, guion y v0.3.0).
Consecuencias:
- G-39 en verde, con G-01 a G-38 y G-40 iguales.
- Para Notion (/notion-sync de P14): 02 §9 (`WEEKLY_REVIEW_JV`); 05.2 (`method_version` de `weekly_review` en semver); 05.3 (`meal_slots`);
  07 §10 (las razones del semáforo y que un promedio sin dato no lo enciende); 04 RF-34 (los valores de las alertas); los códigos
  NC-ENG-409 y NC-ENG-410.

## ADR-087 · Analítica por la API: resumen diario, reconstrucción y analítica de dieta — aceptada (2026-11-06)
Contexto: P14, PR 2a (RF-32, RN-G02, RN-G03, RN-G09, RN-E10, RN-I03; criterios 1 a 3 de P14). Las tablas de analytics existían desde P2
(05.3), vacías y sin módulo. Rodrigo decidió el 2026-11-06 que el resumen guarde lo conocido y en cuántos registros falta cada nutriente. El
PR 2 se divide en 2a (dieta) y 2b (rutina y panel).
Decisión:
- tracking ofrece `TrackingApi` (02 §3), en la transacción de quien llama:
  - los hechos de cada día con el ajuste más reciente aplicado (RN-G02) y su meta (RN-G03): comidas (la fibra, FIBTG, en la misma proporción
    que la cantidad corregida), agua con cuántos registros cuentan, el último peso, el registro diario con su rendimiento y los entrenos con
    sus series;
  - el primer y el último día del paciente, y los pacientes con actividad desde un día;
  - una lectura de rango por tabla, con poda de particiones (`PrismaFactsStore`).
- Módulo `analytics`: `DailyProjection` recalcula los días del rango desde `TrackingApi`, `NutritionApi` (los tiempos del plan de ese día) y
  `TenancyApi` (el rango de adecuación), y reemplaza esas filas. La usan, con los mismos números:
  - el consumidor `analytics.daily-summary`, con `tracking.*.logged`, `.voided` y `tracking.log.adjusted`;
  - el trabajo `analytics.daily-refresh`, cada hora en el minuto 25: ayer y hoy de cada paciente con actividad en los últimos dos días, en su
    fecha local. Así un día con meta y sin registros también tiene su fila y cuenta para la adherencia;
  - `AnalyticsRebuild` y la CLI `pnpm --filter api analytics:rebuild --patient ID | --all`: borra lo del paciente y lo recalcula desde su
    primer día hasta hoy, una transacción por paciente.
- Migración `202611060000_analytics_daily_summary`: `meal_slots` (por tiempo, si el plan lo tenía y cuántos registros tuvo) y
  `nutrients_missing` (en cuántos registros falta cada nutriente, sobre el total), con claves en snake_case como las columnas.
- Reglas del resumen:
  - kcal y macronutrientes suman lo conocido; un día sin comidas registradas queda sin dato, no en 0; sin agua registrada, `water_ml` null;
  - la adecuación sale de `ADEQUACY` del motor contra la meta de ese día, sin redondear antes de guardarla (05.3 la guarda con 1 decimal);
  - con un dato faltante, `kcal_in_range` solo es false si lo conocido ya pasa el máximo; si no, queda sin saber («Faltan datos», RN-E10);
  - un entreno omitido no cuenta como hecho (RN-F09); el tonelaje y las series efectivas no cuentan el calentamiento (RN-F03, RN-F06).
- Analítica de dieta: `GET /patients/:id/analytics/diet?from=&to=`, con `patients.read`, la RLS del equipo de atención (RN-A05) y un READ en la
  auditoría (RN-B03). Trae:
  - los días;
  - las semanas de lunes a domingo: el promedio de los días con registros y meta, la adecuación del promedio contra la meta promedio
    (`ADEQUACY`), y los días con meta, con registros y en rango. Si en un día faltó un dato, el nutriente de esa semana es «al menos»;
  - la adherencia por tiempo de comida: días con registro sobre los días en que el plan lo tenía, y los días fuera del plan.
  Sin rango, las últimas 4 semanas hasta hoy; un rango al revés o de más de 371 días responde 400 (NC-ANA-001).
Consecuencias:
- Criterios 1, 2 y 3 de P14 en la integración (`test/integration/analytics.int.spec.ts`, 7 casos, como app_user).
- PR 2b: el volumen semanal por grupo muscular, la serie de 1RM, `patient_overview` y la analítica de rutina.
- Para Notion (/notion-sync de P14): 05.3 (`meal_slots` y `nutrients_missing`); 02 §3 (`TrackingApi`, y analytics hacia tracking, nutrition y
  tenancy), §8 (el consumidor `analytics.daily-summary` y el trabajo de cada hora) y §10 (la ruta de la analítica); 06 (NC-ANA-001).

## ADR-088 · Analítica de rutina por la API: volumen semanal por grupo, 1RM y macrociclo — aceptada (2026-11-06)
Contexto: P14, PR 2b (RF-33; RN-F03 a RN-F09, RN-G02, RN-D03). Rodrigo decidió el 2026-11-06:
- el tonelaje de una serie se reparte entre sus grupos como las series fraccionadas;
- los read models suman `srpe_load`, `cardio_minutes` y `sfr`;
- `patient_overview` pasa al PR 6, con el panel y las alertas del control semanal.
Decisión:
- Volumen semanal por grupo muscular (05.3) por semana del macrociclo: la semana n empieza el día de inicio del programa más 7 × (n − 1).
  Lo programado sale de la última versión publicada de la línea, porque una versión nueva copia las semanas pasadas tal como estaban
  (RN-F12):
  - lo hecho son las series efectivas de los entrenos de esa semana del programa (una sesión cuenta en su semana aunque se haga otro día,
    ADR-083), con `FRACTIONAL_SETS` y los músculos congelados en cada serie (principal 1, secundario 0.5);
  - el tonelaje de una serie se reparte igual: 100 % al principal y 50 % al secundario;
  - el RPE es el registrado o 10 − RIR (RN-F05); estímulo y fatiga son promedios, y el SFR sale del motor con las series que tienen las dos
    valoraciones (RN-F07);
  - el grupo CARDIO no entra (ADR-071); lo programado y no hecho queda en 0;
  - se recalcula la línea entera (hasta 12 semanas) con el consumidor de los registros (si cambió un entreno o se ajustó una serie o un
    entreno), el consumidor nuevo `analytics.training-weeks` (`training.program.published`), el trabajo de cada hora (el programa vigente)
    y la reconstrucción.
- `TrainingApi.latestPublishedOfLineage`; en tracking, `TrackingApi.programIds` (también los de entrenos anulados) y `activeProgramId`, que
  lee la copia sin bloquearla: la lectura de tracking usa FOR UPDATE y falla en una transacción de solo lectura.
- 1RM por día y ejercicio (05.3) con la fórmula del programa de cada entreno (RN-F04), con el motor: la mejor serie efectiva de 1 a 12
  repeticiones con peso. Fórmulas distintas no comparten serie (RN-D03). Se recalcula con el resumen del día.
- Migración `202611060100_analytics_training`: `srpe_load` (la carga que calculó la recuperación, RN-G14) y `cardio_minutes` (los minutos de
  las series de cardio de los entrenos hechos) en el resumen diario; `sfr` en el volumen semanal.
- `GET /patients/:id/analytics/training?programId=`, con `patients.read`, la RLS del equipo de atención y un READ en la auditoría. Da el
  macrociclo del programa vigente, o del que se pida si es del paciente (si no, 404 NC-ANA-002), con sus mesociclos y, por semana:
  - la fase, el factor de volumen y el RIR objetivo, lo programado y, si ya empezó, lo hecho;
  - sesiones, tonelaje, carga sRPE y minutos de cardio, sumados por fecha dentro de la semana, como 07 §10;
  - el cumplimiento de sesiones, de series por grupo y de minutos de cardio con `COMPLIANCE` (RN-F09: 0 sin prescripción);
  - por grupo: series fraccionadas hechas y programadas, tonelaje, RPE, estímulo, fatiga y SFR.
  Trae también el 1RM de cada ejercicio en el tiempo y el método de cada número (RN-D02).
Consecuencias:
- Integración `test/integration/analytics-training.int.spec.ts` (6 casos, como app_user): la semana con sus series y su cumplimiento, el
  tonelaje repartido, la carga sRPE, el 1RM de Epley, el ajuste de una serie que cambia la semana y el 1RM, la reconstrucción idéntica y los
  accesos. Unitarias con G-21, G-22, G-24 y G-25.
- Las sesiones de una semana cuentan por fecha y las series por semana del programa: una sesión de la semana 3 hecha en la 4 suma sus series a
  la 3 y su sesión a la 4.
- `patient_overview` y el panel con alertas pasan al PR 6.
- Para Notion (/notion-sync de P14): 05.3 (`srpe_load`, `cardio_minutes`, `sfr` y el reparto del tonelaje por grupo); 02 §3
  (`TrainingApi.latestPublishedOfLineage` y lo nuevo de `TrackingApi`), §8 (el consumidor `analytics.training-weeks`) y §10 (la ruta);
  06 (NC-ANA-002).

## ADR-089 · Control semanal por la API: cálculo al cerrar la semana, decisión del coach y umbrales editables — aceptada (2026-11-06)
Contexto: P14, PR 3 (RF-42; RN-G16, RN-F17, RN-F12, RN-G15; 07 §10 y §11; criterio 5 de P14). El motor llegó con el PR 1 (`WEEKLY_REVIEW_JV`,
ADR-086); faltaban guardarlo, calcularlo y que el coach decida.
Decisión:
- Migración `202611060200_training_weekly_review`: el DDL de 05.2, con estas diferencias y agregados:
  - `suggested_volume_factor` es numeric(5,3) y no (4,2): el factor ajustado de G-39 es 0.825;
  - `decision_note` es obligatoria con la decisión (RN-F17), de hasta 1000 caracteres, y hay un índice por paciente;
  - RLS del equipo de atención, ACCOUNT y PLATFORM_ADMIN; el paciente no lo ve;
  - UPDATE solo de la decisión y del estado. Un disparador deja decidir una vez y solo el control vigente, y el estado solo pasa a
    SUPERSEDED.
- Cálculo (`WeeklyReviewService`): cada semana cerrada del programa publicado (su último día ya pasó en la fecha local del paciente), con
  los registros diarios de esa semana y los umbrales vigentes al cerrarla (los de la organización o los de la V3):
  - una semana sin factor (un programa a mano sin tabla de fases) vale 1.0;
  - con los mismos insumos, el control vigente no cambia; con registros tardíos, se crea otro y el anterior queda SUPERSEDED con su
    decisión. Hay un solo control vigente por semana en toda la línea del programa;
  - lo hacen el trabajo `training.weekly-reviews`, cada hora en el minuto 40, y el coach al abrir el control
    (`POST /patients/:id/weekly-reviews/compute`, con `patients.write`).
- training lee los registros diarios de tracking sin importarlo, porque tracking ya importa training: `WeekCheckinSources`, que tracking
  registra al iniciar, como las fuentes de la línea de tiempo de clinical (02 §4).
- Decisión (`POST /patients/:id/weekly-reviews/:reviewId/decision`, con `patients.write` y `ensureRecordWritable`):
  - mantener, ajustar o descargar, siempre con nota (RN-F17); ajustar o descargar exige el factor;
  - mantener solo queda registrado;
  - ajustar o descargar deja la versión siguiente del programa en borrador, o usa la que ya estaba en borrador, con el factor decidido en la
    semana siguiente. En una propuesta, sus series de trabajo se recalculan con P-06 (series base × factor); en un programa a mano quedan
    como estaban. Sin semana siguiente no hay borrador;
  - `resulting_program_id` es esa versión: la semana cambia para el paciente solo al publicarla (RN-F12).
- Lectura (`GET /patients/:id/weekly-reviews`, con `patients.read` y un READ en la auditoría): los controles vigentes por semana, con las
  razones y los agregados que da el motor con los insumos guardados (RN-D01), la decisión, la versión que resultó con su estado y cuántos
  controles se reemplazaron.
- Umbrales (07 §11): `GET` y `PUT /organization/readiness-thresholds`, con `organization.read` y `organization.update`. Guardar crea la
  versión de hoy en la fecha de la organización; un segundo cambio el mismo día corrige esa versión. Lo ya calculado conserva en sus
  insumos los valores que usó (RN-D01, RN-D08), y los controles de semanas ya cerradas no cambian.
- Eventos `training.review.decided` y `training.threshold.changed`, a la auditoría con los nombres de los campos. Códigos NC-TRA-020 a
  NC-TRA-025.
Consecuencias:
- Criterio 5 de P14 y G-39 por HTTP en la integración (`test/integration/weekly-review.int.spec.ts`, 11 casos, como app_user); unitarias con
  dobles en memoria (17).
- PR 4: las pantallas del control semanal y de la analítica, y los umbrales en Ajustes. PR 6: el panel suma los controles sin decidir y el
  semáforo de la semana.
- Para Notion (/notion-sync de P14): 05.2 (`weekly_review`: el factor sugerido con 3 decimales, la nota, el índice, el disparador y un
  control vigente por semana en la línea); 02 §3 (`WeekCheckinSources`), §7 (`WeeklyReview`), §8 (`training.review.decided`,
  `training.threshold.changed`) y §10 (las rutas); 07 §10 (cuándo cierra una semana y el factor 1.0 sin tabla de fases) y §11 (la versión
  del día que se corrige); 06 (NC-TRA-020 a NC-TRA-025).

## ADR-090 · Web de la analítica y del control semanal — aceptada (2026-11-06)
Contexto: P14, PR 4 (RF-32, RF-33, RF-42; RN-G16, RN-F17, RN-F12; 07 §10 y §11). La API llegó con los PR 2a, 2b y 3 (ADR-087 a ADR-089);
faltaban las pantallas. Rodrigo decidió el 2026-11-06 tres puntos que Notion no fija.
Decisión:
- Pestaña «Analítica» en el expediente, con «Dieta» y «Rutina». Los números son los de la API, con su método a la vista (RN-D02):
  - dieta (RF-32): la semana actual y las anteriores, completas de lunes a domingo: 4, 12, 26 o 52 semanas (`?semanas=`). Muestra la
    semana más reciente con registros (energía promedio, adecuación con el rango de la organización, días en rango sobre los días con meta
    y el promedio por nutriente), la energía de cada día contra su meta, las semanas, la adherencia por tiempo de comida y el día por día,
    con enlace a Seguimiento. Un día sin registros queda vacío y no cuenta como 0; «al menos» cuando a un registro le falta el dato
    (RN-I03). Las tablas solo muestran días y semanas con comida, meta o agua: un día con solo entrenamiento también tiene resumen;
  - rutina (RF-33): el programa vigente, o uno publicado o reemplazado del paciente (`?programa=`). Tres gráficos por semana: sesiones
    registradas contra programadas, tonelaje y carga sRPE, cada uno con su propio eje. Las semanas van agrupadas por mesociclo, con fase,
    factor, RIR, sesiones, cumplimiento, tonelaje, carga y cardio. Además, las series por grupo muscular de la semana elegida
    (`?semana=`), con RPE, estímulo, fatiga y estímulo/fatiga, y el 1RM estimado en el tiempo por ejercicio, con su fórmula.
- Control semanal en Entrenamiento, junto a «Programas» (decisión de Rodrigo):
  - al abrirlo, si quien mira escribe en el expediente, calcula ya las semanas cerradas (`POST …/weekly-reviews/compute`) y la página se
    actualiza si hubo controles nuevos;
  - resumen del macrociclo (07 §10): por semana, el semáforo, la carga sRPE, los promedios de sueño, rendimiento y alimentación, el factor
    del plan, el factor ajustado, la decisión y las sesiones registradas contra las programadas. Arriba, las sesiones registradas hasta hoy
    y las próximas. Las «verificadas» y «por validar» dependen de validar la asistencia a una cita del calendario, que llega en P15
    (decisión de Rodrigo);
  - la semana elegida: el semáforo con sus razones, la decisión sugerida, los promedios, el método con la fecha del cálculo y cuántos
    controles reemplazaron los registros tardíos;
  - la decisión: mantener, ajustar o descargar, con nota obligatoria y sin ninguna opción marcada. Al ajustar o descargar, el factor de la
    semana siguiente viene con el sugerido redondeado a 2 decimales, con el medio hacia arriba (0.825 → 0.83, 0.945 → 0.95), porque la
    semana guarda 2 (decisión de Rodrigo). El coach lo puede cambiar, y al lado ve el sugerido exacto y el factor que tenía el plan;
  - ya decidida, la semana muestra el autor, la fecha y la nota, y el enlace para revisar y publicar la versión nueva o el aviso de que ya
    se publicó.
- Umbrales en Ajustes (07 §11): los siete valores con su uso y el valor base de la V3, si rigen los de la organización y desde cuándo, y
  «Usar los valores base». Guardar crea la versión de hoy. Los ve todo el equipo; los cambian el dueño y los administradores.
- `@nutricoach/ui/chart` suma `ColumnChart` (columnas finas de un color y lo programado como línea punteada) y `TrendChart` (una serie con
  sus puntos). Al pasar el puntero, la ayuda muestra primero el valor; cada gráfico tiene una tabla para lectores de pantalla y ninguno se
  anima, porque las cifras no cuentan desde cero (ADR-051).
Consecuencias:
- E2E `e2e/analitica.spec.ts` en escritorio y celular:
  - Luis registra hoy 1800 kcal y la analítica muestra 98.1 % de adecuación, en rango, con su método;
  - la semana 1 de su programa muestra 1440 kg de tonelaje y un 1RM de Epley de 76 kg;
  - el coach abre el control semanal: ámbar por fatiga y factor ajustado 0.945. Ajusta con 0.95 prellenado y su nota, y la semana 2
    cambia a 0.95 recién al publicar la versión nueva (criterio 5);
  - la dueña cambia los umbrales.
- PR 5: la evolución. PR 6: el panel con los controles sin decidir y el semáforo. PR 7: la Demo 3.
- Para Notion (/notion-sync de P14):
  - 07 §10: en la 1.0, el resumen muestra las sesiones registradas y las próximas; las verificadas y por validar llegan con el calendario.
    Además, el factor que propone la decisión;
  - prompt P15: el calendario valida la asistencia y suma las sesiones verificadas y por validar al resumen del macrociclo.

## ADR-091 · Evolución antropométrica por la API, tendencia por mes y ficha de evolución — aceptada (2026-11-06)
Contexto: P14, PR 5a (RF-35, RF-30; RN-C05, RN-C06, RN-C08, RN-C09, RN-D02, RN-D03, RN-D05, RN-G09, RN-H01, RN-H02). P7 dejó la
comparación con la evaluación anterior (ADR-046) y result_metric; faltaban la serie en el tiempo, lo que ve el paciente y la ficha.
Rodrigo decidió el 2026-11-06 tres puntos que Notion no fija.
Decisión:
- `GET /patients/:id/evolution` (`patients.read`, RLS del equipo de atención, un READ de `assessment.evolution`): las evaluaciones
  cerradas vigentes en orden de medición:
  - cada sitio medido, consolidado como en la evaluación (RN-C03). El cambio de cada punto contra el anterior, y del primero al
    último, se compara con el CMD95 del evaluador del punto con su ETM vigente ese día (RN-C05, RN-C06), como en la comparación
    de P7; la suma de 6 pliegues usa el %ETM agrupado (G-04);
  - cada indicador de los resultados vigentes, por método (RN-D03). A los números derivados no se les traslada el CMD95 (RN-C05):
    solo se muestra el cambio;
  - la bioimpedancia por equipo, «marca · modelo» (RN-C08);
  - lo que cambió en las condiciones o el evaluador frente a la evaluación anterior (RN-C09).
- Lo que ve el paciente en Progreso (decisión de Rodrigo, RF-30), `GET /me/evolution`: el peso, la cintura y la suma de 6 pliegues
  con el CMD95, y el % de grasa y la masa muscular de su método principal (RN-D05; es el que el equipo ve marcado en los resultados).
  Sin interpretaciones:
  - su RLS no le deja leer las tomas, el ETM ni las preferencias (05.1). Dos funciones SECURITY DEFINER, como app.readiness_basis
    (ADR-080), le devuelven solo lo suyo y solo con `app.role() = 'PATIENT'`;
  - `app.patient_evolution_sites()` devuelve las tomas de los 8 sitios de sus evaluaciones cerradas, con el ETM de su evaluador en
    esa fecha;
  - `app.patient_method_preferences()` devuelve sus preferencias y las de su organización;
  - las dos llegan con la migración `202611060300_assessment_patient_evolution`.
- RN-G09, la tercera agregación, por mes calendario (decisión de Rodrigo): `GET /patients/:id/analytics/trend?from&to`, hasta 24
  meses (sin rango, los últimos 12). Por mes trae la adecuación del promedio de energía con ADEQUACY, los días con meta, con
  registros y en rango, y las sesiones registradas contra las programadas. La web la muestra junto a la evolución.
- Ficha de evolución 1.0.0 (RN-H01), con la última evaluación cerrada como origen y sin cambiar el DDL de documents (ADR-086):
  - el pedido de una evaluación lleva `kind: 'EVOLUTION'`; sin él, da la ficha de resultados. La serie llega hasta la evaluación de
    origen, incluida;
  - muestra las evaluaciones con sus condiciones, cada medida con su primer y último valor y su cambio frente al CMD95, cada
    indicador por método y la bioimpedancia por equipo. Una medida tomada una sola vez no entra;
  - la plantilla llega con `202611060400_documents_evolution_template`. El hash del origen es el del contenido: una enmienda que
    cambia un valor da otro PDF, y cualquier otra cosa da el mismo (RN-H02).
- Los textos de la significancia y de las condiciones pasan a @nutricoach/contracts, para que la pantalla y la ficha digan lo mismo.
Consecuencias:
- Integración en `test/integration/evolution.int.spec.ts`, con 8 casos como app_user:
  - la evolución de Luis: la suma de 6 pliegues bajó 6.9 mm contra un CMD95 de 6.18 mm, un cambio real (G-04), y el abdominal no tuvo
    cambio significativo;
  - los métodos por separado, los accesos y la auditoría;
  - lo que ve el paciente, con el método principal que ve el equipo, y que las funciones no devuelven nada fuera de su sesión;
  - la ficha: la genera el worker, se reutiliza y dice «Cambio real».
- La tendencia se prueba en `analytics.int.spec.ts`.
- PR 5b: las pantallas (Evaluaciones › Evolución, con la tendencia y la ficha, y Progreso en la app) y su E2E.
- Para Notion (/notion-sync de P14):
  - 05.1: las dos funciones del paciente;
  - 02: §3 (`AssessmentApi.evolutionSheet`) y §10 (las rutas);
  - 04 RF-30: lo que ve el paciente;
  - 03 RN-G09: el mes calendario;
  - 06: el `kind` del pedido de una ficha.

## ADR-092 · Pantallas de la evolución — aceptada (2026-11-06)
Contexto: P14, PR 5b (RF-35, RF-30; RN-C05, RN-C06, RN-C08, RN-C09, RN-D02, RN-D03, RN-G09, RN-H01). La API llegó con el PR 5a
(ADR-091).
Decisión:
- Evaluaciones › Evolución (decisión de Rodrigo, ADR-091), con un enlace desde la lista de evaluaciones:
  - las evaluaciones en orden, con su nivel, su evaluador y lo que cambió frente a la anterior (RN-C09);
  - las medidas con su primer y último valor, el cambio, el CMD95 y si es un cambio real (RN-C06), junto a los métodos de la
    consolidación y del CMD95;
  - los indicadores por método y la bioimpedancia por equipo, sin CMD95 (RN-C05, RN-D03, RN-C08);
  - un gráfico en el tiempo de la serie que se elige: nunca dos métodos en el mismo gráfico;
  - la tendencia por mes (RN-G09), junto a las evaluaciones de cada mes, desde el mes de la primera evaluación y hasta 24 meses;
  - «Descargar ficha de evolución (PDF)», con la última evaluación como origen.
- Progreso en la app (RF-30): una tarjeta por número (peso, cintura, suma de 6 pliegues, y % de grasa y masa muscular del método
  principal):
  - el último valor con su método y el cambio desde la primera evaluación; en las medidas, también «Cambio real» o «Sin cambio
    significativo»;
  - debajo, la lista de los valores de cada evaluación;
  - no usa Recharts, para no cargar la app del paciente, ni muestra interpretaciones;
  - si el profesional no activó la sección, la pantalla lo dice.
- La auditoría del panel nombra los recursos de P14: la evolución, la analítica de dieta y de rutina, el control semanal y los
  umbrales.
Consecuencias:
- E2E `e2e/evolucion.spec.ts` en escritorio y celular, con axe:
  - la suma de 6 pliegues sale −6.9 mm, «Cambio real», y el abdominal, «Sin cambio significativo»;
  - el % de grasa de Durnin y Siri va en su propia fila, y la tendencia muestra octubre;
  - la ficha se descarga, y Luis ve su Progreso.
- PR 6: el panel con `patient_overview` y sus alertas, el material educativo y las fichas en la app. PR 7: la Demo 3.

## ADR-093 · Panel del profesional con alertas — aceptada (2026-11-07)
Contexto: P14, PR 6a (RF-34; RN-A05, RN-B03, RN-D09, RN-F17, RN-G04, RN-G09, RN-G13, RN-G15; ADR-086). `analytics.patient_overview`
existía desde P2 (05.3), vacía. El PR 6 se parte en tres, cada uno con su API y su pantalla: 6a, el panel; 6b, el material educativo;
6c, las fichas en la app. Rodrigo decidió el 2026-11-07 que el semáforo del día es el del último registro diario si es de hoy o de ayer.
Decisión:
- Las alertas, en este orden (los valores de ADR-086, en la fecha local del paciente):
  - `NO_RECENT_LOGS`: sin registros en los 3 días que ya terminaron (hoy todavía no cuenta); quien nunca registró cuenta desde su
    primera meta, y sin metas ni registros no se le espera nada;
  - `LOW_ADHERENCE`: días en rango ÷ días con meta de los 7 días que terminaron ayer, menor que 80 % (RN-G09); sin días con meta no hay
    adherencia;
  - `UNREAD_NOTES`: notas del paciente que su equipo no abrió (RN-G13);
  - `READINESS_RED` y `READINESS_YELLOW`: la indicación del último registro diario si es de hoy o de ayer (RN-G15);
  - `WEEKLY_RED` y `WEEKLY_AMBER`: el control vigente de la semana más reciente del programa vigente, hasta 7 días después de que
    terminó (07 §10);
  - `PENDING_REVIEW`: controles vigentes del programa vigente sin la decisión del coach (RN-F17).
- La fila de cada paciente guarda las alertas y los números con que se calcularon: último registro, adherencia de 7 y 30 días, notas sin
  leer, última evaluación cerrada y el último peso del resumen diario (con el ajuste del profesional). La próxima cita queda en null hasta
  la agenda (P15).
- Quién la recalcula:
  - el consumidor del resumen diario, después del día (su adherencia lee ese resumen);
  - `analytics.overview`: las notas, la decisión de un control y el cierre de una evaluación;
  - un trabajo de cada hora (minuto 50) para los pacientes con metas o registros en los últimos 35 días, porque varias alertas cambian
    con el paso del tiempo; `analytics:rebuild` también.
  Esto precisa ADR-086 («lo que depende del paso del tiempo se calcula al leer»): las alertas se guardan y se recalculan cada hora, con
  hasta una hora de atraso al cambiar el día. Un paciente archivado sale del panel.
- Por la API: tracking (`overviewFacts`), training (`reviewOverview`) y assessment (`lastClosedEvaluationAt`) dan sus hechos; analytics
  no lee nombres (ADR-064). `GET /api/v1/analytics/overview?alert&limit` devuelve los pacientes con alertas que ve el equipo de atención
  (RN-A05), primero los de más alertas y, a igual número, los de registro más antiguo, con el conteo por alerta. La lectura queda
  auditada (RN-B03). La web pide los nombres con `GET /patients?ids=` (hasta 100).
- Inicio: debajo del saludo, las alertas con su filtro en la URL (`?alerta=`). Cada paciente aparece con los números de sus alertas
  y cada alerta lleva a donde se atiende: el seguimiento (notas, semáforo del día, días sin registro), la analítica (adherencia) o el
  control semanal. Sin alertas, un estado vacío.
Consecuencias:
- Integración `overview.int.spec.ts`: las alertas de tres pacientes, una nota que se lee por la API y apaga la alerta por el evento, el
  filtro, los nombres desde /patients, el equipo de atención, la auditoría y el archivado.
- E2E `e2e/inicio.spec.ts` en escritorio y celular, con axe: la nota de Luis aparece en Inicio, se atiende en su seguimiento y la
  alerta se apaga.
- Para Notion (/notion-sync de P14): 04 RF-34 (las alertas y sus valores), 05.3 (`patient_overview`: quién la recalcula y que
  `next_appointment_at` llega con P15) y 02 §8 (el consumidor `analytics.overview`).

## ADR-094 · Material educativo — aceptada (2026-11-07)
Contexto: P14, PR 6b (RF-30; RN-A05, RN-B03; ADR-038, ADR-086). `content.educational_resource` y `content.resource_assignment`
existían desde P2 (05.3), vacías. Rodrigo decidió el 2026-11-07 que entran los cuatro tipos del modelo.
Decisión:
- La biblioteca es de la organización: cualquier profesional la lee y la escribe (permisos `catalog.read` y `catalog.write`, como los
  alimentos propios). Los cuatro tipos:
  - enlace y video: una URL https; el paciente la abre afuera (sin incrustar, para no tocar la CSP);
  - artículo: hasta 20 000 caracteres con formato simple («#», «##», «###», listas con «-» o «*» y **negrita**); la web lo muestra
    sin interpretar HTML;
  - PDF: hasta 5 MB por multipart, con el tipo sacado de los bytes y registrado con FileRegistry (`EDUCATIONAL_RESOURCE`).
- Un recurso cambia de título, etiquetas o contenido sin cambiar de tipo; archivarlo lo quita de la biblioteca y de la app sin borrar
  sus asignaciones, y uno archivado solo se restaura.
- Asignar o quitar un recurso exige acceso de escritura al paciente (RN-A05). Repetir la asignación no la duplica, y quitarla borra la
  fila (`GRANT DELETE`, con `patient_no_delete` para el paciente).
- El paciente ve lo vigente que su equipo le asignó en Más › Material, si la sección `RESOURCES` está activa. Al abrir un recurso,
  la app avisa (`POST /me/resources/:id/view`) y queda la primera hora en `viewed_at` (ADR-086). Lo hace
  `app.mark_resource_viewed(uuid)`, SECURITY DEFINER, que solo escribe esa columna en una asignación suya: una política de escritura le
  dejaría cambiar cualquier columna.
- El PDF se descarga solo por la API, como adjunto y auditado como exportación (ADR-038, RN-B03), por el equipo desde la biblioteca o
  por el paciente si lo tiene asignado y vigente.
- Migración `202611070000_content_resources`: las restricciones de estado y de contenido por tipo, los índices de la biblioteca y de lo
  asignado a cada paciente, el permiso de borrar asignaciones y la función.
- Eventos `content.resource.created`, `updated`, `assigned`, `unassigned` y `viewed`, en la auditoría como CREATE, UPDATE, GRANT,
  REVOKE y UPDATE.
- Pantallas:
  - Biblioteca › Material educativo, para agregar y archivar;
  - en la app de cada paciente, Material educativo: asignar, quitar y ver si lo abrió;
  - en la app del paciente, Material, con el artículo en pantalla y el botón de cada tipo.
Consecuencias:
- Integración `resources.int.spec.ts`: los cuatro tipos y el PDF falso (415), el tipo que no cambia, la asignación del equipo y no de
  alguien de fuera, lo que ve cada paciente, la primera hora que no cambia, la descarga auditada, y el archivado y quitar la asignación.
  La prueba del catálogo cuenta la función nueva.
- E2E `e2e/material.spec.ts` en escritorio y celular, con axe: el artículo y el PDF que se agregan, se asignan a Luis, él los abre y su
  equipo ve que los abrió.
- Para Notion (/notion-sync de P14): 05.3 (las restricciones, los índices, el borrado de asignaciones y `app.mark_resource_viewed`),
  04 RF-30 (los cuatro tipos y la marca de visto) y 06 (los códigos NC-CON-003 a NC-CON-007).

## ADR-095 · Fichas en la app del paciente — aceptada (2026-11-07)
Contexto: P14, PR 6c (ADR-080: las fichas en la app pasan a P14; RF-24, RN-H01 a RN-H03, RN-B03). Rodrigo decidió el 2026-11-07
que el paciente ve las vigentes.
Decisión:
- Las fichas vigentes, en el orden de la app:
  - `PLAN`: el plan que el paciente ve en su app (la copia vigente de tracking, `active_plan_view`);
  - `PROGRAM`: la rutina de esa misma copia;
  - `RESULTS`: los resultados de su última evaluación cerrada;
  - `EVOLUTION`: su evolución hasta esa evaluación, si tiene dos o más cerradas.
  Tracking (`activePlans`) y assessment (`closedEvaluationIds`) dan los ids por su API pública.
- El paciente pide una ficha por su nombre (`item`), nunca por su origen: la API lo elige con el id de su sesión. Como su RLS no ve
  las plantillas ni todo lo que muestra la ficha, se arma como SYSTEM de su organización y el pedido queda a su nombre en el outbox.
  La descarga va con su RLS (`generated_document` y `file_object` ya le dejan ver lo suyo), como adjunto y auditada como
  exportación (RN-B03).
- Rutas `GET /me/documents`, `POST /me/documents` (200 si ya existe un PDF igual, 202 si lo genera el worker),
  `GET /me/documents/status?item=` y `GET /me/documents/:id/file`.
- En la app, Más › Fichas en PDF muestra un botón por ficha, si su sección está a la vista: el plan con Alimentación, la rutina con
  Entrenamiento, y los resultados y la evolución con Progreso. El botón de ficha del panel y el de la app comparten `SheetButton`.
Consecuencias:
- Integración `me-documents.int.spec.ts`: las fichas de Luis (plan y resultados) y ninguna de Inés; pedir por el nombre (un origen
  enviado es 400), el 202 y luego READY, la evolución que no existe con una sola evaluación, la descarga solo para él y auditada con
  `actor_role` PATIENT, y el equipo fuera de /me.
- E2E `e2e/fichas-app.spec.ts` en escritorio y celular, con axe: Luis descarga la ficha de su plan y la de sus resultados.
- Para Notion (/notion-sync de P14): 04 (las fichas vigentes en la app, RF-24 o RF-30) y 02 §10 (las rutas /me de documents).

## ADR-096 · Generador de carga, p95 de la analítica y rendimiento a escala — aceptada (2026-11-07)
Contexto: P14, PR 7a (criterio 4 de P14; RNF-01, RNF-05; 01 §9; ADR-086). Rodrigo decidió el 2026-11-07:
- generar en SQL y reconstruir con `analytics:rebuild`;
- medir con un script HTTP local;
- partir el PR 7 en 7a (carga y p95) y 7b (demo:3, guion y v0.3.0).
Decisión:
- `pnpm seed:load [--patients 500] [--years 2]`, solo en local y staging, en una organización de carga aparte («Consultorio Carga»):
  - por SQL, la organización, una suscripción con cupo para todos, la dueña y 15 profesionales con la contraseña demo;
  - por la API, una plantilla: un paciente con la evaluación ISAK 2 de Luis, su prescripción, un plan por intercambios y un programa
    de 12 semanas publicados, para que los snapshots sean los de la aplicación;
  - por SQL, los pacientes, cada uno con su responsable, HEALTH_DATA, una copia del plan y un programa por cada bloque de 12 semanas
    (solo la fila con su snapshot; sus tablas hijas quedan vacías, porque la analítica y la app leen el snapshot);
  - cada día de su historia, con source IMPORT: meta, comidas por tiempo, agua, peso de los lunes, registro diario, entrenos con sus
    series y alguna nota. La adherencia, el registro y el entrenamiento varían por paciente con una semilla fija;
  - las particiones se crean desde el mes más antiguo y al final corre `analytics:rebuild --all --concurrency 4`. Si la organización
    ya existe, se detiene sin tocar nada.
- `pnpm analytics:p95 [--requests 200]` pide cada consulta de analítica una tras otra sobre pacientes al azar: dieta de 4 semanas y de
  1 año, tendencia de 24 meses, rutina del programa vigente y panel. Mide como la dueña y como una profesional (la RLS del equipo de
  atención) y escribe `docs/demos/demo-3-p95.md`. Es la medición del criterio 4; k6 sobre un servidor idéntico, con carga sostenida,
  y el generador de 3 000 pacientes siguen en P16.
- Rendimiento a escala, lo que el generador destapó:
  - buscar «pacientes con meta o registros desde un día» recorría las tablas de registros con la RLS fila por fila
    (`app.can_see_patient`). Con 500 pacientes, la ventana de 35 días del trabajo del panel tardaba 5.85 s (más que los 5 s de la
    transacción) y la búsqueda sin día de `analytics:rebuild --all`, 131 s;
  - ahora el resumen de cada hora elige a los pacientes con meta desde ayer, leyendo solo `daily_target` (44 ms); los días con
    registros los recalcula su evento;
  - el panel y la reconstrucción recorren los pacientes de clinical (`ClinicalApi.patientIds`), cada uno en su transacción;
  - la reconstrucción de un paciente va por tramos de 120 días, cada uno en su transacción: con dos años de historia, una sola
    transacción se acercaba a los 5 s. Los números no cambian, pero ya no es atómica: si se corta, se vuelve a correr;
  - `analytics:rebuild --all --concurrency N` (1 a 8) reconstruye varios pacientes a la vez.
Consecuencias:
- Medido en local (Intel i5-7400, 4 hilos):
  - 500 pacientes y 730 días: unos 5.8 millones de filas y una base de 2.97 GB; la historia tarda 286 s y la reconstrucción de todo,
    21 min con 4 a la vez, limitada por la CPU de Node;
  - el peor p95 es 102 ms (tendencia de 24 meses como profesional) y no hubo errores en 2 000 pedidos. El criterio 4 pasa.
- La medición de care_team_scope que STATUS tenía pendiente queda hecha: la profesional ve solo a sus 34 pacientes y sus p95 son como los de
  la dueña.
- Integración `seed-load.int.spec.ts` (3 pacientes y 13 semanas: la plantilla, los códigos, los bloques, source IMPORT, la
  analítica reconstruida, el equipo de atención y que no se repite) y unitarias de los scripts.
- Para Notion (/notion-sync de P14): 01 §9 (cómo se generan los datos y la medición local del criterio 4), 06 (`analytics:p95` y
  `--concurrency`) y 02 §8 (los trabajos de cada hora eligen a los pacientes sin leer los registros).

## ADR-097 · Demo 3: la semilla con Luis y Mateo, y el guion — aceptada (2026-11-07)
Contexto: P14, PR 7b (ADR-086, ADR-096). Jeremy mandó el 2026-11-07 su hoja piloto «JV Fitness · Mi plan» con un alumno ficticio,
Mateo Prueba, durante octubre. Es interna: no se comparte hasta que él la valide. Rodrigo decidió:
- sumar a Mateo a la Demo 3, con los números de la hoja, para que Jeremy compare la app con su hoja;
- preparar preguntas concretas para Jeremy;
- proponer un P14.5 con lo que la hoja trae y la app no tiene.
Decisión:
- `pnpm demo:3` (apps/api/scripts/demo-3.ts) corre después de demo:2, con la API y el worker, y deja dos casos. Lo que ya está no
  se toca.
  - **Luis (seeds/luis/demo-3.json):** perfil, «Fuerza base» publicada por la API y su semana G-20 por SQL (source IMPORT).
  - **Mateo (seeds/mateo/demo-3.json):**
    - por SQL, como Luis en db:seed: ficha, HEALTH_DATA e historia el 05/10, y dos evaluaciones básicas con bioimpedancia, el
      05/10 y el 31/10. Son de octubre y la API las fecharía hoy;
    - por la API: su perfil y «Full Body» a mano (Full Body A, B y C con el ejercicio de cada día del registro de cargas, 3 series
      de 10 a 12 por RIR), con las fases de pérdida de grasa de la V3 en las semanas 1 a 8;
    - por SQL: sus 4 semanas.
- Lo registrado lleva su recuperación como al registrarlo: el script corre `READINESS_JV` con la línea base del perfil y el umbral
  vigente ese día, y guarda método, versión e insumos con su hash (RN-D01). Las dos rutinas prescriben un rango de repeticiones y no un
  tonelaje fijo, así que el rendimiento del día es el que escribe el paciente (P-09, ADR-080).
- Cómo se leyó la hoja de Mateo:
  - el programa es a mano y no una propuesta, porque la propuesta trae 8 bloques por sesión y no deja cambiar su estructura;
  - las sesiones caen martes, jueves y sábado, como las fechas de asistencia, aunque la hoja las rotula lunes, miércoles y viernes;
  - el 22/10 fue una ausencia: el entreno queda como no hecho, con su motivo, aunque el registro de cargas traiga la sentadilla;
  - «Sentadilla» es «Sentadilla trasera» de la biblioteca;
  - la hoja da un valor por semana y el registro diario lo repite cada día;
  - el rendimiento escrito es 80 o 100 sobre 100;
  - sin plan de alimentación: las metas por tipo de día llegan en P14.5;
  - la fecha de nacimiento, la talla y la marca de la bioimpedancia son datos de la demo.
- El umbral global de la V3 vale desde el 21/10/2026, cuando entró en la app, y el mes de Mateo empieza antes. Si la organización no tiene
  un umbral vigente el 05/10, la semilla le pone los mismos valores de la V3 desde esa fecha (07 §11: una fila propia y versionada).
- Guion `docs/demos/demo-3.md`, con la comparación entre la hoja y la app, y preguntas para Jeremy en `docs/preguntas/hoja-piloto-mateo.md`
  (P-20 a P-37).
Consecuencias:
- El control de Mateo da lo que da la hoja:
  - semanas 1 y 2: rojo, «Descarga 20–30 % y revisar», por rendimiento y sueño (6.4 h) en la 1 y por rendimiento en la 2;
  - semanas 3 y 4: verde, «Continuar plan».
- Los demás números de la hoja también salen:
  - sesiones 3, 3, 2 y 3; sueño 6.4, 6.8, 7.1 y 7.4 h;
  - tonelaje 5,220, 5,490, 3,420 y 3,750 kg;
  - 1RM de Epley 56.0, 59.5, 63.0 y 46.7 kg;
  - peso 80 → 79 kg, cintura 88 → 85 cm, cadera 100 → 99 cm y grasa por bioimpedancia 22 → 20.8 %.
- Luis queda en ámbar por fatiga, para decidir en vivo.
- Integración `demo-3.int.spec.ts`:
  - G-20 por HTTP;
  - los controles y promedios de Mateo, su analítica de rutina y su evolución;
  - un registro de recuperación por cada registro diario;
  - correrla otra vez no duplica nada.
- Corrido contra la API y el worker locales: el worker calculó las dos evaluaciones de Mateo y no dejó eventos pendientes.
- Para Notion (/notion-sync de P14): 07 §15, las preguntas P-20 a P-37. Ninguna regla cambia.

## ADR-098 · P14.5: lo que trae la hoja piloto de Jeremy, por fases — aceptada (2026-11-08)
Contexto: la hoja piloto «JV Fitness · Mi plan» (2026-11-07, interna hasta que Jeremy la valide) trae funciones que la app no tiene:
metas de alimentación por tipo de día, panel de fatiga y recuperación, volumen ajustado por RIR y descanso, fatiga por grupo muscular,
check-in semanal, informe mensual con fotos y expediente de documentos. ADR-097 cargó a Mateo en la Demo 3 y dejó las preguntas P-20 a
P-37. Rodrigo aprobó el 2026-11-08 cerrar P14 primero y hacer P14.5 antes de P15.
Decisión:
- P14.5, en tres fases, cada PR contra main:
  - fase A, sin esperar respuestas: PR 1a, metas de día de entrenamiento y de descanso (por defecto, como la hoja: proteína y grasa
    fijas y carbohidratos por diferencia; se confirma P-20 antes de fusionar); PR 2, volumen ajustado; PR 6a, la cadera en Progreso
    de la app, la comparativa inicial → actual en el panel y el estrés en el resumen del control semanal;
  - fase B, con las respuestas de Jeremy: PR 3, panel de fatiga (P-23 a P-25); PR 4, fatiga por grupo muscular (P-27); PR 5,
    check-in semanal (P-21, P-22); PR 1b, comidas por tipo de día (P-20.5); PR 9, la prescripción de la hoja (P-34, P-35, P-37);
  - fase C, fuera del contrato: PR 7, informe mensual (sería la sexta ficha; P-28, P-29); PR 6b, fotos con consentimiento propio
    (P-30); PR 8, expediente (P-31). Solo con acuerdo y cotización por la cláusula décimo segunda.
- Lo que depende de una respuesta se construye con sus valores como datos versionados (como los umbrales de 07 §11) y no se publica
  con valores inventados: un factor que la hoja no trae queda «sin factor».
Consecuencias:
- El prompt P14.5 está en Notion (Prompts P9 a P16), con su fila en el orden de prompts (semana 7) y el riesgo R9 en Proyecto.
- Si el proyecto empezó el 24-09, la Demo 4 cae el 25-11: lo que no entre se acuerda con Jeremy antes de mover la fecha.

## ADR-099 · Metas de día de entrenamiento y de descanso por la API — aceptada (2026-11-08)
Contexto: P14.5, PR 1a (07 §2 y §8, P-20; RN-E07, RN-G03, RN-E15; ADR-098). La hoja piloto da a Mateo 2,500 kcal los días de
entrenamiento y 2,250 los de descanso, con la misma proteína (160 g) y la misma grasa (70 g). Rodrigo decidió el 2026-11-08:
- la meta de la prescripción es la del día de entrenamiento; el profesional escribe las kcal del día de descanso;
- un día sin programa lleva la meta de la prescripción;
- hasta la respuesta a P-20.5, las comidas del plan son las mismas los dos días y el paciente ajusta las porciones: un día de
  descanso, comer el plan entero puede pasar de 110 % (Mateo: 2,500 ÷ 2,250 = 111 %);
- el PR 1a se parte en dos: la API y, después, las pantallas, las fichas y Mateo en `demo:3`.
Decisión:
- Motor 1.7.0, método `MACROS_REST_DAY` 1.0.0: la proteína y la grasa en gramos del día de entrenamiento, y los
  carbohidratos por diferencia con Atwater (RN-E07). Carbohidratos negativos: NC-ENG-310; kcal no positivas o gramos
  negativos: NC-ENG-311. No hay caso dorado hasta P-20.2: con 2,250 kcal el método da 245 g de carbohidratos y la hoja,
  240 g (2,230 kcal); Jeremy dirá si mandan las kcal o los gramos.
- Migración `202611080000_nutrition_rest_day_targets`:
  - `nutrition.plan.rest_day_kcal`, mayor que 0. El disparador del plan publicado ya compara la fila entera;
  - `day_kind` (`TRAINING` o `REST`) en `tracking.daily_target` y en `analytics.patient_daily_summary`.
- nutrition:
  - el borrador de las tres modalidades lleva `restDayKcal` (opcional en el PUT, null por defecto);
  - el cálculo da `restDayTargets` con su método; si los carbohidratos salen negativos, 422 NC-NUT-018 (RN-E07);
  - el snapshot pasa a la versión 2 con `restDayTargets`. Uno de la versión 1 no lo trae: una sola meta;
  - una versión nueva copia las kcal de descanso.
- tracking:
  - el tipo de un día sale del calendario del programa vigente: con sesiones, `TRAINING`; sin ellas, `REST`; fuera del
    programa, null. La meta de entrenamiento lo guarda en `day_kind`;
  - la meta de alimentación de un día `REST` es la de descanso del plan; la de un día `TRAINING` o sin tipo, la de la
    prescripción;
  - publicar un plan o un programa fija solo la meta de hoy (RN-G03). Un programa nuevo cambia la de alimentación de hoy si
    el plan tiene metas de descanso. El trabajo de cada hora calcula el tipo antes de crear la meta que falta;
  - una ausencia no cambia el tipo del día, que ya tenía su meta (P-20.3 sigue abierta).
- /me: Hoy trae el tipo del día junto a la meta; Mi plan, las dos metas.
- analytics: el resumen diario guarda el tipo del día y la analítica de dieta lo devuelve por día. La adecuación del día es
  contra la meta de su tipo; el promedio de la semana sigue siendo el de los días con registros y meta (G-20 no cambia).
Consecuencias:
- Integración `rest-day-targets.int.spec.ts` (9 casos, como app_user): el borrador con sus metas de descanso y su método, la
  vista previa, el 422, el snapshot de la versión 2, la versión nueva, la meta de hoy sin programa, en un día de descanso,
  con el trabajo de cada hora y en un día de entrenamiento, y la analítica de dieta del día.
- Unitarias del motor (RN-E07), del dominio de tracking (el tipo del día y su meta) y del resumen diario.
- PR 1a-web: el editor, Hoy, Mi plan, la analítica, las fichas con las dos metas (plantillas nuevas) y Mateo en `demo:3`.
- Para Notion (/notion-sync de P14.5): 02 §9 (`MACROS_REST_DAY`) y §3; 03 RN-E07 y RN-G03; 05.2 (`rest_day_kcal`,
  `day_kind`) y 05.3 (`day_kind`); 07 §2 y §8; 04 RF-18 o RF-23.

## ADR-100 · Perfiles de día del plan: las respuestas de Jeremy a P-20 — aceptada (2026-11-08)
Contexto: P14.5. Jeremy respondió P-20 el 2026-11-08 (`docs/preguntas/hoja-piloto-mateo.md`) y Rodrigo pidió seguir sus
respuestas:
- la proteína, los carbohidratos y la grasa se editan en cada tipo de día;
- mandan los gramos;
- el día pasa a descanso solo si se reprograma la sesión a tiempo, nunca a medianoche;
- hay perfiles de día propios además de Entrenamiento y Descanso;
- en descanso cambian solo las porciones del alimento fuente, en algunas comidas.

El PR 1a (#70, ADR-099) partía de las kcal del día de descanso. Rodrigo decidió el 2026-11-08:
- Entrenamiento sigue siendo la prescripción;
- los perfiles se asignan por sesión del programa y por fecha;
- reprogramar lo hacen el paciente y el coach, solo hoy y mañana;
- el orden de los PR: perfiles por la API (este, PR 1c), sus pantallas (1d), comidas por perfil (1b) y reprogramar (1e,
  con el perfil por fecha). Después, el PR 2 y el 6a.
Decisión:
- Reemplaza a ADR-099 en lo que la respuesta contradice. Se retiran `MACROS_REST_DAY` y `nutrition.plan.rest_day_kcal`, que no
  llegaron a staging ni a producción. Sigue lo demás: la meta de cada día la da el programa vigente, solo se fija la de hoy
  (RN-G03) y sin programa vale la prescripción.
- Motor 1.8.0, método `MACROS_DAY_PROFILE` 1.0.0: con los gramos de carbohidratos, proteína y grasa da las kcal con Atwater
  (RN-E07). Gramos negativos o todos en 0: NC-ENG-312. Con la respuesta a P-20.2 ya hay caso dorado: 240, 160 y 70 g dan
  2,230 kcal, y 310, 160 y 70 g, 2,510. Se propone como G-41 en el /notion-sync.
- Migración `202611080100_nutrition_day_profiles`:
  - `nutrition.plan_day_profile`: código, nombre, gramos y posición. Solo cambia en borrador; tiene la RLS de los hijos del
    plan;
  - `training.session.day_profile_code`;
  - `day_profile_code` y `day_profile_name` en `tracking.daily_target` y en `analytics.patient_daily_summary`;
  - sale `rest_day_kcal`.
- nutrition:
  - el borrador de las tres modalidades lleva `dayProfiles`: hasta 6, con códigos únicos en mayúsculas, REST para el descanso
    y nunca TRAINING. Lo que no cuadra da 422 NC-NUT-010 con cada problema;
  - el snapshot pasa a la versión 3, con los perfiles, sus kcal y su método.
- training:
  - cada sesión puede llevar `dayProfileCode`; null es Entrenamiento;
  - el snapshot del programa pasa a la versión 2, con el perfil de cada sesión en el calendario de tracking. Una versión 1
    se lee con todas las sesiones de Entrenamiento.
- tracking:
  - el perfil del día es el de su sesión (con dos sesiones, el de la primera); REST si no hay sesión; ninguno fuera del
    programa;
  - la meta del día es la de ese perfil del plan. Entrenamiento, un día sin programa o un código que el plan no tiene llevan
    la prescripción;
  - un plan sin perfiles tiene una sola meta y ningún perfil;
  - la meta guarda el perfil con que se fijó, y Hoy, Mi plan y la analítica de dieta lo muestran.
- La web todavía no edita perfiles, pero conserva los del plan y los de las sesiones al guardar.
Consecuencias:
- Integración `day-profiles.int.spec.ts`, 9 casos como app_user:
  - el borrador con sus perfiles, la vista previa, los 422 y el 400;
  - el snapshot de la versión 3 y la versión nueva;
  - la meta de hoy sin programa, en un día sin sesión, con el trabajo de cada hora, con una sesión con perfil propio y con
    una sin perfil;
  - la analítica de dieta.
- PR 1d:
  - el editor de perfiles, que autocompleta la proteína y la grasa de Entrenamiento (P-20.1);
  - el perfil de cada sesión en el programa;
  - Hoy, Mi plan, la analítica y las fichas;
  - Mateo con 2,510 y 2,230 kcal en `demo:3`.
- PR 1b: las porciones del alimento fuente por perfil (P-20.5). PR 1e: «no entreno hoy», «mover a mañana» y el perfil por
  fecha (P-20.3), que nunca se aplican solos a medianoche.
- Para Notion (/notion-sync de P14.5):
  - 07 §2 y §8, y §15 con P-20 resuelta;
  - 03: RN-E07 (los perfiles de día), RN-G03 (la meta del perfil del día) y G-41;
  - 02 §9 (`MACROS_DAY_PROFILE`);
  - 05.2 (`plan_day_profile`, `session.day_profile_code`, `daily_target`) y 05.3 (el resumen diario);
  - el prompt de P14.5 con estos PR.

## ADR-101 · Pantallas de los perfiles de día, fichas del plan 1.1.0 y Mateo en demo:3 — aceptada (2026-11-08)
Contexto: P14.5, PR 1d (07 §2 y §8; P-20; RN-H01, RN-H02, RN-D02; ADR-100). Los perfiles de día llegaron por la API con el PR 1c;
faltaban las pantallas, las fichas y la demo.
Decisión:
- Editor del plan, en las tres modalidades: «Perfiles de día», debajo de las metas de Entrenamiento:
  - «Agregar Descanso» y «Agregar perfil» traen ya puestas la proteína y la grasa de Entrenamiento, y los carbohidratos los
    escribe el coach (P-20.1);
  - las kcal de cada perfil salen de la vista previa de la API, con su método (RN-D02);
  - el código de un perfil nuevo sale de su nombre: mayúsculas sin tildes, sin chocar con REST, TRAINING ni otro perfil.
- Plan publicado: una tabla con Entrenamiento (prescripción) y cada perfil.
- Programa:
  - cada sesión elige su perfil entre los del plan más reciente del paciente; sin perfil, Entrenamiento;
  - un código que el plan ya no tiene sigue a la vista, para que no se pierda al guardar;
  - la semana de solo lectura dice el perfil de cada sesión.
- App del paciente: Hoy dice la meta de qué perfil es; Mi plan muestra las metas de cada tipo de día, con la de hoy marcada.
- Analítica de dieta: una columna con el perfil de cada día.
- Fichas: EXCHANGE_DIET 1.1.0 y WEEKLY_MENU 1.1.0 (el menú imprime también la composición), con «Metas por perfil de día»:
  - migración `202611080200_documents_day_profiles_templates`;
  - la 1.0.0 queda retirada y el código la sigue dibujando igual para lo ya generado (RN-H02);
  - un plan sin perfiles no agrega nada.
- `pnpm demo:3`: Mateo tiene su plan por la API.
  - La prescripción sale de su evaluación del 05/10: la vista previa da su GET y el ajuste lo deja en 2,510 kcal, con 160/310/70 g.
  - La composición son alimentos de la TPCA con todos sus datos: unas 2,450 kcal, en rango.
  - El perfil Descanso tiene 160/240/70 g (2,230 kcal).
  - Cada día de octubre lleva la meta de su perfil. La ausencia del 22/10 sigue en Entrenamiento: nadie reprogramó la sesión
    (P-20.3).
  - Una demo anterior a P14.5, que ya tenía el mes de Mateo sin plan, completa sus metas al correr otra vez.
Consecuencias:
- Unitarias: los perfiles en el borrador de la web y las fichas 1.1.0 frente a la 1.0.0.
- Integración: `demo-3.int.spec.ts` suma el plan de Mateo y sus metas de octubre.
- E2E `e2e/perfiles-dia.spec.ts` en escritorio y celular, con axe: Descanso con la proteína y la grasa puestas, sus kcal con
  su método, un perfil propio, y que todo vuelve igual al guardar.
- Siguen el PR 1b (las porciones del alimento fuente por perfil, P-20.5) y el 1e (reprogramar, P-20.3).
- Para Notion (/notion-sync de P14.5): 04 RF-24 (las fichas del plan muestran los perfiles) y RF-28 (Hoy y Mi plan), y
  05.3 (las plantillas 1.1.0).

## ADR-102 · Porciones de cada perfil de día por la API — aceptada (2026-11-09)
Contexto: P14.5, PR 1b (07 §2; P-20.5, respondida por Jeremy el 2026-11-08: el día de descanso es el mismo plan con menos
porciones de almidones o cereales, en las comidas peri-entreno o en el almuerzo y la cena; solo cambia la cantidad del alimento
fuente y la proteína y la grasa no se tocan). Rodrigo decidió el 2026-11-08: en intercambios, el coach con una sugerencia; en
composición y menú, gramos por alimento; la app muestra las porciones del perfil de hoy. Como en el 1c y el 1d, la API va
primero y las pantallas en el PR siguiente.
Decisión:
- Motor 1.9.0, `STARCH_BY_DAY_PROFILE` 1.0.0: los almidones de un perfil por tiempo de comida.
  - Los que pide el perfil salen de la diferencia de carbohidratos entre el perfil y el plan, en intercambios enteros (medio
    cuenta como uno).
  - Los de menos se quitan primero de la media tarde, luego de la cena y después del último tiempo del día al primero, sin
    bajar de 0.
  - Los de más se suman de a uno, alternando la media tarde y la cena: P-20.6, respondida por Jeremy el 2026-11-09 (b, con
    reparto alternado), para no tocar el desayuno, la media mañana ni el almuerzo. Un plan sin media tarde ni cena los suma por
    turnos del último tiempo al primero. Jeremy dio también otra opción, un tope por tiempo (por ejemplo, 2) y el resto hacia
    atrás hasta el almuerzo; queda la alternancia, que es la que eligió, y el coach cambia la sugerencia (RN-E09).
  - NC-ENG-313 (carbohidratos) y NC-ENG-314 (tiempos).
- Intercambios: `starchByProfile` en el borrador, un valor por tiempo, cuando el coach cambia la sugerencia.
  - Tabla `nutrition.plan_meal_profile_exchange`, solo con STA. Un perfil sin filas lleva la sugerencia, que el cálculo
    recalcula y el snapshot congela con su método (RN-D01).
  - Un tiempo sin almidones en el plan admite almidones permitidos si un perfil los lleva ahí; para publicar, todo tiempo con
    almidones en algún perfil necesita uno (RN-G05).
- Composición y menú: `byProfile` en cada alimento (gramos y medida casera) o receta (porciones).
  - Tabla `nutrition.plan_item_profile`. Solo se guarda lo que cambia lo del plan; 0 es «ese día no va».
  - Para publicar, ningún tiempo queda sin alimentos en un perfil, y en el menú la opción A tampoco (RN-G05).
- Cálculo: cada perfil suma su día con sus cantidades y su adecuación frente a sus metas (RN-E10). En intercambios, los totales
  con sus almidones; en composición, el día; en el menú, los siete días.
- Snapshot del plan versión 4: `portions` en cada perfil y `byProfile` en cada alimento o receta. En uno de la versión 3, cada
  perfil lleva las del plan (`portions: null` en la API).
- App del paciente: `GET /me/plan` muestra las porciones del perfil de la meta de ese día (`profile`), y «como en el plan»
  registra esas. Lo que ese día no va no aparece y no se registra desde el plan (NC-TRK, no está en el plan).
- La web conserva las porciones al guardar; editarlas, mostrarlas y las fichas llegan con el PR siguiente.
Consecuencias:
- Migración `202611090000_nutrition_profile_portions`: las dos tablas, con RLS forzada, sin acceso del paciente y solo en
  borrador (`nutrition.guard_plan_children`).
- Pruebas: el método en el motor; el dominio de intercambios, composición y menú; el cálculo de cada perfil; la app del
  paciente; la integración `day-profiles.int.spec.ts` con la sugerencia, el reparto del coach, el snapshot 4 y un día de
  Descanso en la app.
- Para Notion (/notion-sync de P14.5): 02 §9 (el método), 03 RN-E09 y RN-G05 (porciones por perfil), 04 RF-19 a RF-21 y RF-28,
  05.2 (las tablas) y 05 §2 (snapshot 4).

## ADR-103 · Pantallas de las porciones de cada perfil, fichas del plan 1.2.0 y el Descanso de Mateo — aceptada (2026-11-09)
Contexto: P14.5, PR 1f (07 §2; P-20.5; RN-E10, RN-G05, RN-H01, RN-H02; ADR-102). Las porciones de cada perfil llegaron por la
API en el PR 1b; faltaban las pantallas, las fichas y la demo.
Decisión:
- Intercambios, paso «Reparto y alimentos»:
  - una tarjeta por perfil con los almidones de cada tiempo junto a los de Entrenamiento;
  - la sugerencia lleva su método (`STARCH_BY_DAY_PROFILE`); «Ajustar a mano» parte de ella y «Volver a la sugerencia» la
    recupera;
  - cada perfil muestra su adecuación frente a sus metas;
  - agregar o quitar un tiempo ajusta el reparto del coach, y el de un perfil que ya no está no viaja.
- Composición y menú: «Porciones de» elige Entrenamiento (el plan) o un perfil.
  - En un perfil se escriben solo las cantidades: vacía es la del plan y 0 es «ese día no va». Agregar, quitar y la medida
    casera son del plan.
  - La medida casera guardada de un perfil se conserva mientras no cambien sus gramos.
  - El día (composición) o la semana (menú) y la adecuación del lado son las del perfil elegido. El menú trae el promedio de
    la semana de cada perfil desde la API (ADR-102).
  - Un perfil nuevo usa el código que tomará de su nombre al guardar.
- Plan publicado:
  - en intercambios, la tabla de almidones de cada perfil y su adecuación;
  - en composición y menú, cada alimento dice su cantidad en los perfiles que la cambian («Descanso: 100 g», «no va») y cada
    perfil muestra su adecuación.
- App del paciente: Hoy y Plan dicen de qué perfil son las porciones de hoy. La API ya las da (ADR-102).
- Fichas EXCHANGE_DIET y WEEKLY_MENU 1.2.0 (migración `202611090100_documents_profile_portions_templates`):
  - la dieta suma «Almidones por perfil de día»;
  - el menú, que imprime también la composición, suma «Porciones por perfil de día» con cada alimento o receta que cambia;
  - la 1.1.0 queda retirada y se sigue dibujando igual (RN-H02);
  - el contenido de la ficha solo suma esos datos cuando existen, así que lo publicado antes de las porciones da la misma
    ficha.
- `pnpm demo:3`: el Descanso de Mateo lleva 30 g de pan en la media tarde (en vez de 100) y 50 g de papa en la cena (en vez
  de 200): unos 240 g de carbohidratos con la TPCA. Son de ejemplo, mientras Jeremy no dé los de Mateo.
Consecuencias:
- Unitarias: las cantidades por perfil y los almidones a mano en los borradores de la web; las fichas 1.2.0 frente a la
  1.1.0, con y sin porciones.
- Integración: `documents.int.spec.ts` con la plantilla 1.2.0; `demo-3.int.spec.ts` con el Descanso de Mateo en unos 240 g.
- E2E `e2e/perfiles-dia.spec.ts`: la sugerencia y el ajuste de almidones, y los gramos de Descanso en una composición hasta
  el plan publicado, con axe.
- Para Notion (/notion-sync de P14.5): 04 RF-24 (fichas 1.2.0) y RF-28 (Hoy y Plan), y 05.3 (las plantillas 1.2.0).

## ADR-104 · Los cambios del día por la API: «no entreno hoy», «mover a mañana» y el perfil por fecha — aceptada (2026-11-10)
Contexto: P14.5, PR 1e (07 §2 y §8; P-20.3 y P-20.4; RN-G03). Jeremy respondió en P-20.3 que el día pasa a descanso solo si se
reprograma la sesión a tiempo: «no entreno hoy» baja la meta de hoy, «mover a mañana» cambia hoy a 2,230 kcal y mañana a 2,510,
y nunca de forma automática a medianoche. ADR-100 dejó que lo hacen el paciente y el coach, solo hoy y mañana. Rodrigo decidió el
2026-11-10:
- «mover a mañana» mueve también la sesión: Entreno la muestra mañana y deja registrarla, y la sesión lleva su perfil;
- si mañana ya tiene sesión, solo se ofrece «no entreno hoy»: nada de dos sesiones el mismo día ni desplazamientos en cascada
  antes de P15;
- «sí entreno hoy» deshace el cambio mientras no termine el día; si fue «mover a mañana», la sesión vuelve a hoy y mañana a
  Descanso;
- el coach elige para hoy o mañana cualquier perfil del plan: Entrenamiento, Descanso o los propios (P-20.4).
Como en el 1c y el 1d, la API va primero y las pantallas en el PR siguiente (1g).
Decisión:
- Tabla `tracking.day_change` (migración `202611100000_tracking_day_changes`), un cambio por fila:
  - `NOT_TRAINING` y `MOVED` en el día de hoy (en `MOVED`, el día del que sale la sesión hacia el siguiente);
  - `PROFILE` con el código del perfil, para hoy o mañana;
  - quién lo hizo (`created_by` y su rol) y cuándo. Deshacer lo anula (`voided_at`); nunca se borra.
  - Un cambio vigente de cada tipo por día. RLS de tenant, del equipo de atención y de ACCOUNT; el paciente solo los suyos.
- Dominio (`day-changes.ts`, `day-schedule.ts` y el calendario de `active-program.ts`):
  - entre los cambios que tocan un día, manda el último: «no entreno hoy» es Descanso, el del coach es su perfil y una sesión que
    se fue o llegó vuelve al perfil de la sesión del día;
  - la sesión movida sale de hoy, que queda sin sesiones, y llega a mañana con su semana del programa;
  - «no entreno hoy» no toca la meta de entrenamiento: la sesión sigue planificada y no hecha (P-33, manda la asistencia);
  - «mover a mañana» se ofrece si la sesión es de hoy (la que llegó de ayer no se vuelve a mover) y mañana es un día del programa
    sin sesión;
  - el perfil del coach vale también sin programa.
- API:
  - el paciente: `POST /me/schedule/today` con `NOT_TRAINING`, `MOVE_TO_TOMORROW` o `UNDO`, y Hoy (`GET /me/today`) trae la agenda
    de hoy y mañana con lo que puede hacer (`schedule`);
  - el coach: `GET /patients/:id/schedule` con los perfiles que puede poner, `POST /patients/:id/schedule/today` y
    `PUT /patients/:id/schedule/:fecha/profile`, con acceso de escritura al paciente;
  - lo que el día no permite da 422: NC-TRK-014 (no entreno), NC-TRK-015 (mover), NC-TRK-016 (deshacer), NC-TRK-017 (una fecha
    que no es hoy ni mañana) y NC-TRK-018 (un perfil que el plan no tiene).
- La meta de hoy: el paciente no escribe su meta (RN-G03). El cambio deja `tracking.day.rescheduled`, y tracking vuelve a fijar
  la meta de hoy con el contexto SYSTEM (`tracking.day-changes`) y avisa con `tracking.target.changed`, que la analítica usa para
  recalcular el día y las semanas del programa. La de mañana la fija el trabajo de cada hora al llegar el día, con los cambios.
- Entreno, el registro diario y el registro de una sesión leen el día con sus cambios.
Consecuencias:
- Unitarias: el calendario con la sesión movida, el último cambio que manda, lo que se puede hacer hoy, la agenda con sus kcal y
  los errores de cada acción; los contratos de las acciones.
- Integración `day-changes.int.spec.ts` (10 casos como app_user): mover y deshacer con la meta de hoy y el resumen diario, «no
  entreno hoy», los 422, el coach con sus perfiles y el trabajo de cada hora con el perfil del coach.
- PR 1g: los botones en Hoy y en Entreno de la app, y la agenda del paciente para el coach.
- Para Notion (/notion-sync de P14.5): 07 §8 (los cambios del día), 03 RN-G03 (la meta de hoy cambia solo con un cambio del día),
  04 RF-28 y RF-29, 05.2 (`tracking.day_change`) y 02 §8 (los dos eventos).

## ADR-105 · Pantallas de los cambios del día: Hoy y Seguimiento — aceptada (2026-11-10)
Contexto: P14.5, PR 1g. La API de los cambios del día llegó en el PR 1e (ADR-104).
Decisión:
- App del paciente, Hoy: la tarjeta «Hoy y mañana».
  - Cada día dice su perfil, sus kcal y sus sesiones («Descanso · 2,230 kcal · sin sesión»).
  - Muestra «No entreno hoy», «Mover a mañana» y «Sí entreno hoy» solo cuando el día lo permite.
  - Un aviso dice qué cambió hoy: no entrena, la sesión pasó a mañana, llegó la de ayer o el coach eligió el perfil.
  - Cada toque lleva su Idempotency-Key.
- Panel, Seguimiento: «Hoy y mañana», arriba de los registros.
  - Cada día muestra su perfil, sus kcal, sus sesiones y el cambio que lo decidió.
  - «Perfil de hoy» y «Perfil de mañana» ofrecen «Lo que pide el programa» y los perfiles del plan.
  - El coach hace los mismos tres cambios por el paciente. Lo que el rol no puede lo decide la API.
- Entreno no cambia: la API ya da la sesión movida en su nuevo día.
Consecuencias:
- Unitarias: los textos de la agenda.
- E2E `e2e/perfiles-dia.spec.ts`, con axe:
  - el paciente pasa su sesión a mañana y lo deshace;
  - el coach elige el perfil de mañana.
- Para Notion (/notion-sync de P14.5): 04 RF-28 (Hoy) y RF-29.

## ADR-106 · Volumen ajustado por RIR y descanso — aceptada (2026-11-10)
Contexto: P14.5, PR 2 (07 §10; P-26, respondida por Jeremy el 2026-11-10; RN-F03, RN-F06; ADR-098). El prompt pide volumen ×
factor RIR × factor descanso, con las tablas como datos versionados. Un valor que la hoja no trae queda «sin factor», nunca como 1.
El ejemplo de la hoja, 3 × 12 × 45 kg con RIR 2 y 120 s, da 1,782.
Decisión:
- Motor 1.10.0, `ADJUSTED_VOLUME` 1.0.0:
  - por serie, repeticiones × carga × factor RIR × factor del descanso prescrito;
  - la fila exacta de la tabla o la última «o más» que alcanza el valor; si no, «sin factor»: la serie no suma al ajustado y se
    cuenta aparte;
  - sin carga (peso corporal sin lastre, movilidad o cardio), 0 kg, como dijo Jeremy;
  - NC-ENG-411 (tabla mal formada) y NC-ENG-412 (valores negativos).
- `training.volume_factor_table` (migración `202611100100_training_volume_factors`), versionada como los umbrales de 07 §11.
  - Una fila global con los valores de P-26: RIR 0 = 1.3 a RIR 5 o más = 0.8; 45 s = 1.15, 60 = 1.10, 75 = 1.05, 90 y
    120 = 1.00, 180 s o más = 0.95.
  - Vale desde el 2026-01-01, para cubrir la hoja de Mateo. La de la organización manda sobre la global desde que vale.
  - Se lee con `TrainingApi.volumeFactorVersions`, y la analítica elige la vigente de cada día.
- El descanso es el prescrito: en el snapshot del programa del entreno, la serie con su número en el ejercicio de su sesión.
  - Si el paciente hizo más series que las prescritas, vale la última.
  - Sin sesión, el ejercicio donde aparece primero en el programa.
  - Los hechos de tracking suman `setNo` a cada serie y `sessionId` a cada entreno.
- Analítica:
  - `adjusted_volume_kg` y `unfactored_sets` en el resumen diario y en el volumen semanal por grupo; cada grupo lleva el principal
    al 100 % y el secundario al 50 %, como el tonelaje (ADR-088);
  - la semana suma sus días, y la API da el método (`methods.adjustedVolume`);
  - en la web, «Volumen ajustado» por semana y por grupo, con «n sin factor» aparte.
- Por confirmar con Jeremy, sin inventar mientras tanto: un descanso entre dos valores de la tabla (100 s, 150 s), uno de menos
  de 45 s y una serie con RPE y sin RIR quedan «sin factor». Cambiarlo es cambiar la tabla o el método.
Consecuencias:
- Motor: el ejemplo de la hoja, «o más», «sin factor», sin carga y los errores. Se propone como caso dorado G-42 en el
  /notion-sync.
- Analítica: la tabla vigente cada día, el descanso prescrito y el ajustado por grupo.
- Integración `analytics-training.int.spec.ts`: 8 × 60 kg con RIR 2 y 90 s da 528, y la serie sin RIR queda «sin factor»; la
  reconstrucción da lo mismo.
- Sigue el PR 4 (fatiga por grupo muscular, P-27), que usa este volumen ajustado por grupo.
- Para Notion (/notion-sync de P14.5): 02 §9 (`ADJUSTED_VOLUME`), 03 (una regla del volumen ajustado y G-42), 05.2
  (`training.volume_factor_table`), 05.3 (las columnas de analytics) y 04 RF-33.

## ADR-107 · La cadera en Progreso, la comparativa física y el estrés en el control semanal — aceptada (2026-11-10)
Contexto: P14.5, PR 6a (fase A; RF-30, RF-35, RF-42; ADR-098). La hoja piloto muestra una «Comparativa física»: peso 80 → 79 kg,
cintura 88 → 85 cm, cadera 100 → 99 cm y grasa por bioimpedancia 22 → 20.8 %. También muestra el estrés de cada semana. La app
no tenía la cadera en Progreso, no juntaba esos cuatro números y no mostraba el estrés en el control.
Decisión:
- App del paciente, Progreso: la cadera, después de la cintura, con su CMD95 (RN-C06).
  - La migración `202611100200_assessment_patient_evolution_hip` suma `GIRTH_HIP` a `app.patient_evolution_sites()`.
  - La función sigue sirviendo solo a la sesión PATIENT, y solo para lo suyo.
- Panel, Evaluaciones › Evolución: «Comparativa física», arriba.
  - Peso, cintura y cadera, de la primera evaluación a la última, con su cambio frente al CMD95.
  - El % de grasa de cada método y de cada equipo de bioimpedancia, por separado y sin CMD95 (RN-D03, RN-C05, RN-C08).
  - Sale de la evolución que la API ya daba (el cambio total de cada serie); no hay cálculo nuevo.
- Control semanal: el estrés promedio de la semana en el resumen, desde el registro diario.
  - No entra en `WEEKLY_REVIEW_JV` ni en el semáforo: P-25 dice que el panel solo informa y decide el control.
  - Cambiar los insumos del método habría reemplazado los controles ya decididos.
  - tracking da el estrés en los registros de la semana (`WeekCheckin.stress`).
Consecuencias:
- Unitarias: la comparativa (el orden, la bioimpedancia aparte y nada con una sola evaluación) y el estrés promedio.
- Integración: la cadera en `/me/evolution` (`evolution.int.spec.ts`) y el estrés de Mateo, 3, 4, 3 y 2, en su control semanal
  (`demo-3.int.spec.ts`).
- Guion de la Demo 3: la comparativa en Evolución, la cadera en Progreso y el estrés en el control.
- Para Notion (/notion-sync de P14.5): 04 RF-30 (la cadera), RF-35 (la comparativa) y RF-42 (el estrés en el resumen).

## ADR-108 · Panel de fatiga y recuperación, con alerta en Inicio — aceptada (2026-11-10)
Contexto: P14.5, PR 3 (fase B; P-23 a P-25, respondidas por Jeremy el 2026-11-09; RN-G16; RF-33, RF-34; ADR-098). La hoja piloto
trae un panel por semana: recuperación, carga, fatiga percibida y estado general. Jeremy dio los umbrales de ámbar, la regla del
estado general y el promedio de 3 semanas, y dijo que el panel solo informa. Rodrigo decidió el 2026-11-10:
- los promedios se comparan por rangos, sin redondear: menos de 3.0 es verde, de 3.0 a menos de 4.0 es ámbar y 4.0 o más es rojo;
- el 22/10 de Mateo pasa a «ASISTIÓ» en `demo:3` (P-33), para que la semana 3 dé los 6,336 de la hoja.
Decisión:
- Motor 1.11.0, `FATIGUE_PANEL_JV` 1.0.0, por semana del macrociclo:
  - recuperación: roja con estrés de 4 o más o sueño de menos de 6 h; ámbar con estrés de 3 o más o sueño de menos de 7 h; con
    un solo dato, decide ese; sin ninguno, «faltan datos»;
  - carga: el volumen ajustado (ADR-106) frente al promedio de las 3 semanas previas que tienen volumen (P-24: las vacías no
    cuentan en la suma ni en el divisor). Ámbar sobre +15 % y roja sobre +30 %. Sin previas, «sin base»; sin volumen, «faltan
    datos». Se compara sin dividir, para que +30 % exacto no caiga en rojo por el redondeo binario;
  - fatiga percibida: ámbar desde 3 y roja desde 4;
  - estado general: el peor de los tres. «Sin base» no suma alerta, y lo que no tiene datos no decide;
  - NC-ENG-413 (insumos fuera de rango) y NC-ENG-414 (umbrales cruzados).
- `training.fatigue_panel_threshold` (migración `202611100300_training_fatigue_panel`), versionada como los umbrales de 07 §11:
  - una fila global con los valores de P-23, desde el 2026-01-01;
  - se lee con `TrainingApi.fatiguePanelThresholdVersions`, y vale la versión vigente al empezar cada semana;
  - las 3 semanas de la base son del método, no de la tabla. Todavía no se editan en Ajustes.
- Analítica:
  - la fatiga del registro diario pasa al resumen diario (`fatigue`); las filas que ya existen se llenan con `analytics:rebuild`;
  - el sueño se promedia en décimas, porque se guarda con un decimal: 7 días de 7.1 h dan 7.1 exacto;
  - `GET /patients/:id/analytics/training` da el panel de cada semana que empezó (`weeks[].fatigue`), con la versión de los
    umbrales y el hash de sus insumos, y el método en `methods.fatiguePanel`.
- Inicio: `FATIGUE_RED` y `FATIGUE_AMBER` con el estado general de la última semana cerrada del programa vigente, durante 7 días,
  como el semáforo de la semana. Llevan a Analítica › Rutina.
- Web: «Panel de fatiga y recuperación» en Analítica › Rutina, con estrés, sueño, fatiga percibida, volumen ajustado, «Prom. 3
  sem.», carga con su cambio, recuperación, fatiga y estado general. Cada color va con su ícono y su texto.
- No cambia el control semanal (P-25): el panel no entra en `WEEKLY_REVIEW_JV` ni en su decisión.
Consecuencias:
- Motor: las semanas de Mateo de la hoja (ámbar, rojo, ámbar, verde y faltan datos, con las bases 5,220, 5,355, 5,682, 5,067 y
  4,855.5), los bordes de cada umbral y los errores. Se propone como caso dorado G-43 en el /notion-sync.
- Integración: `demo-3.int.spec.ts` reproduce el panel de la hoja por HTTP (criterio de la fase B), con 12 sesiones y 5,760 kg
  en la semana 3; `analytics-training.int.spec.ts`, la semana en curso «sin base».
- E2E `analitica.spec.ts`: el panel de Luis en rojo por la fatiga y la alerta en Inicio.
- Para Notion (/notion-sync de P14.5): 02 §9 (`FATIGUE_PANEL_JV`), 03 (una regla del panel, RN-G18, y G-43), 05.2
  (`training.fatigue_panel_threshold`), 05.3 (la columna `fatigue` y las alertas de `patient_overview`), 04 RF-33 y RF-34, y
  07 §10 y §15 (P-23 a P-25 y P-33 resueltas).

## ADR-109 · El check-in de la semana por la API — aceptada (2026-11-10)
Contexto: P14.5, PR 5a (fase B; P-21 y P-22, respondidas por Jeremy el 2026-11-09; RN-G11, RN-G12, RN-G13; ADR-098). Jeremy
quiere el registro diario corto de hoy y, el domingo, un check-in de 2 minutos con la alimentación de la semana (0 a 100 %), el peso
y comentarios. Rodrigo decidió el 2026-11-10:
- la alimentación sale del registro diario y pasa al domingo, y el control semanal toma ese valor; los registros diarios ya
  guardados se conservan;
- el check-in se completa del domingo al martes siguiente;
- los comentarios llegan al coach como una nota sin leer, como las demás notas de la app.
Rodrigo lo confirmó el 2026-11-11:
- el check-in pide el peso solo si la app del paciente permite el peso en casa (content), como el resto de la app;
- enviarlo otra vez dentro del plazo lo corrige, como el registro diario (RN-G12).
Decisión:
- `tracking.weekly_checkin` (migración `202611100400_tracking_weekly_checkin`):
  - el domingo de la semana, el día en que lo envió y la alimentación;
  - el id de su peso (`tracking.metric_log`) y de su nota (`tracking.note_log`), sin FK porque son particionadas (ADR-024);
  - uno vigente por domingo. Corregirlo anula el anterior, nunca lo borra;
  - RLS de la organización, del equipo de atención, del paciente (solo lo suyo) y de la cuenta, como `tracking.day_change`.
- `POST /me/weekly-checkins` (`@PatientOnly`, con Idempotency-Key y clientId, RN-G08). En una transacción:
  - el domingo debe ser el del check-in abierto hoy, en la fecha local del paciente: NC-TRK-019 si no es domingo y NC-TRK-020
    si ya cerró o no llegó;
  - el peso es su medida BODY_WEIGHT del día en que lo envía, con las reglas del peso en casa (WEIGHT_LOG_DISABLED si la app no
    lo permite; de 20 a 300 kg, RN-C04);
  - el comentario es una nota del paciente sin leer: su equipo la ve en Seguimiento y en la alerta de Inicio (RN-G13);
  - una corrección anula el peso anterior. La nota anterior queda, porque una nota no se anula;
  - el evento `tracking.weeklycheckin.logged`. Los tipos de evento solo admiten letras: `contexto.agregado.hecho`.
- `GET /me/today` trae `weeklyCheckin` del domingo al martes, con el martes de cierre, si pide el peso y el que ya envió.
- Motor 1.12.0, `WEEKLY_REVIEW_JV` 3.1.0: `weeklyNutritionCompliancePct` manda sobre el promedio de los días.
  - Sin check-in no se envía: los controles que ya existen conservan sus insumos y su hash y no se reemplazan.
  - Un check-in tardío (lunes o martes) reemplaza el control de esa semana al recalcularse, como cualquier registro tardío.
  - training lo lee con `WeekCheckinSource.weeklyNutrition`, que da tracking.
- `demo:3`: la alimentación de Mateo va en sus 4 check-in de domingo (78, 82, 88 y 92 %), y su control da lo mismo.
- Pruebas de integración: el arnés acepta un reloj fijo y entrega los eventos por el id (UUID v7, hora real) y no por
  `occurred_at`, que sale de ese reloj.
- La app y el panel llegan en el PR 5b.
Consecuencias:
- Dominio: el plazo del domingo al martes y el domingo de cada semana. Motor: el check-in manda, sin él nada cambia, y su rango.
- Integración `weekly-checkin.int.spec.ts`, con el reloj en el último domingo:
  - con peso y comentario, la medida y la nota sin leer;
  - el reintento sin duplicar;
  - la corrección del lunes;
  - el miércoles cerrado;
  - sin el peso en casa;
  - lo que lee el control semanal.
- Para Notion (/notion-sync de P14.5): 03 RN-G11 (el check-in del domingo), 05.2 (`tracking.weekly_checkin`), 02 §8 (el evento),
  02 §9 (`WEEKLY_REVIEW_JV` 3.1.0), 04 RF-29 y RF-42, y 07 §9, §10 y §15 (P-21 y P-22 resueltas).

## ADR-110 · Las pantallas del check-in de la semana — aceptada (2026-11-10)
Contexto: P14.5, PR 5b (fase B; P-21 y P-22; ADR-109). La API del check-in llegó en el PR 5a.
Decisión:
- App del paciente, Hoy: «Check-in de la semana», del domingo al martes, cuando `/me/today` lo trae.
  - Pide cuánto de su plan de alimentación cumplió en la semana (0 a 100 %, obligatorio).
  - Pide su peso de hoy, opcional y solo si su app permite el peso en casa.
  - Pide un comentario para su equipo, opcional, que le llega como nota.
  - Dice hasta qué martes se completa. Enviado, muestra el porcentaje y si el equipo recibió el comentario, con «Corregir».
  - Corregir no repite el peso ni el comentario ya enviados.
  - Cada envío lleva su clientId y su Idempotency-Key.
- Registro diario: deja de pedir la alimentación (P-22). Un registro ya guardado conserva la suya y la API la sigue aceptando.
- Control semanal: «Alimentación de la semana» en vez de «Alimentación promedio», porque ahora es la del check-in del domingo
  y, sin check-in, el promedio de los días.
- E2E `app-paciente.spec.ts`: el check-in completo, con la corrección y la nota en Seguimiento.
  - Solo corre del domingo al martes en Lima, porque la app no cambia la fecha; los demás días se salta, y la integración lo
    prueba con un reloj fijo (ADR-109).
  - Dos pasos de ese archivo reintentan la navegación que sigue a un `router.refresh()`: ir a Más después del agua y al
    registro después de autorizar el ciclo. En el celular, a veces se cruzaban.
Consecuencias:
- Unitarias: lo que valida el formulario, el cuerpo del POST y el texto del plazo.
- Guion de la Demo 3: el check-in en Hoy del paciente de prueba, si la demo cae de domingo a martes.

## ADR-111 · Los patrones y los ejercicios de la prescripción de la hoja — aceptada (2026-11-10)
Contexto: P14.5, PR 9a (fase B; P-34, respondida por Jeremy el 2026-11-10; RN-F11, RN-F14; ADR-098). La prescripción de la hoja
piloto trae patrones que la biblioteca no tenía, y Jeremy dio sus ejercicios por nivel, solo con el nombre. Rodrigo decidió el
2026-11-10:
- se cargan como provisionales, con valores estándar, hasta que Jeremy los valide;
- «Brazos» va en dos bloques, Bíceps y Tríceps;
- con 3 días se usa la plantilla de cuerpo completo A, B y C de la V3.
Decisión:
- Tres patrones nuevos, después de los 15 de la V3 (migración `202611100500_exercise_pilot_patterns`):
  - movilidad de hombro (`SHOULDER_MOBILITY`);
  - movilidad torácica (`THORACIC_MOBILITY`);
  - estabilidad lumbar (`LUMBAR_STABILITY`).
  - Antirrotación, antiextensión, cardio y brazos ya existían.
  - Los equipos nuevos son el rodillo de espuma y la bicicleta de aire.
  - Los códigos son los mismos en el motor, los contratos, la API y la base.
- Los ejercicios de Jeremy que faltaban, en `seeds/exercise/ejercicios-base.csv`, todos provisionales (RN-I02):
  - movilidad de hombro: dislocaciones con banda, rotación externa en polea y CARs de hombro;
  - movilidad torácica: open book en el suelo, extensión torácica en rodillo y rotación torácica en cuadrupedia;
  - estabilidad lumbar: el bird dog, que pasa de antirrotación a este patrón como en la lista de Jeremy, el puente glúteo
    unilateral y el hip thrust isométrico;
  - el Pallof press en split stance, los intervalos en bicicleta de aire y el curl con barra Z;
  - los alias «Pallof press isométrico» y «Extensión tras nuca» para dos ejercicios que ya estaban.
  - Cada uno lleva músculo principal y secundarios, equipo, precaución, variantes y valores base estándar.
  - «/lado» es un ejercicio unilateral con repeticiones, y «s/lado», uno unilateral medido en segundos: la biblioteca ya los
    tenía.
- La tabla patrón × nivel suma las 9 filas de los patrones nuevos, con los ejercicios de Jeremy de básico a avanzado.
  - Las 45 filas de la V3 no cambian, tampoco en los patrones que ya existían.
  - Las listas de Jeremy para antirrotación, antiextensión, cardio y brazos quedan como variantes en la biblioteca, porque
    cambiar esas filas movería la propuesta de la V3 que ya se probó (G-32).
- La plantilla de sesiones de la V3 no cambia: los patrones nuevos se eligen a mano en un bloque hasta el PR 9b.
Consecuencias:
- Pruebas:
  - los 18 patrones en el motor, la API y la base;
  - las 54 filas de la tabla;
  - los ejercicios de Jeremy por nivel;
  - el catálogo en la integración.
- Para el PR 9b, a confirmar:
  - con 5 días, Jeremy quiere torso-pierna más Acondicionamiento, pero RN-F14 y G-31 dicen push/pull/legs;
  - los bloques «Flexión de rodilla» y «Extensión de rodilla» de la hoja no son patrones de la biblioteca: el curl femoral
    está en bisagra y la extensión de rodilla en sentadilla.
- Para Notion (/notion-sync de P14.5): 07 §5 (18 patrones y la tabla), 05.2 (los patrones y los equipos) y RN-I02 (los ejercicios
  provisionales de la hoja).

## ADR-112 · La propuesta con las sesiones de la hoja: superior, inferior y acondicionamiento — aceptada (2026-11-11)
Contexto: P14.5, PR 9b (P-34, respondida por Jeremy el 2026-11-10; RN-F14; ADR-098 y ADR-111). RN-F14 y el caso dorado G-31 dan
push/pull/legs con 5 días y los mismos valores en todos los bloques: 3 × 8–12, RIR 2, tempo 2-1-2 y 90 s. La hoja piloto trae, con
4 días, Superior A, Inferior A, Superior B e Inferior B; con 5, lo mismo con Acondicionamiento; el tempo y el descanso de cada patrón;
y bloques de flexión y de extensión de rodilla. Rodrigo decidió el 2026-11-11 seguir la hoja en los tres puntos.
Decisión:
- Plantilla de la propuesta 2.0.0 (motor 1.13.0):
  - 2 días o menos, cuerpo completo; 3, cuerpo completo A, B y C: los días 1 a 3 de la V3, sin cambios en sus bloques;
  - 4 días, `UPPER_LOWER`: Superior A, Inferior A, Superior B e Inferior B, con los bloques de la hoja en su orden;
  - 5 días, `UPPER_LOWER_CONDITIONING`: lo mismo, con Acondicionamiento el día 3, como la hoja (miércoles);
  - «Brazos» son dos bloques, Bíceps y Tríceps (ADR-111): Superior B tiene 6 y las demás sesiones de la hoja, 5.
- El tempo y el descanso salen del patrón (`PATTERN_BASE`), con los valores de la hoja: sentadilla 3-1-1 y 120 s; bisagra,
  unilateral y empuje horizontal 3-1-1 y 90 s; extensión de cadera 2-1-2 y 120 s; tracción horizontal 2-1-2 y 90 s; empuje y
  tracción verticales, flexión y extensión de rodilla 2-1-2 y 75 s; hombro, brazos, pantorrilla y antirrotación 2-1-2 y 60 s;
  tronco anti-extensión «Controlado» y 60 s; movilidad de hombro 2-1-2 y 45 s; movilidad torácica y estabilidad lumbar
  «Controlado» y 45 s; cardio «Continuo» y 0 s. La única excepción es la de la hoja: el press Pallof del acondicionamiento es
  «Isométrico» y con 45 s.
- Las series, las repeticiones y el RIR base siguen en 3 × 8–12 y RIR 2, y la semana cambia las series y el RIR (RN-F13): la
  respuesta de Rodrigo fue sobre el tempo y el descanso. La hoja da 2 series a los bloques accesorios y otros rangos (10–15,
  12–15, «/lado», minutos y segundos): queda por confirmar.
- La flexión y la extensión de rodilla son patrones (migración `202611110100_training_pilot_template`, que también suma
  `UPPER_LOWER_CONDITIONING` al CHECK de `training.program.split`). El curl femoral en máquina y con banda (HG09, HG10) y la
  extensión de rodilla (SQ10) pasan a esos patrones; no estaban en la tabla patrón × nivel. Sus 6 filas son provisionales: el
  mismo ejercicio en los tres niveles hasta que Jeremy dé los suyos.
- `PUSH_PULL_LEGS` queda en los contratos y en la base para los programas que ya la guardaron. Los programas propuestos con la
  plantilla 1.0.0 conservan su `template_version` y su estructura: nada se recalcula (RN-D08).
- G-31 con 5 días pasa a `UPPER_LOWER_CONDITIONING`. El criterio 4 de P12 compara la hoja PRESCRIPCION de la V3 con la propuesta
  de 3 días (sus 24 primeras filas); con 4 días, la integración compara las sesiones de la hoja piloto.
- Lo que muestra la prescripción («/lado», «s/lado», «esfuerzo suave (RPE 5–6)», la etiqueta y el botón de WhatsApp) y la versión
  nueva de la ficha de rutina llegan en el PR 9c.
Consecuencias:
- Pruebas:
  - motor: las divisiones y los nombres, los bloques de 4 y 5 días, el tempo y el descanso de cada patrón, los 20 patrones entre
    las plantillas, G-31 y el criterio 4 de P12;
  - API: la propuesta como programa;
  - integración: el catálogo con 20 patrones, la tabla con 60 filas y el criterio de P12 con 4 días;
  - E2E: la propuesta de 4 días, con sus 21 bloques, se aprueba o se sustituye y se publica.
- Por confirmar con Jeremy: los ejercicios por nivel de la flexión y de la extensión de rodilla, y las series y las repeticiones
  de cada bloque de la hoja.
- Para Notion (/notion-sync de P14.5, antes de fusionar): 03 RN-F14 y G-31; 07 §5 (20 patrones y la tabla) y §6 (las sesiones de
  4 y 5 días y el tempo y el descanso por patrón); 05.2 (los patrones y la división); 02 §9 (la plantilla 2.0.0).

## ADR-113 · El volumen ajustado sin vacíos: descanso por tramos y RPE sin RIR — aceptada (2026-11-11)
Contexto: P14.5 (P-26; RN-F03, RN-F05; ADR-106). `ADJUSTED_VOLUME` 1.0.0 dejaba «sin factor» un descanso entre dos filas de la tabla
(100 s, 150 s), uno de menos de 45 s y una serie con RPE y sin RIR, hasta que Jeremy dijera otra cosa. Rodrigo respondió el
2026-11-11: el descanso por tramos (hasta 45 s = 1.15, de 46 a 60 s = 1.10, de 61 a 75 s = 1.05, de 76 a 179 s = 1.00 y 180 s o
más = 0.95), con RPE y sin RIR el RIR es 10 − RPE entre 0 y 5, y un RPE con decimal sigue la fórmula de Jeremy.
Decisión:
- `ADJUSTED_VOLUME` 1.1.0 (motor 1.14.0), con las mismas tablas versionadas (`training.volume_factor_table` no cambia):
  - el descanso: cada fila vale hasta su valor, la «o más» desde el suyo y, entre la última fila y la «o más», la última. Así
    salen los tramos de Rodrigo de la tabla de Jeremy, sin escribirlos aparte;
  - el RIR: la fila exacta, la «o más» o, entre dos filas, la recta entre ellas, que con la tabla de Jeremy es su fórmula
    (1.0 + (3 − RIR) × 0.1). RPE 8.5 = RIR 1.5 = 1.15;
  - con RPE y sin RIR, el RIR es 10 − RPE entre 0 y 5 (RN-F05); con los dos, manda el RIR. Un RPE fuera de 0 a 10 da NC-ENG-412.
- Sin RIR ni RPE, o sin descanso prescrito, la serie sigue «sin factor», nunca como 1.
- La API pasa el RPE de cada serie al motor, en el resumen diario y en el volumen de la semana por grupo. Los días ya resumidos
  con 1.0.0 conservan su valor hasta que un registro los vuelva a calcular, como cualquier proyección (ADR-087).
Consecuencias:
- Motor: cada tramo en su borde (30, 45, 46, 60, 61, 75, 76, 100, 150, 179, 180 y 240 s), RPE 8, 10 y 4, RPE 8.5 y 5.5, y el RPE
  fuera de rango. API: una serie con solo RPE y 100 s suma al ajustado del grupo. La integración ve la versión 1.1.0.
- Para Notion (/notion-sync de P14.5): 07 §10 y §15 (P-26 resuelta del todo), 02 §9 (`ADJUSTED_VOLUME` 1.1.0) y el caso dorado
  propuesto G-42.

## ADR-114 · Cómo se escribe la prescripción: «/lado», segundos y esfuerzo suave — aceptada (2026-11-11)
Contexto: P14.5, PR 9c (P-34.4 y P-34.6, respondidas por Jeremy el 2026-11-10; RN-F12, RN-H01, RN-H02; ADR-111 y ADR-112). La hoja
piloto escribe «10–12/lado» en los ejercicios unilaterales, «20–30 s/lado» en las isometrías y RIR 4 o 5 en la movilidad y el cardio,
que para Jeremy solo indica un esfuerzo suave (RPE 5 a 6). La app escribía «8 a 12 rep», los minutos y el RIR, y el snapshot del
programa no sabía si un ejercicio es unilateral ni cómo se mide.
Decisión:
- El snapshot del programa congela, de cada ejercicio, si es unilateral, su modalidad y cómo se mide (`isUnilateral`, `modality`,
  `baseMeasure`), como sus músculos (RN-F12). Un programa publicado antes no los trae: se escribe como antes. `/me/training` los da
  a la app.
- Un solo texto en contracts (`prescriptionParts` y `prescriptionText`) para el panel, la app y la ficha:
  - «8 a 12 rep/lado» en un unilateral;
  - en segundos si el ejercicio se mide en segundos («30 s», «20 s/lado»); si no, en minutos, como el cardio (RN-F10);
  - «esfuerzo suave (RPE 5–6)» con RIR 4 o más en la movilidad y el cardio; con RIR 3, o en fuerza, el RIR.
- La ficha de rutina 1.1.0 (migración `202611110200_documents_training_template_110`) escribe las series así; sus secciones no
  cambian. La 1.0.0 queda retirada y se sigue dibujando igual para lo que ya se generó con ella (RN-H02).
- En el panel, la columna «Cardio» de las series pasa a «Tiempo», porque también lleva los segundos de una isometría.
- El editor del programa sigue con su resumen de siempre mientras se arma: el texto nuevo es el de lo que se lee.
- La etiqueta y el botón de WhatsApp (P-35) quedan para un PR aparte, cuando se decida dónde se activan.
Consecuencias:
- Contratos: el texto en cada caso (unilateral, isometría, cardio con RIR 5, movilidad con RIR 4 y 3, cargas y números).
- API: el snapshot con los tres datos y la ficha 1.1.0 frente a la 1.0.0 (renderer); la integración ve la ficha 1.1.0 y el
  documento con el split squat unilateral. Web: la app con «/lado» y el esfuerzo suave.
- Para Notion (/notion-sync de P14.5): 05.3 (la plantilla TRAINING 1.1.0), 07 §6 (cómo se escribe la prescripción) y 02 §4 (lo
  que congela el snapshot del programa).

## ADR-115 · La fatiga por grupo muscular, sin los coeficientes por familia — aceptada (2026-11-11)
Contexto: P14.5, PR 4 (fase B; P-27, respondida por Jeremy el 2026-11-10; RN-F06, RN-G16; RF-33; ADR-106 y ADR-108). La hoja piloto
trae la tabla «Fatiga por grupo muscular — semana seleccionada»: volumen ajustado, F. muscular, F. neural, Carga axial, D. técnica,
Recuperación est., Fatiga entrenamiento, Base 3 sem. y Estado. Jeremy dio la fórmula de la fatiga, del estado y de la recuperación,
y cuatro coeficientes por familia de ejercicio, pero no cómo se reparten por grupo cuando lo trabajan varias familias. Rodrigo
decidió el 2026-11-11:
- 1.0 para el músculo principal y 0.5 para el secundario, sin coeficientes por ejercicio. La base de Mateo en la semana 5 sale
  Pecho 1,419 y Tríceps 709.5, no los 1,461.6 y 312.2 de la hoja;
- el PR va sin las cuatro columnas de coeficientes, y se le pregunta a Jeremy cómo se calculan por grupo;
- la base de cada grupo usa las mismas semanas previas que la carga del panel, y una de ellas sin ese grupo cuenta 0.
Decisión:
- Motor 1.15.0, `MUSCLE_FATIGUE_JV` 1.0.0, por semana del macrociclo y grupo muscular:
  - «Fatiga entrenamiento»: el volumen ajustado del grupo (principal 1.0 y secundario 0.5, ADR-106);
  - «Base 3 sem.»: su promedio en las previas, hasta 3, que tienen volumen (P-24), con 0 en la que el grupo no se entrenó;
  - estado con los umbrales de la carga del panel (P-23: ámbar sobre +15 % y rojo sobre +30 %), comparando sin dividir;
  - «Recuperación est.»: 48 h en verde, 60 h en ámbar y 72 h en rojo;
  - sin volumen en la semana, «faltan datos», como la semana 5 de la hoja; sin previas, o con la base en 0, «sin base»; ninguno
    de los dos estima la recuperación;
  - NC-ENG-415 (insumos fuera de rango) y NC-ENG-416 (umbrales cruzados). La regla de la carga es una sola (`loadLightOf`).
- Las horas van en `training.fatigue_panel_threshold` (migración `202611110300_training_muscle_fatigue`), versionadas con los demás
  umbrales del panel: `muscle_recovery_green_hours`, `muscle_recovery_amber_hours` y `muscle_recovery_red_hours`.
- Analítica: `GET /patients/:id/analytics/training` da `weeks[].muscleFatigue` (la versión de los umbrales, el hash, las semanas de
  la base y cada grupo) en las semanas que empezaron, con el método en `methods.muscleFatigue`. Sale del volumen semanal por
  grupo que ya existe: no hay tabla nueva ni hace falta `analytics:rebuild`.
- Web: en Analítica › Rutina, «Fatiga por grupo muscular» debajo de las series por grupo, con la misma semana elegida: grupo,
  fatiga, base, estado con su cambio y recuperación estimada. Primero los grupos con más fatiga.
- No entran: las cuatro columnas de coeficientes (P-27.1, pregunta nueva para Jeremy) ni una columna de «volumen ajustado» aparte,
  porque con 1.0 y 0.5 es la misma cifra que la fatiga. Tampoco cambia el control semanal (P-25) ni hay alerta en Inicio.
Consecuencias:
- Motor: la base de 1,419 y 709.5, la semana sin el grupo en 0, las previas sin volumen fuera, los bordes de +15 % y +30 %, «faltan
  datos», «sin base», el orden y los errores.
- Integración `demo-3.int.spec.ts`: la semana 5 de Mateo por HTTP (Pecho 1,419; Tríceps y Deltoides anterior 709.5; Dorsal 1,590 y
  Cuádriceps 2,058) y la semana 3 en ámbar. E2E `analitica.spec.ts`: la tabla de Luis «sin base».
- Para Notion (/notion-sync de P14.5): 02 §9 (`MUSCLE_FATIGUE_JV`), 03 (la regla del panel, RN-G18, con la fatiga por grupo), 05.2
  (las tres columnas de `training.fatigue_panel_threshold`), 04 RF-33 y 07 §10 y §15 (P-27 resuelta, menos los coeficientes).

## ADR-116 · El seguimiento asistido por WhatsApp: la etiqueta y el chat con wa.me — aceptada (2026-11-11)
Contexto: P14.5, PR 9d (P-35, respondida por Jeremy el 2026-11-10; RF-41, RN-B03; ADR-075, ADR-098 y ADR-114). La hoja piloto escribe «Seguimiento
asistido por WhatsApp» en la fila «Revisión» del macrociclo. Jeremy dijo que es una modalidad de acompañamiento fuera de la app: la
etiqueta y un botón que abra el chat del alumno con un enlace wa.me, sin integrar ninguna API de mensajería. Rodrigo decidió el
2026-11-11:
- se activa por alumno, en su perfil de entrenamiento;
- la etiqueta va en una línea arriba del macrociclo, sin tocar la columna «Revisión», porque de ella depende el control semanal;
- el botón, para el coach, abre wa.me con el teléfono del alumno. Si al teléfono le falta el código de país, la app pide agregarlo
  en vez de suponer +51.
Después confirmó las dos elecciones de este PR: el código de país solo cuenta si el teléfono empieza con «+» o «00», y la etiqueta
queda en el panel del coach, sin la ficha PDF de la rutina ni la app del paciente.
Decisión:
- `training.athlete_profile.whatsapp_follow_up` (migración `202611110400_training_athlete_whatsapp`), por revisión como el resto del
  perfil; las revisiones que ya existen quedan sin activar. El formulario del perfil lo muestra en «Acompañamiento».
- `GET /patients/:id/athlete-profile/whatsapp` (`patients.read`) da `{ url }` con `https://wa.me/<dígitos>`:
  - solo con el seguimiento activado en el perfil vigente; si no, 409 NC-TRA-026 y el teléfono ni se descifra;
  - el teléfono trae su código de país si empieza con «+» o «00»; se quitan espacios, guiones, puntos y paréntesis, y quedan de 8 a
    15 dígitos (E.164). Si no, 409 NC-TRA-028, que pide agregarlo en la ficha. Sin teléfono, 409 NC-TRA-027;
  - el teléfono se descifra con `ClinicalApi.patientPhone`, y cada pedido deja un READ de `clinical.patient.phone` en la auditoría.
    La ficha del paciente sigue sin devolver el teléfono (`hasPhone`).
- Web: «Seguimiento asistido por WhatsApp» con el botón «Abrir WhatsApp», arriba del macrociclo del programa y del control semanal.
  La pestaña se abre al tocar y luego va al enlace, para que el navegador no la bloquee. Si falta el teléfono o su código de país,
  la línea lo dice y lleva a la ficha.
- No entran: la etiqueta en la ficha PDF de la rutina ni en la app del paciente, y ningún mensaje enviado por la app.
Consecuencias:
- API: la regla del enlace (con el código de país, sin él, inválido, sin teléfono y sin activar) y la integración de punta a punta:
  apagado, activado, sin código de país, con él y 3 lecturas en la auditoría.
- Contratos: el perfil con el seguimiento, apagado por defecto, y el enlace solo por https a wa.me.
- E2E `programa.spec.ts`: la línea arriba del macrociclo y, sin teléfono, el aviso con el enlace a la ficha.
- Para Notion (/notion-sync de P14.5): 05.2 (la columna de `training.athlete_profile`), 04 RF-41 (el perfil) y 07 §2 y §15
  (P-35 resuelta).

## ADR-117 · El informe del mesociclo por la API: volumen cumplido, récords, resumen semanal y comparativa — aceptada (2026-11-11)
Contexto: P14.5, fase C, PR 7a (P-28 y P-29; RN-G19 nueva; ADR-098). Va fuera del contrato, con la cotización por la cláusula décimo
segunda (`docs/cotizaciones/fase-c-hoja-piloto.md`, 61 h). La hoja piloto trae un «Informe mensual · evolución integral». Rodrigo
respondió el 2026-11-10 y el 2026-11-11:
- es uno por mesociclo de 4 semanas, solo en la app (sin sexta ficha PDF), con los estados Borrador y Enviado;
- el coach escribe Logro, Limitante, Ajuste y Prioridad, y el alumno su Comentario desde la app;
- el volumen cumplido son las series hechas ÷ las planificadas de la rutina completa (223 ÷ 240 = 92.9 %);
- un récord es un 1RM estimado más alto que el mejor anterior de ese ejercicio. La primera vez no cuenta, y cada ejercicio cuenta
  una vez por semana;
- el borrador se edita antes, pero se envía solo cuando cierra la cuarta semana del mesociclo;
- además trae el sueño, el estrés, la fatiga, el rendimiento, la alimentación y la decisión del control semanal de cada semana, y la
  comparativa física, como la hoja.
También aceptó estas decisiones por defecto: enviado es final; el alumno escribe y cambia su comentario cuando quiere; no hay aviso
por correo; y la demo de Mateo queda como está.
Decisión:
- Motor: `MESOCYCLE_REPORT_JV` 1.0.0 (motor 1.16.0, RN-G19):
  - volumen cumplido: series hechas × 100 ÷ planificadas, por semana y en el mesociclo; sin series planificadas, sin dato;
  - récords: el 1RM estimado tiene que superar el mejor que el ejercicio tenía hasta ese día, en toda la historia del alumno y con
    su fórmula (RN-F04). Cada ejercicio cuenta una vez por semana, con su récord más alto;
  - los promedios de cada semana, de su control vigente, y su promedio en las semanas con dato. Con la hoja dan 6.9 h, 3.0, 3.0,
    90 % y 85 %.
  - G-44: el mes de Mateo da 223 ÷ 240 = 92.9 % (semana 1: 93.3 %) y récords 0, 3, 3 y 0 con sus 1RM;
  - NC-ENG-417 y NC-ENG-418.
- Tabla `training.mesocycle_report` (migración `202611110500_training_mesocycle_report`):
  - una fila por mesociclo de la línea del programa, por su posición, con RLS del equipo de atención;
  - el alumno ve solo los informes enviados;
  - un disparador impide cambiar lo enviado, que el alumno cree informes o toque lo del coach, y que el coach escriba el comentario.
- Enviar exige que el mesociclo haya cerrado y los cuatro textos:
  - cerrado quiere decir que su último día ya pasó en la fecha local del alumno, como el control semanal (07 §10); en los mesociclos
    de JV es la cuarta semana;
  - enviarlo congela un snapshot (esquema 1, con su hash) con el resultado del motor, el control de cada semana (semáforo, acción
    sugerida y decisión del coach) y la evolución hasta el último día del mesociclo, solo con lo de la comparativa física;
  - el borrador se calcula cada vez que se lee.
- De dónde salen los números:
  - lo planificado, de la última versión publicada de la línea del programa, como la analítica (RN-F12);
  - lo hecho, de los entrenos de la línea dentro de las fechas del mesociclo. Cuenta en la semana de su sesión (ADR-083), sin
    calentamiento ni cardio;
  - los 1RM, del read model de analytics;
  - analytics da esos datos a training con `MesocycleReportSources`, sin ciclos entre módulos (02 §4).
- API:
  - para el equipo: `GET` y `POST /patients/:id/mesocycle-reports`, `GET /mesocycle-reports/:id`, `PUT /mesocycle-reports/:id` y
    `POST /mesocycle-reports/:id/send`, los dos últimos con If-Match;
  - para el alumno: `GET /me/mesocycle-reports`, `GET /me/mesocycle-reports/:id` y `PUT /me/mesocycle-reports/:id/comment`;
  - errores NC-TRA-029 a NC-TRA-035;
  - cada lectura queda en la auditoría, y cada escritura por sus eventos `training.report.*`. Escribir exige HEALTH_DATA vigente
    (RN-B01).
Consecuencias:
- Unitarias: G-44 y la regla de los récords en el motor; en el dominio, el envío, los textos, lo planificado y lo hecho; y qué 1RM
  entran.
- Integración (`demo-3.int.spec.ts`):
  - el informe de Mateo con sus números, el envío y la base que impide cambiarlo;
  - la app del alumno con su comentario, y la RLS.
- 7b: las pantallas del panel y de la app, la E2E y el guion de la Demo 3.
- Para Notion (/notion-sync de P14.5): 03 (RN-G19 y G-44), 02 §8 (`training.report.*`) y §9 (`MESOCYCLE_REPORT_JV`), 05.2
  (`training.mesocycle_report`) y 04 (el informe, fuera del contrato).

## ADR-118 · Las pantallas del informe del mesociclo, en el panel y en la app — aceptada (2026-11-11)
Contexto: P14.5, fase C, PR 7b (P-28 y P-29; RN-G19; ADR-117). El informe ya tenía su API. Faltaban las pantallas del panel y de la
app, la E2E y el guion de la Demo 3.
Decisión:
- Panel, Entrenamiento › Informes (pestaña nueva): cada mesociclo del programa vigente, con su momento (cerrado, en curso o por
  empezar), el estado de su informe y «Crear informe». El informe muestra:
  - el resumen: volumen cumplido, sesiones, récords y los promedios de sueño, estrés, fatiga, rendimiento y alimentación, con su
    método;
  - cada semana, con el semáforo, la acción sugerida y la decisión del coach de su control semanal;
  - los récords, con el 1RM de antes y el nuevo y su fórmula, y la comparativa física, con el mismo componente de Evolución;
  - en borrador, los cuatro textos con «Guardar borrador» (If-Match) y «Enviar informe», con confirmación. Enviar se habilita
    con el mesociclo cerrado, sin cambios por guardar y con los cuatro textos. Al abrir el borrador se controlan las semanas
    cerradas que falten, como en el control semanal;
  - enviado, los textos en solo lectura y el comentario del paciente (con la palabra que elige la organización).
- App, Más › Informes: los enviados, del más reciente al más antiguo, con «Falta tu comentario». En cada uno, lo que dice el
  coach, su comentario y el mismo informe. El comentario se cambia cuando quiera, con una Idempotency-Key en cada envío.
- El paciente ve el semáforo y la decisión de cada semana dentro del informe enviado, porque Rodrigo pidió el resumen semanal
  para que cuadre con la hoja. El control semanal en sí sigue sin verse en la app (05.2).
- Guion de la Demo 3: la sección 9, con los números de Mateo.
Consecuencias:
- Unitarias de la web: el resumen redondeado al presentar (RN-D09), cada semana con su control y el momento de cada mesociclo.
- E2E `informe.spec.ts`, en escritorio y en el celular: el coach crea el informe del mesociclo cerrado, lo escribe y lo envía; el
  paciente lo lee en su app y comenta; el coach ve el comentario. axe en cada pantalla.
- Para Notion (/notion-sync de P14.5): 04 (las pantallas del informe) y 05.2 (el paciente ve el resumen del control dentro del
  informe enviado).

## ADR-119 · Las fotos de progreso por la API: consentimiento propio, tres vistas por mesociclo y borrado al archivar o revocar — aceptada (2026-11-12)
Contexto: P14.5, fase C, PR 6b-1 (P-30; RN-G20 nueva; ADR-098). Va fuera del contrato, con su cotización. Rodrigo decidió:
- el 2026-11-10: las suben el alumno y el coach, tres vistas en cada cierre de mesociclo;
- el 2026-11-11: consentimiento propio con el texto del abogado. Las fotos se conservan solo mientras el expediente esté activo y se
  borran en el acto al archivar al alumno o cuando revoca, sin días de gracia;
- el 2026-11-12: la comparativa va en su propia sección; las fotos se suben desde la última semana del mesociclo; y el
  consentimiento lo registra el alumno desde la app o el coach en consulta.
Decisión:
- Consentimiento `PROGRESS_PHOTOS` (migración `202611120100_training_progress_photos`):
  - finalidad nueva y opcional, con el texto del abogado como versión 1.0;
  - el alumno la autoriza o la retira desde la app, como la del ciclo menstrual, y el equipo la registra en consulta;
  - no se reutiliza IMAGES, porque su texto conserva la evidencia hasta que el paciente pida suprimirla.
- `training.progress_photo`:
  - una foto por vista (frontal, lateral y posterior) y por mesociclo de la línea del programa;
  - subir otra la reemplaza: el archivo anterior se marca borrado y sus bytes se descartan;
  - RLS del equipo; el alumno lee y sube las suyas, pero no las borra (`patient_no_delete`, migración
    `202611120200_training_progress_photo_no_delete`).
- Subir:
  - JPEG o PNG de hasta 5 MB, según sus bytes (ADR-038), al programa publicado;
  - desde la última semana del mesociclo, en la fecha local del alumno;
  - exige HEALTH_DATA y PROGRESS_PHOTOS vigentes;
  - el alumno no lee `training.program`, porque su app lee la copia vigente: su programa publicado, solo el suyo, lo busca el
    sistema antes de abrir la transacción del alumno.
- Ver: solo con el alumno activo y su consentimiento vigente. Cada foto sale por la API como adjunto y con nosniff, y cada lectura
  queda en la auditoría.
- Borrar: desde que se archiva al alumno o se revoca el consentimiento, la API deja de servir las fotos. El consumidor
  `training.progress-photos` (de `clinical.patient.archived` y `clinical.consent.revoked`) borra las filas, marca borrados los
  archivos, descarta sus bytes y deja la entrada en la auditoría. Reactivar al alumno no las recupera.
- `platform.file_object`: el alumno lee los archivos de sus fotos y escribe solo archivos de fotos, los que sube y el que reemplaza.
- API:
  - para el equipo: `GET /patients/:id/progress-photos`, `POST /patients/:id/progress-photos/:position/:view` (multipart, campo
    «photo») y `GET /progress-photos/:id/file`;
  - para el alumno: `GET /me/progress-photos`, `POST /me/progress-photos/:position/:view` y `GET /me/progress-photos/:id/file`;
  - errores NC-TRA-036 a NC-TRA-040 y NC-CLI-033.
Consecuencias:
- Unitarias: cuándo se suben, las vistas y los tipos; la subida, el reemplazo, el borrado y las lecturas.
- Integración (`progress-photos.int.spec.ts`):
  - sin consentimiento no se suben; el coach sube la frontal del mesociclo que cierra; el siguiente todavía no; un PDF tampoco;
  - la lectura sale como adjunto y queda auditada; fuera del equipo no se ve;
  - el alumno sube la suya y el reemplazo borra el archivo anterior;
  - al revocar dejan de verse en el acto y el consumidor las borra, y al archivar, también.
- 6b-2: las pantallas para subir y comparar en el panel y en la app, el consentimiento en la app, la E2E y el guion.
- Para Notion (/notion-sync de P14.5): 05.1 (la finalidad `PROGRESS_PHOTOS`), 05.2 (`training.progress_photo`), 05.3 (la política del
  paciente en `platform.file_object`), 03 (RN-G20 y RN-B01) y 02 §8 (`training.photo.uploaded`).
