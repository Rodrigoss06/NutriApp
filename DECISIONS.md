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
