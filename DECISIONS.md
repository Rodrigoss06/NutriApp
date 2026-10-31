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
