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

## ADR-011 · Prisma con base de datos primero — aceptada (revisar tras el spike de P2)
Decisión: migraciones en SQL aplicadas con prisma migrate deploy; schema.prisma se regenera con db pull;
nunca prisma migrate dev. CI falla si db pull cambia schema.prisma.
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
