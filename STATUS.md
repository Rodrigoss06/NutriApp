# STATUS — NutriCoach v1.0

Actualizado: 2026-10-23 · Por: Rodrigo, con Claude Code
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
| P8 Datos maestros de alimentos | ✅ | Rodrigo | #21 a #24 | 3 criterios en verde (integración y E2E en escritorio y celular); Biblioteca, alimento propio, «Armar un plato», listas de intercambio y «Acerca de» con la atribución (ADR-055, ADR-056). /notion-sync aplicado (21 cambios) |
| P9 Dieta por intercambios | ✅ | Rodrigo | #25, #26 y #27 | 3 criterios en verde (integración y E2E de Luis en escritorio y celular): borrador (ADR-057), publicación y tracking (ADR-058) y pantallas (ADR-059). /notion-sync aplicado (15 cambios en 02, 03 y 05.2) |
| P10 Composición, menú y recetario | ⬜ | Rodrigo | | |
| P11 Fichas PDF, Demo 2 | ⬜ | Rodrigo | | |
| P12 Ejercicios y rutinas | ⬜ | Rodrigo | | |
| P13 App del paciente | ⬜ | Rodrigo | | |
| P14 Analítica y evolución, Demo 3 | ⬜ | Rodrigo | | |
| P15 Marca, calendario, admin y migración | ⬜ | Rodrigo | | |
| P16 Producción y entrega, Demo 4 | ⬜ | Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P8, PR 1 fusionado (#21, d7beee2): importador genérico de catálogos (RN-I04), TPCA 2017 (928 alimentos) y
  Compendium 2024 (560 actividades), CLI catalog:load y lista DEMO provisional; ADR-052.
- P9, PR 3 fusionado (#27, e30f9ac) (ADR-059, ADR-060):
  - editor en tres pasos (metas con la referencia de hidratación, intercambios, reparto y alimentos) con la
    adecuación en vivo por POST /nutrition-plans/:id/preview, y publicar con confirmación;
  - porción sugerida con el macronutriente que define al grupo (carbohidratos totales, CHOCDF); historial de
    versiones y vista del plan publicado;
  - E2E e2e/dieta.spec.ts: Luis con G-17 a G-19, publicar y versión nueva;
  - el texto de marca se calcula contra --muted (hover del botón secundario) y useDebounced solo con valores
    primitivos (ADR-060).
- P9, PR 2 fusionado (#26, 7d71e57) (ADR-058): publicar con snapshot y hash, valid_from de hoy y el anterior a
  SUPERSEDED; versión nueva; módulo tracking (active_plan_view, la meta de hoy y el trabajo diario).
- P9, PR 1 fusionado (#25, 5d1ed91) (ADR-057):
  - borrador por intercambios con las metas exactas de la prescripción: G-17, G-18 y G-19 por HTTP;
  - ajuste a mano de almidones, carnes y grasas, reparto a mano de un grupo y alimentos permitidos con su porción;
  - adecuación con el rango de la organización (nutrition.adequacy_min_pct y _max_pct) y lo que falta para publicar;
  - migración 202610230000_nutrition_plans: la base rechaza tocar un plan publicado y sus hijos (RN-E15).
- P8, PR 4 fusionado (#24, fec8621) (ADR-056):
  - Biblioteca en /panel/biblioteca: alimentos con búsqueda y detalle, alimento propio, «Armar un plato», actividades
    y listas de intercambio (la DEMO rotulada «Provisional»);
  - «Acerca de» (/acerca, pública): la atribución de la TPCA, la TAFERA y el Compendium, una sola vez (ADR-055);
  - migración 202610220100_food_source_license: la licencia de TPCA_2017 sin «Autorización pendiente», y el detalle
    del alimento ya no la devuelve;
  - GET /foods/nutrients y GET /exchange-lists; el buscador de actividades es uno solo para la Biblioteca y la
    prescripción energética.
- P8, PR 3 fusionado (#23, 33ed3db) (ADR-054, ADR-055): búsqueda de alimentos y actividades, detalle, FoodApi con
  resolve y composición de un plato (RF-20 adelantado), alimentos propios con If-Match y permisos catalog.*.
- P8, PR 2 fusionado (#22, 34b8738) (ADR-053):
  - extractor de la TAFERA 2016 con enlace a la TPCA 2017 por perfil de nutrientes y nombre, y decisiones a mano con
    su motivo (LINKS y FACTOR_LINKS);
  - 933 medidas caseras de 194 alimentos, con peso neto (parte comestible) y bruto, y 213 factores de cocido a crudo
    de 126 alimentos crudos;
  - migración 202610210000_food_tafera: fuente TAFERA_2016, columnas de origen y peso bruto en household_measure y
    tabla food.cooking_factor con la RLS de catálogo;
  - importadores TAFERA_MEASURES y TAFERA_COOKING_FACTORS; catalog:load los carga después de la TPCA.
- Notion: el método de entrenamiento de Jeremy (plantilla V3, sin reloj) quedó documentado en la página 07 y en 03
  (RN-F13 a RN-F17, RN-G11, RN-G14 a RN-G17, G-29 a G-40), 04 (RF-25, RF-26, RF-28, RF-29, RF-34, RF-41 a RF-43),
  05.2 (sección «Entrenamiento según la plantilla V3»), prompts P12 a P14, Proyecto y Documento técnico (aprobado por
  Rodrigo, 2026-10-21).
- Rediseño «Instrumento» (ADR-051): #20 fusionado (039bb67)
- Notion sigue nombrando a Iván en 01 (aprobación del despliegue a producción), en la ruta crítica de Creación del
  proyecto, en la plantilla de STATUS de Archivos del repositorio y en el Equipo de Proyecto: se deja así por decisión
  de Rodrigo (2026-10-16)

## Siguiente paso
- Antes de la Demo 1: la matriz manual de navegadores (RNF-19: Chrome, Edge, Safari y Firefox; la E2E cubre Chromium
  y WebKit) y, el mismo día, base local limpia y semilla («Antes de empezar» del guion). La demo es en local
- P10: composición, menú semanal y recetario
- Cada base nueva necesita los catálogos: `pnpm --filter api build && pnpm catalog:load plataforma@demo.example.com`
  en local; en staging y producción, con el correo de su PLATFORM_ADMIN
- db:seed carga el caso Luis: sus resultados aparecen cuando corre el worker
- Desde P6, cada apps/api/.env local necesita STORAGE_LOCAL_PATH con una ruta absoluta (ADR-043)

## Bloqueos y preguntas al cliente
- [ ] Cuenta de Hetzner y dominio a nombre de Jeremy: bloquea P4
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [x] Ficha de anamnesis de Jeremy recibida (2026-10-20): será la versión 2 de la historia clínica (RF-43, P12)
- [ ] Antes de P16: cargar en producción los valores definitivos de TRAMO_5 y TRAMO_50 (la semilla no corre en
  producción): migración de datos o panel interno de P15
- [ ] N22: caducidad del enlace de acceso del paciente (provisional: 7 días, ajustable por organización en
  patient_invitation.ttl_days, de 1 a 30)
- [ ] N19: confirmar la carga manual de bioimpedancia (lista cerrada de 8 indicadores, ADR-044)
- [ ] ⚠️ Noveno diámetro de ISAK 2: confirmarlo con la guía de acreditación ISAK (2023); hoy el catálogo tiene 42 sitios
- [ ] ⚠️ Rangos de rechazo de perímetros, diámetros y longitudes, y condiciones de la evaluación con umbral de 2 h:
  validarlos con quien revisa los cálculos clínicos
- [ ] P7: «etiqueta v0.1.0 desplegada en staging» queda pendiente de P4; la Demo 1 se hace en local con la semilla
- [x] N13: alternativa, regresión y progresión en la biblioteca (RF-25); Jeremy lo confirma en P-13
- [x] N7: lo resuelve el registro diario de la plantilla V3 (RN-G11)
- [ ] Método de entrenamiento de Jeremy: preguntas P-01 a P-14 (Notion 07 §15). Mientras no respondan, P12 a P14 se
  construyen con la propuesta de cada una
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [x] Porción sugerida de verduras, frutas y almidones: carbohidratos totales de la TPCA (CHOCDF), los que la app
  muestra como «Carbohidratos»; lo decidió Rodrigo (2026-10-22, ADR-059)
- [x] TPCA 2017: Rodrigo, tras consultar con un abogado, autoriza usarla sin la autorización del INS con tres
  condiciones (ADR-055): la API no devuelve el código del alimento en la TPCA, el texto «de referencia» en vez de
  «oficiales» y la atribución de fuentes una sola vez, en «Acerca de» (ADR-056). Sin logos ni aval del Estado
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
- Por decidir en el prompt que lo use: si el paciente marca content.resource_assignment.viewed_at (la meta diaria y
  la copia del plan vigente quedaron resueltas en ADR-058)
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
- No hay página de Términos: cuando lleguen los textos revisados por el abogado, la atribución puede mudarse ahí,
  siempre una sola vez (ADR-056)

## Registro de sesiones (solo las 5 últimas)
- 2026-10-23 · P9 cerrado · #27 fusionado con los cuatro checks en verde; /notion-sync de P9 aprobado y aplicado:
  RN-E08, RN-E10, RN-E13, RN-E14 y RN-G05 en 03 (versión 1.9), mapa de contextos, NutritionPlan y auditoría en 02, y
  el DDL de nutrition en 05.2 como la migración 202610230000_nutrition_plans
- 2026-10-22 · P9 (PR 2 y PR 3) · #25 fusionado; PR 2 abierto (#26). Pantallas de la dieta por intercambios: editor en
  tres pasos con vista previa en la API, porción sugerida, referencias de hidratación, historial y vista del plan
  publicado (ADR-059); E2E de Luis en escritorio y celular. P9 cumple sus tres criterios. #26 fusionado; Rodrigo
  eligió los carbohidratos totales; texto de marca contra --muted y useDebounced sin objetos (ADR-060)
- 2026-10-22 · P8 cerrado y P9 (PR 1) · PR 3 fusionado (#23). La licencia de la TPCA, resuelta con Rodrigo tras
  consultar con un abogado (ADR-055): sin sourceFoodCode ni licencia en la API y la atribución en «Acerca de».
  Pantallas de la Biblioteca, «Armar un plato» y «Acerca de» (ADR-056, #24); E2E de P8 en escritorio y celular;
  /notion-sync de P8 con 21 cambios. P9: decisiones de Rodrigo y borrador por intercambios con G-17 a G-19 (ADR-057)
- 2026-10-21 · P8 (PR 2) · respuesta a Jeremy sobre periodización y lectura de su paquete operativo (plantilla V3 y
  formularios); el modelo V3, sin el reloj, documentado en Notion (07 y siete páginas más). TAFERA 2016 extraída del
  PDF del INS y enlazada con la TPCA 2017 (933 medidas y 213 factores), migración, importadores y ADR-053
- 2026-10-20 · P8 (PR 1) · demo levantada en la red local para presentarla (correo por ngrok); extracción de la
  TPCA 2017 del PDF del INS (928 alimentos) y del Compendium 2024 (560 actividades traducidas y verificadas);
  importador de catálogos, CLI catalog:load y ADR-052. Rodrigo decidió usar la TPCA mientras se tramita su licencia
  (plan B: USDA FoodData Central) y dejar la foto sin IA hasta un acuerdo; aprobó el estado deducido del nombre y no
  derivar alias
