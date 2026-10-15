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
