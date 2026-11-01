# STATUS — NutriCoach v1.0

Actualizado: 2026-10-31 · Por: Rodrigo, con Claude Code
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
| P11 Fichas PDF, Demo 2 | ✅ | Rodrigo | #32 a #37 | 4 criterios en verde (integración y E2E en escritorio y celular): contexto documents y ficha de intercambios (ADR-064), fichas del menú y de resultados (ADR-065; 1.0.1 en ADR-069), marca mínima (ADR-066), descargas (ADR-067), semilla, guion y acta de la Demo 2 (ADR-068). Etiqueta v0.2.0 (e05f8de); staging, pendiente de P4. /notion-sync aplicado (17 cambios en 02, 03, 04, 05, 05.1, 05.3 y 06) |
| P12 Ejercicios y rutinas | 🟨 | Rodrigo | #39, #40, #41, #44, #45 y #46 | PR 1 a 6 de 7: motor (ADR-070), biblioteca (ADR-071), anamnesis V2 (ADR-072), seguridad (ADR-075) y programa por la API (ADR-077) y en la web (ADR-078). PR 7: ficha de rutina (ADR-079) |
| P13 App del paciente | ⬜ | Rodrigo | | |
| P14 Analítica y evolución, Demo 3 | ⬜ | Rodrigo | | |
| P15 Marca, calendario, admin y migración | ⬜ | Rodrigo | | |
| P16 Producción y entrega, Demo 4 | ⬜ | Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P12, PR 7 de 7 (ADR-079): ficha de la rutina `TRAINING@1.0.0` (RF-24, RN-H01 a RN-H04). Sale del snapshot al publicar y a pedido, con el
  macrociclo, el plan de 7 días, las sesiones con las semanas iguales juntas, las series por grupo muscular con su método y cada ejercicio con sus
  variantes. Botón de descarga en el programa publicado. Falta: /cierre y /notion-sync de P12.
- P12, PR 6 de 7 (ADR-078): programa en la web (RF-26). Lista, propuesta con aprobación por bloque, macrociclo, programa a mano con mesociclos,
  editor por semana con fase, sesiones, ejercicios y series, duplicar, publicar y lectura de lo publicado. E2E e2e/programa.spec.ts. Falta: ficha de rutina.
- P12, PR 5 de 7 (ADR-077): programa por la API (RF-26). A mano o como propuesta bloqueada por las llaves, de a una semana, duplicar,
  aprobar por bloque, publicar con snapshot y hash, versiones nuevas y la meta de entrenamiento del día en tracking. Faltan: web y ficha de rutina.
- P12, PR 4 de 7 (ADR-075): seguridad antes de prescribir (RF-41, RN-F15). Pestaña Entrenamiento con las tres llaves, el
  perfil de entrenamiento, el cribado con la revisión del coach, la evaluación postural (14 pruebas) y las pruebas físicas
  (15, por momento), con evidencia por archivo o enlace y el consentimiento IMAGES. Faltan: programa (API y web) y ficha de rutina.
- Exclusión de alimentos por alergia o intolerancia (ADR-074): RN-E17. Cada condición activa se enlaza con sus alimentos, y
  un plan con alguno no se guarda ni se publica, tampoco dentro de una receta. Lo publicado no cambia: se avisa.
- P12, PR 3 de 7 (ADR-072): anamnesis `JV_ANAMNESIS` V2 como revisión de la historia clínica, presencial u online, con
  su perfil de rendimiento (`clinical.performance_profile`, G-40 por HTTP y en pantalla). La historia v1 queda de solo
  lectura y cada revisión se abre por su número. La dieta avisa de las alergias e intolerancias registradas, sin cruzarlas
  con los alimentos (ADR-073). Faltan: seguridad, programa (API y web) y ficha de rutina.
- P12, PR 2 fusionado (#40, beb2fc2) (ADR-071): biblioteca de ejercicios. CSV de 169 ejercicios (23 de la V3 y 146
  provisionales), tabla patrón × nivel, ejercicios propios, búsqueda sin tildes y por alias, pantallas Ejercicios y Patrón
  y nivel. La revisión cerró un hueco de RLS: el paciente podía borrar en 6 tablas que puede leer (`patient_no_delete`).
- P12, PR 1 fusionado (#39, 7724d37) (ADR-070): en el motor, `PRI_JV`, las llaves de seguridad, la propuesta y el
  macrociclo, con G-29 a G-35 y G-40 en verde. Motor 1.4.0.
- P11 terminado (#32 a #37), con la etiqueta v0.2.0 en e05f8de:
  - #32 (ADR-064): contexto documents, ficha de la dieta por intercambios con react-pdf en el worker, generación al
    publicar y a pedido, reutilización por hashes y descarga auditada; criterios 1 y 3;
  - #33 (ADR-065): ficha del menú semanal, que también imprime la composición, y de resultados antropométricos con el
    método junto a cada número (criterio 2); #37 (ADR-069): su plantilla 1.0.1 dice «Masa ósea (Rocha)»;
  - #34 (ADR-066): marca mínima de las fichas, con el logo revisado entero y la pantalla «Marca de las fichas»;
  - #35 (ADR-067): «Descargar ficha (PDF)» en el plan y en la evaluación;
  - #36 (ADR-068): `pnpm demo:2`, guion docs/demos/demo-2.md y borrador del acta docs/actas/demo-2.md (criterio 4).
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
- P12: /cierre y /notion-sync (listas en ADR-070 a ADR-079). Después, P13
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
- [ ] P11: la v0.2.0 tampoco está en staging (P4); la Demo 2 se hace en local con `pnpm demo:2`
- [ ] Acta de la Demo 2: confirmar los nombres de las partes contra el contrato antes de enviarla (ADR-068)
- [x] N13: alternativa, regresión y progresión en la biblioteca (RF-25); Jeremy lo confirma en P-13
- [x] N7: lo resuelve el registro diario de la plantilla V3 (RN-G11)
- [ ] Método de entrenamiento de Jeremy: preguntas P-01 a P-14 (Notion 07 §15). Mientras no respondan, P12 a P14 se
  construyen con la propuesta de cada una
- [ ] Jeremy revisa los 146 ejercicios base provisionales, y la regresión y progresión de los 23 de la V3 (ADR-071)
- [ ] Preguntas nuevas para Jeremy (ADR-070): P-15, cuál formulario manda (`01` y `02` con puntaje, o `08_ANAMNESIS_V2` y
  `09_CRIBADO_V2`, sin puntaje y con otros códigos); P-16, si «Caminata inclinada» va de verdad con 3 × 8-12 y RIR 2; y
  confirmar el quinto día (P-04)
- [x] P-17: un plan no lleva el alimento enlazado a una alergia o intolerancia activa; Jeremy dio el visto bueno (ADR-074)
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
- P16, antes de la entrega: revisar y quitar los mensajes de «Provisional» (ejercicios base, lista DEMO, textos legales) o
  dejar marcado lo que siga sin confirmar (pedido de Rodrigo, 2026-10-30)
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
- Los logos reemplazados quedan guardados sin uso: limpieza con la marca completa de P15 (ADR-066)
- Los PDF de las fichas llevan datos del paciente: la supresión de P15 (RN-B05) tiene que borrarlos (ADR-064)
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir los programas y sus snapshots (ADR-077)
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir el perfil de entrenamiento, los cribados con su
  texto libre, las pruebas y su evidencia, también los archivos quitados de un borrador, que quedan sin ruta (ADR-075)
- La exportación y la supresión de P15 (RN-B04, RN-B05) tienen que incluir las respuestas de la anamnesis V2 y los insumos
  de `clinical.performance_profile` (ADR-072)
- E2E de la Demo 1 inestable en el celular, en main (run #88, 1943c5b): lo escrito tras un Enter cayó en otro campo y el
  reintento se quedó 10 minutos con un clic anterior a la hidratación. La prueba ahora comprueba y repite. No se guardó nada
  incorrecto: el formulario lo detuvo. El siguiente run de main (#91) pasó
- E2E en el celular: `page.goto: WebKit encountered an internal error` una vez en seguridad.spec.ts, al navegar; repetida
  5 veces pasó las 5 (2026-10-31). Es del navegador, no de una aserción
- E2E de P6 inestable en el celular (patients.spec.ts): «Enfermedad: Hipotiroidismo» no apareció en 5 s y pasó al
  reintentar (#35, 2026-10-27)
- E2E de la Demo 1 inestable en el CI: axe corrió antes de que la página tuviera su título (document-title) y pasó al
  reintentar (#29, 2026-10-24); esperar el título antes de axe

## Registro de sesiones (solo las 5 últimas)
- 2026-10-31 · P12 (PR 7) · Ficha de la rutina (ADR-079): generada al publicar y a pedido, con las semanas iguales juntas (12 semanas en 8
  páginas y 1 s), el macrociclo, el plan de 7 días y cada ejercicio con sus variantes. El plan semanal pasa a contracts
- 2026-10-31 · P12 (PR 6) · #44 lleva a main lo de #43 y #45 fusiona el programa por la API. Programa en la web (ADR-078): lista, propuesta con
  aprobación por bloque, macrociclo, editor por semana, duplicar y publicar, con la E2E en escritorio y celular
- 2026-10-31 · P12 (PR 5) · #42 y #43 fusionados, pero #43 quedó en la rama de alergias y no en main: la corrección va en un PR nuevo. Programa
  por la API (ADR-077): a mano o propuesta, semanas, duplicar, aprobar por bloque, publicar y metas del día. E2E de la Demo 1 más robusta (run #88)
- 2026-10-31 · P12 (PR 4) · Seguridad antes de prescribir (ADR-075): perfil, cribado con revisión, postura y pruebas físicas,
  con sus pantallas y la E2E en escritorio y celular. Se agrega el texto de consentimiento IMAGES, provisional, que no existía.
  La interfaz oculta en todo el expediente lo que la API negaría, con un aviso y enlace a la Ficha (ADR-076)
- 2026-10-30 · Exclusión de alimentos (ADR-074) · #41 fusionado. Jeremy dio el visto bueno: RN-E17, enlace de alergias e
  intolerancias con alimentos y bloqueo al guardar y publicar, también dentro de una receta; aviso si el plan vigente lleva uno
