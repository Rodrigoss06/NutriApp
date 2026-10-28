# STATUS — NutriCoach v1.0

Actualizado: 2026-10-28 · Por: Rodrigo, con Claude Code
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
| P10 Composición, menú y recetario | ✅ | Rodrigo | #28, #30 y #31 | 2 criterios en verde (integración y E2E en escritorio y celular): recetario (ADR-061), composición y menú en la API (ADR-062) y pantallas (ADR-063). Plantillas (RF-22, deseable) fuera. /notion-sync aplicado (17 cambios en 02, 03, 04, 05 y 05.2) |
| P11 Fichas PDF, Demo 2 | 🟨 | Rodrigo | #32 a #35 y PR 5 | Plan aprobado (2026-10-25). #32: contexto documents y ficha de intercambios (ADR-064), criterios 1 y 3. #33: fichas del menú (también la composición) y de resultados (ADR-065), criterio 2. #34: marca mínima de las fichas (ADR-066). #35: descargas en el panel (ADR-067). PR 5: semilla, guion y acta de la Demo 2 (ADR-068), criterio 4. Faltan el arreglo de la ficha de resultados, la etiqueta v0.2.0 y el cierre |
| P12 Ejercicios y rutinas | ⬜ | Rodrigo | | |
| P13 App del paciente | ⬜ | Rodrigo | | |
| P14 Analítica y evolución, Demo 3 | ⬜ | Rodrigo | | |
| P15 Marca, calendario, admin y migración | ⬜ | Rodrigo | | |
| P16 Producción y entrega, Demo 4 | ⬜ | Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P11, PR 5 en la rama feat/demo-2 (ADR-068): `pnpm demo:2` siembra por la API la receta y las dos dietas de Luis
  (intercambios reemplazada y composición vigente); guion docs/demos/demo-2.md, ensayado por las pantallas sobre una
  base nueva; borrador del acta docs/actas/demo-2.md (criterio 4). Lo que sigue: el arreglo de «Masa ósea» en un PR
  aparte, la etiqueta v0.2.0 y el cierre de P11.
- P11, PR 4 fusionado (#35, c1bdc11) (ADR-067): «Descargar ficha (PDF)» en el plan publicado o reemplazado y en la
  evaluación con resultados, con «Generando…» mientras el worker la dibuja; E2E e2e/fichas.spec.ts.
- P11, PR 3 fusionado (#34, a2a0e03) (ADR-066): marca mínima de las fichas.
  - API: GET y PUT /organization/branding y el logo aparte (PUT, DELETE y GET), con tenancy.branding.changed
    auditado;
  - logo PNG o JPEG de hasta 1 MB y 2000 px, revisado entero antes de guardarlo (un logo dañado rompería todas las
    fichas);
  - pantalla «Marca de las fichas» en /panel/organizacion, con el contraste del color y una vista previa de la ficha;
  - E2E e2e/marca.spec.ts en escritorio y celular.
- P11, PR 2 fusionado (#33, 8cf6423) (ADR-065): ficha del menú semanal, que también imprime la composición como un
  plan de un día, y ficha de resultados antropométricos con el método junto a cada número (criterio 2).
- P11, PR 1 fusionado (#32, 0ad742f) (ADR-064): contexto documents, ficha de la dieta por intercambios con react-pdf en
  el worker, generación al publicar y a pedido, reutilización por hashes y descarga auditada; criterios 1 y 3.
- P10, PR 3 fusionado (#31, 44cedaf) (ADR-063):
  - plan nuevo con la modalidad; editor por composición con alimentos por tiempo, nutrientes del día y adecuación;
  - menú semanal con pestañas de lunes a domingo, opciones A y B, copiar un día a los demás y resumen de la semana;
  - vista de lo publicado: grilla de la semana en escritorio y pestañas en el celular;
  - piezas comunes a los tres editores (usePlanDraft, panel del borrador, metas, hidratación);
  - E2E e2e/menu.spec.ts: Luis con una composición y un menú con una receta, publicados, en escritorio y celular.
- P10, PR 2 fusionado (#30, 8446004) (ADR-062): composición y menú semanal en la API, con totales del motor,
  adecuación con lo conocido, publicación con snapshot por modalidad y criterio 2 en integración.
- P10, PR 1 fusionado (#28, 18eab3f) (ADR-061): recetario con nutrientes por porción y «al menos» cuando falta un dato.
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
- P11: fusionar el PR 5, arreglar «Masa ósea» en la ficha de resultados (plantilla 1.0.1, PR aparte), etiqueta
  v0.2.0 con confirmación y, al cerrar, /notion-sync de P11 (ADR-064 a ADR-068)
- Demo 2: «Antes de empezar» de docs/demos/demo-2.md (base limpia, db:seed, catalog:load, pnpm dev y pnpm demo:2) y
  enviar el acta al terminar
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
- Reimportar un catálogo global (TPCA) no recalcula la caché de nutrientes de las recetas: hace falta un recálculo
  de las recetas que usan los alimentos cambiados (ADR-061). Los planes publicados no cambian: llevan su snapshot
- Plantillas de plan (RF-22, deseable) no se hicieron en P10 (ADR-063)
- Ficha de resultados 1.0.0: «Masa ósea (Masa ósea (Rocha))» repite el indicador cuando el nombre del método ya lo
  lleva; corregirlo pide la plantilla 1.0.1 y su migración, antes de la Demo 2 (ADR-065)
- Los logos reemplazados quedan guardados sin uso: limpieza con la marca completa de P15 (ADR-066)
- E2E de P6 inestable en el celular (patients.spec.ts): «Enfermedad: Hipotiroidismo» no apareció en 5 s y pasó al
  reintentar (#35, 2026-10-27)
- E2E de la Demo 1 inestable en el CI: axe corrió antes de que la página tuviera su título (document-title) y pasó al
  reintentar (#29, 2026-10-24); esperar el título antes de axe

## Registro de sesiones (solo las 5 últimas)
- 2026-10-28 · P11 (PR 5) · #35 fusionado con los cuatro checks en verde. PR 5: `pnpm demo:2` (ADR-068), probada dos
  veces en integración y en una base local nueva; guion de la Demo 2 ensayado por las pantallas, con las cuatro fichas
  y la marca; borrador del acta. Rodrigo eligió arreglar «Masa ósea» de la ficha de resultados en un PR aparte
- 2026-10-27 · P11 (PR 2 a PR 4) · #33 y #34 fusionados con los cuatro checks en verde. #34: marca mínima de las
  fichas (ADR-066) con la API, el logo revisado entero, el evento auditado y la pantalla «Marca de las fichas»; solo el
  color principal, porque las plantillas no usan el secundario. PR 4: descargas en el panel (ADR-067) con su E2E
- 2026-10-26 · P11 (PR 1 y PR 2) · #32 fusionado con los cuatro checks en verde. PR 2: fichas del menú, la
  composición y los resultados (ADR-065), con el criterio 2 en la integración. Un apagado brusco dejó archivos del
  PR 2 cortados en el disco NTFS (tamaño viejo, contenido nuevo, y git no lo ve): se rehicieron desde git y se
  verificó todo el árbol con git hash-object; la migración recreada tiene el mismo checksum que la aplicada
- 2026-10-24 · P10 (PR 3) · #29 y #30 fusionados. Pantallas de composición y menú semanal (ADR-063): plan nuevo con
  la modalidad, editores con la adecuación en vivo, pestañas de la semana y vista publicada; E2E en escritorio y
  celular. P10 cumple sus dos criterios; RF-22 queda fuera. #31 abierto con los cuatro checks en verde; /notion-sync
  de P10 aprobado y aplicado: RN-I03, RN-E10, RN-E16 y RN-G05 en 03 (versión 1.10), RF-21 en 04, Recipe,
  NutritionPlan, FoodApi y auditoría en 02, el DDL de food.recipe, plan y plan_item en 05.2, y en 05 el buscador de
  recetas y las filas 1.7 (P9, que faltaba) y 1.8
- 2026-10-23 · P10 (PR 1 y PR 2) · recetario fusionado (#28). El CI de main se cortaba a los 30 minutos instalando
  WebKit (espejo de apt lento): caché de navegadores y paquetes en #29, probada en frío y con la caché llena. PR 2:
  composición y menú semanal en la API (ADR-062); Rodrigo eligió la opción A para el día y la adecuación con lo
  conocido; criterio 2 en verde
