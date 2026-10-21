# STATUS — NutriCoach v1.0

Actualizado: 2026-10-20 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: 0 de 9
Próxima demo: Demo 1 · Base y evaluación · semana 2

## Prompts
| Prompt | Estado | Responsable | PR | Notas |
|---|---|---|---|---|
| P0 Andamiaje | ✅ | Rodrigo | #1 | CI en verde |
| P1 Motor de cálculo | ✅ | Rodrigo | #2 | G-01 a G-28 en verde; motor 1.1.0 con TEE_PAL (#4); 1.2.0 en P7 (ADR-044) |
| P2 Base de datos y plataforma | ✅ | Rodrigo | #3 | 61 pruebas de integración |
| P3 Sistema de diseño | ✅ | Rodrigo | #4 | Lighthouse móvil 99 en Hoy; axe sin violaciones graves. Rediseño «Instrumento» (ADR-051): mediana 97 en Hoy |
| P4 Servidor y staging | ⛔ | Rodrigo | | En espera de la cuenta de Hetzner de Jeremy |
| P5 Identidad y organizaciones | ✅ | Rodrigo | #6, #7, #8 | 4 criterios en verde; despliegue a staging pendiente de P4 |
| P6 Pacientes e historia clínica | ✅ | Rodrigo | #10, #11, #12 | 4 criterios en verde (E2E en escritorio y celular, e integración); despliegue a staging pendiente de P4 |
| P7 Evaluación y cálculo, Demo 1 | ✅ | Rodrigo | #14 a #18 | E2E de la Demo 1 en escritorio y celular (G-01 a G-17), ninguna cifra sin método, recálculo con SUPERSEDED y guion; RF-18 adelantado. Etiqueta v0.1.0 (abf0d42) y Notion sincronizado; staging, pendiente de P4 |
| P8 Datos maestros de alimentos | 🟨 | Rodrigo | | PR 1 listo en local (importador, TPCA 2017 y Compendium 2024); faltan TAFERA, API y pantallas |
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
- P8 en feat/food-catalogos, sobre main. PR 1 subido, en revisión:
  - importador genérico de catálogos con lote, hash, validación por fila e informe (RN-I04), y CLI catalog:import y
    catalog:load con un PLATFORM_ADMIN como responsable;
  - TPCA 2017: 928 alimentos de 14 grupos, sin el grupo S; nutrientes INFOODS, «sin dato» distinto de cero (RN-I03);
  - Compendium 2024: 560 actividades de 7 encabezados, traducidas y verificadas contra el PDF;
  - lista de intercambio DEMO del motor, provisional (R4); ADR-052;
  - pnpm check en verde (318 unitarias de la API y 171 de integración).
  - Siguen PR 2 (TAFERA: medidas caseras y factores de cocido), PR 3 (búsqueda, composición de un plato y alimentos
    propios) y PR 4 (pantallas).
- Rediseño «Instrumento» (ADR-051): #20 fusionado (039bb67)
- Notion sigue nombrando a Iván en 01 (aprobación del despliegue a producción), en la ruta crítica de Creación del
  proyecto, en la plantilla de STATUS de Archivos del repositorio y en el Equipo de Proyecto: se deja así por decisión
  de Rodrigo (2026-10-16)

## Siguiente paso
- Antes de la Demo 1: la matriz manual de navegadores (RNF-19: Chrome, Edge, Safari y Firefox; la E2E cubre Chromium
  y WebKit) y, el mismo día, base local limpia y semilla («Antes de empezar» del guion). La demo es en local
- Revisar y fusionar el PR 1 de P8
- P8 PR 2: TAFERA 2016 (medidas caseras con peso neto y parte comestible, y factores de cocido a crudo)
- Cada base nueva necesita los catálogos: `pnpm --filter api build && pnpm catalog:load plataforma@demo.example.com`
  en local; en staging y producción, con el correo de su PLATFORM_ADMIN
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
- [ ] ⚠️ TPCA 2017: autorización del INS para reproducirla. Se usa mientras se tramita; si no llega, plan B: USDA
  FoodData Central (decisiones de Rodrigo, 2026-10-20)
- [ ] Captura de un plato por foto: la visión espera un acuerdo con Jeremy (un modelo propio también es IA, regla 10)
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
- Registrar el ETM de otro miembro (dueño o administrador) no tiene pantalla: la API lo permite (ADR-050)
- LCP de Hoy en Lighthouse móvil: de 2.1 a 2.7 s (mediana de 5 corridas, 2.42 s) porque Archivo variable pesa 90 KB y
  el texto se vuelve a pintar al llegar. Si en staging pasa de 2.5 s (RNF-03): subconjunto de la fuente (ejes wdth
  87.5 a 125 y wght 400 a 700) con next/font/local
- La E2E de celular corre en la imagen de Playwright (docker, mcr.microsoft.com/playwright:v1.63.0-noble): en este
  equipo WebKit no tiene sus dependencias
- Búsqueda de actividades con LIKE, orden alfabético y LIMIT 50, y la pantalla de energía muestra 10: con las 560 del
  Compendium, «correr» da 80 y empieza por «Caminar en cinta de correr». El guion y la E2E buscan «correr a 6». P8
  PR 3 pasa la búsqueda a trigramas con orden por similitud y PR 4 rehace el buscador

## Registro de sesiones (solo las 5 últimas)
- 2026-10-20 · P8 (PR 1) · demo levantada en la red local para presentarla (correo por ngrok); extracción de la
  TPCA 2017 del PDF del INS (928 alimentos) y del Compendium 2024 (560 actividades traducidas y verificadas);
  importador de catálogos, CLI catalog:load y ADR-052. Rodrigo decidió usar la TPCA mientras se tramita su licencia
  (plan B: USDA FoodData Central) y dejar la foto sin IA hasta un acuerdo; aprobó el estado deducido del nombre y no
  derivar alias
- 2026-10-18 · Rediseño «Instrumento» · herramientas de diseño en el usuario de Claude Code (frontend-design,
  ui-ux-pro-max, ui-skills y MCP de shadcn, Context7 y Playwright); vista previa de tres direcciones; dirección A con
  curvas de nivel; escala de referencia en los resultados; ADR-051. El disco de datos se llenó (lago de datos de
  otro proyecto) y Rodrigo liberó espacio
- 2026-10-15 · P7 cerrado · #18 fusionado (abf0d42) con CI en verde; etiqueta v0.1.0; /notion-sync de P7 aplicado
  (41 cambios en 02, 03, 04, 05, 05.1, 05.2, Documento técnico, Proyecto, Creación del proyecto, prompts y Archivos
  del repositorio); demo levantada en local con la semilla (recorrido de 12 de 12)
- 2026-10-15 · P7 (PR 5, en #18) · pantallas de evaluación, captura con tercera toma en vivo, bioimpedancia,
  resultados, comparación, ETM, métodos, Lee y energía; E2E de la Demo 1 en escritorio y celular; el worker lee sus
  colas por lotes (la auditoría de escrituras tardaba minutos); ADR-050
- 2026-10-15 · P7 (PR 4) · decisiones abiertas de la Demo 1 resueltas (ADR-049); Rodrigo asume las fases de Iván; PR 4
  subido
