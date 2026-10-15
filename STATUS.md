# STATUS — NutriCoach v1.0

Actualizado: 2026-10-15 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | ✅ | Rodrigo | #1 | CI en verde |
| P1 Motor de cálculo | ✅ | Rodrigo | #2 | G-01 a G-28 en verde; motor 1.1.0 con TEE_PAL (#4); 1.2.0 en P7 (ADR-044) |
| P2 Base de datos y plataforma | ✅ | Rodrigo | #3 | 61 pruebas de integración |
| P3 Sistema de diseño | ✅ | Rodrigo | #4 | Lighthouse móvil 99 en Hoy; axe sin violaciones graves |
| P4 Servidor y staging | ⛔ | Rodrigo | | En espera de la cuenta de Hetzner de Jeremy |
| P5 Identidad y organizaciones | ✅ | Rodrigo | #6, #7, #8 | 4 criterios en verde; despliegue a staging pendiente de P4 |
| P6 Pacientes e historia clínica | ✅ | Rodrigo | #10, #11, #12 | 4 criterios en verde (E2E en escritorio y celular, e integración); despliegue a staging pendiente de P4 |
| P7 Evaluación y cálculo, Demo 1 | 🟨 | Rodrigo | #14, #15, #16, #17 | API con G-01 a G-17 y guion (PR 4); RF-18 se adelanta aquí. PR 5: pantallas y E2E de la Demo 1; después, v0.1.0 |
| P8 Datos maestros de alimentos | ⬜ | Rodrigo | | |
| P9 Dieta por intercambios | ⬜ | Rodrigo | | |
| P10 Composición, menú y recetario | ⬜ | Rodrigo | | |
| P11 Fichas PDF, Demo 2 | ⬜ | Rodrigo | | |
| P12 Ejercicios y rutinas | ⬜ | Rodrigo | | |
| P13 App del paciente | ⬜ | Rodrigo | | |
| P14 Analítica y evolución, Demo 3 | ⬜ | Rodrigo | | |
| P15 Marca, calendario, admin y migración | ⬜ | Rodrigo | | |
| P16 Producción y entrega, Demo 4 | ⬜ | Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P7 en 4 PR, con los contratos de cada uno publicados antes: (0) contratos de P7, catálogo de sitios y datos de Luis
  en seeds/; (1) evaluación y su API; (2) cálculo en el worker e interpretación; (3) prescripción energética;
  (4) guion de la Demo 1; (5) pantallas y E2E. Decisiones del plan en ADR-044; Rodrigo asume también lo que Notion
  asigna a Iván (ADR-049)
- PR 4 (Demo 1): guion en docs/demos/demo-1.md, ensayado contra la API; cintura/talla de NICE con rangos versionados
  por la fecha de la evaluación; aviso pediátrico; Ana para la captura en vivo y la bioimpedancia de Luis (ADR-048).
  Las cinco preguntas que dejó se resolvieron en ADR-049
- RF-18 se adelanta a P7: la prescripción energética guarda los macronutrientes (RN-E07, G-17); P9 solo hace
  intercambios
- Para el /notion-sync del cierre de P7: lo que difiera de Notion según ADR-044 a ADR-048, RN-D09 (cintura/talla y
  cintura/cadera con 2 decimales), RN-D11 (ajuste assessment.lee_reference_group_coefficient), RN-D10 (la versión de
  los rangos es la de la fecha de la evaluación), RN-D05 (aviso pediátrico), el motor 1.2.0, los decimales de
  ADR-049 (ETM, %ETM, CMD95 y superficie corporal con 2; meses con 1) y Rodrigo como responsable de las fases de Iván
  (Proyecto, prompts y CLAUDE.md en Archivos del repositorio)

## Siguiente paso
- P7 Demo 1, PR 5: pantallas de captura, resultados, comparación, ETM, preferencias de métodos y energía; nombres de
  botones del guion y apps/web/e2e/demo-1.spec.ts con sus siete pasos (Playwright, escritorio y celular); después,
  etiqueta v0.1.0 (con confirmación)
- db:seed carga el caso Luis: sus resultados aparecen cuando corre el worker
- Desde P6, cada apps/api/.env local necesita STORAGE_LOCAL_PATH con una ruta absoluta (ADR-043)

## Bloqueos y preguntas al cliente
- [ ] Cuenta de Hetzner y dominio a nombre de Jeremy: bloquea P4
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [ ] ⚠️ Historia clínica v1 en texto libre por bloque: provisional hasta tener la ficha que usa Jeremy
- [ ] Antes de P16: cargar en producción los valores definitivos de TRAMO_5 y TRAMO_50 (la semilla no corre en
  producción): migración de datos o panel interno de P15
- [ ] N22: caducidad del enlace de acceso del paciente (provisional: 7 días, ajustable por organización en
  patient_invitation.ttl_days, de 1 a 30)
- [ ] N19: confirmar la carga manual de bioimpedancia (lista cerrada de 8 indicadores, ADR-044)
- [ ] ⚠️ Noveno diámetro de ISAK 2: confirmarlo con la guía de acreditación ISAK (2023); hoy el catálogo tiene 42 sitios
- [ ] ⚠️ Rangos de rechazo de perímetros, diámetros y longitudes, y condiciones de la evaluación con umbral de 2 h:
  validarlos con quien revisa los cálculos clínicos
- [ ] P7: «etiqueta v0.1.0 desplegada en staging» queda pendiente de P4; la Demo 1 se hace en local con la semilla
- [ ] N13: confirmar regresiones y progresiones en la biblioteca
- [ ] N7: confirmar el estado diario (estrés, sueño, energía)
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [ ] Textos legales revisados por el abogado del cliente, en lenguaje claro: desde los 14 años los acepta el propio
  paciente (ADR-042)
- [ ] ⚠️ Menores: desde los 14 consienten como un adulto; antes, solo en papel firmado por su padre, madre o tutor, sin
  registrar quién es el tutor (ADR-042). Pendiente de confirmar con el abogado

## Deuda técnica
- P14: medir care_team_scope con seed:load. Si el costo por fila pesa en tracking, pasar a
  patient_id = ANY((SELECT app.visible_patient_ids())), que se evalúa una vez por consulta (ADR-037)
- P5 sin desplegar a staging (06 §9): queda pendiente de P4. Al desplegar: APP_URL con https,
  SESSION_COOKIE_NAME=__Host-nc_session, API_INTERNAL_URL al compilar, SEED_DEMO_PASSWORD y la CLI
  create-platform-admin para el primer PLATFORM_ADMIN
- Para P4: Caddy sin trusted_proxies, para que reescriba X-Forwarded-For con la IP real; en el Sentry de la web,
  quitar el fragmento de las URL (beforeSend y beforeBreadcrumb): ahí viajan los tokens de invitación y recuperación
- Por decidir en el prompt que lo use: quién escribe tracking.daily_target, si el paciente marca
  content.resource_assignment.viewed_at y que active_plan_view compare el publishedAt del snapshot
- Lighthouse móvil en CI sobre staging (RNF-03) cuando exista staging; hoy se mide en local
- CSP del despliegue: style-src con 'unsafe-inline' por BrandStyle (ADR-027)
- La marca es provisional hasta la personalización (P19); la organización activa ya sale de la sesión (P5)
- seed:load llama un script que llega en P7 y P8 (db:seed existe desde P5)
- Planes TRAMO_5 y TRAMO_50 con límites y precio provisionales (N9): corregir con migración de datos al cerrarse
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte
- RF-06: LOGIN y LOGIN_FAILED (sin organización) solo los ve la plataforma; su vista llega con el panel interno (P15)
- La app del paciente (/mi) ya exige la sesión PATIENT, pero sus pantallas son de muestra hasta P13
- P14: las series de evolución leen result_metric unido a calculation_result vigente (ADR-046)
- Tres copias de atomically (dos en iam, una en backoffice): usar la de apps/api/src/platform (ADR-045)
- La pila del E2E se levanta a mano en local (compose, build, API y worker con env.local.example y
  RATE_LIMIT_FACTOR=100; WebKit en la imagen de Playwright): conviene un script

## Registro de sesiones (solo las 5 últimas)
- 2026-10-15 · P7 (PR 4) · decisiones abiertas de la Demo 1 resueltas (ADR-049); Rodrigo asume las fases de Iván; PR 4
  subido
- 2026-10-13 · P7 (PR 4) · guion de la Demo 1 ensayado contra la API, cintura/talla de NICE, rangos versionados por
  la fecha de la evaluación, aviso pediátrico, Ana y la bioimpedancia de Luis en la semilla; ADR-048
- 2026-10-12 · P6 cerrado · PR 3 fusionado (#12): la web no toca la base (web-no-database), STORAGE_LOCAL_PATH
  absoluta en todo entorno y la integración de menores sin efectos; P6 ✅ con sus 4 criterios; .env.example con la
  nota de STORAGE_LOCAL_PATH; /notion-sync de P6 aplicado (26 cambios en 01, 02, 03, 04, 05, 05.1, 06, Proyecto,
  Documento técnico y Archivos del repositorio)
- 2026-10-12 · P6 (3/3) · web del expediente, auditoría y aceptación del paciente, /mi con sesión PATIENT, búsqueda
  de documento sin tipo; E2E de P6 en escritorio y celular; ADR-043
- 2026-10-12 · P6 (2/3) · revisión del PR 2: menores con umbral de 14 años (ADR-042), OBESITY solo el equipo, 410
  único para todo enlace que ya no sirve, 409 si una invitación de staff choca con la de un paciente y la CLI sin
  clinical, con adaptadores explícitos
