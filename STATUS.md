# STATUS — NutriCoach v1.0

Actualizado: 2026-11-12 · Por: Rodrigo, con Claude Code
Inicio del proyecto: POR CONFIRMAR (día siguiente al Pago 1) · Semana actual: por confirmar
Próxima demo: Demo 3 · Entrenamiento y app del paciente · semana 6

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
| P12 Ejercicios y rutinas | ✅ | Rodrigo | #39 a #42 y #44 a #47 | 5 criterios en verde (integración y E2E en escritorio y celular): motor (ADR-070), biblioteca (ADR-071), anamnesis V2 (ADR-072), alergias (ADR-074), seguridad (ADR-075), programa por la API y en la web (ADR-077, ADR-078) y ficha de rutina (ADR-079) |
| P13 App del paciente | ✅ | Rodrigo | #50 a #55 | 6 criterios en verde (integración y E2E en escritorio y celular): recuperación del día en el motor (ADR-080), registros por /me (ADR-081), Hoy y el plan (ADR-082), registro diario y entreno (ADR-083, ADR-084) y el profesional con los registros (ADR-085). Lighthouse móvil 97 en Hoy (local). La cola sin conexión (RF-31, deseable) queda fuera. /notion-sync aplicado (30 cambios en 11 páginas) |
| P14 Analítica y evolución, Demo 3 | ✅ | Rodrigo | #57 a #68 | Plan aprobado (2026-11-05, ADR-086): 7 PR. PR 1 (motor, #57), PR 2a (dieta, #58), PR 2b (rutina, #59) y PR 3 (control semanal, #60) por la API; PR 4 (web de la analítica y del control semanal, #61, ADR-090) con E2E en escritorio y celular; PR 5a (evolución, tendencia por mes y ficha por la API, #62, ADR-091) y PR 5b (sus pantallas, #63, ADR-092); PR 6a (panel con alertas por la API y en Inicio, #64, ADR-093), PR 6b (material educativo, #65, ADR-094) y PR 6c (fichas en la app, #66, ADR-095); PR 7a (`seed:load` y p95, #67, ADR-096) y PR 7b (`demo:3` con Luis y Mateo, y guion, #68, ADR-097). Criterios 1 a 5 en verde: el 4, con el p95 de docs/demos/demo-3-p95.md. Etiqueta v0.3.0 (39f5b64); staging, pendiente de P4. /notion-sync aplicado (51 cambios en 14 páginas) |
| P14.5 Hoja piloto de JV Fitness | ✅ | Rodrigo | #70 a #94 | Aprobado por Rodrigo (2026-11-08, ADR-098), en 25 PR contra main. Fase A: metas de día (#70, ADR-099), volumen ajustado (#77, ADR-106) y la cadera, la comparativa física y el estrés (#78, ADR-107). Con las respuestas de Jeremy: perfiles de día (#71 y #72, ADR-100 y ADR-101), porciones por perfil (#73 y #74, ADR-102 y ADR-103), cambios del día (#75 y #76, ADR-104 y ADR-105), panel de fatiga (#79, ADR-108), check-in del domingo (#80 y #81, ADR-109 y ADR-110), la prescripción de la hoja (#82, #83 y #85, ADR-111, ADR-112 y ADR-114), el descanso por tramos (#84, ADR-113), la fatiga por grupo muscular (#86, ADR-115) y WhatsApp (#87, ADR-116). Fase C, fuera del contrato y cotizada por la cláusula 12: informe del mesociclo (#88 y #89, ADR-117 y ADR-118), fotos de progreso (#90 y #91, ADR-119 y ADR-120), coeficientes de la fatiga (#92, ADR-121) y expediente de documentos (#93 y #94, ADR-122 y ADR-123). Los 4 criterios en verde: G-41 a G-44 en `test/golden` (motor 1.17.0) y el panel de Mateo por HTTP en `demo-3.int.spec.ts`. /notion-sync aplicado (87 cambios en 11 páginas) |
| P15 Marca, calendario, admin y migración | 🟨 | Rodrigo | #97 | Plan aprobado (2026-11-13, ADR-124): 9 PR, la marca al final por pedido del cliente. PR 1 y 2, la agenda por la API y sus pantallas (ADR-125, ADR-126; el 1, abierto en #97); PR 3a y 3b, el panel interno (ADR-127, ADR-128); PR 4a y 4b, el soporte con permiso (ADR-129, ADR-130) |
| P16 Producción y entrega, Demo 4 | ⬜ | Rodrigo | | |

Leyenda: ⬜ pendiente · 🟨 en curso · ✅ terminado · ⛔ bloqueado

## En curso
- P15 en curso (plan aprobado el 2026-11-13, ADR-124), uno por vez contra main: 1 agenda por la API; 2 agenda en la web; 3 panel
  interno; 4 soporte con permiso; 5 exportación; 6 supresión; 7 migración; 8 marca completa (al final, a pedido del cliente);
  9 cierre. Decisiones: plantilla CSV propia para la migración y muestra de NutriPlace pedida a Jeremy; exportación con sesión
  por 24 h; permiso de soporte de 1 a 7 días (24 h por defecto); supresión solo de archivados, con el código; banderas de la
  fase C encendidas por defecto.
  - PR 1, la agenda por la API (RF-37; RN-J01 a RN-J03; ADR-125): citas en la agenda propia o, para el dueño y el
    administrador, en la de otro; los cruces los rechaza la base aunque lleguen a la vez; estados con If-Match y la asistencia
    desde que empieza; disponibilidad semanal; el recordatorio por correo 24 h antes de la cita confirmada, una sola vez; las
    citas del paciente por /me y la próxima cita en el panel. Abierto (#97).
  - PR 2, las pantallas de la agenda (ADR-126): la semana y el mes, la disponibilidad, la pestaña Citas del expediente, las
    citas en la línea de tiempo, «Tu agenda de hoy» y la próxima cita en Inicio, las sesiones verificadas y por validar del
    control semanal y «Tus citas» en la app. E2E `agenda.spec.ts`. Listo en local, después del PR 1.
  - PR 3a, el panel interno por la API (ADR-127): planes que crea y cambia la plataforma (TRAMO_5 y TRAMO_50 se cargan en
    producción desde el panel), el uso del cupo de cada organización y las banderas de la fase C, que apagan la función en la
    API, el panel y la app. Listo en local, después del PR 2.
  - PR 3b, las pantallas del panel interno (ADR-128): organizaciones con su cupo, alta, renovar o cambiar de plan, días de gracia
    y funciones; planes con su edición y su alta; lo apagado sale del panel y de la app, y con las fotos apagadas el paciente
    todavía retira su autorización. E2E `plataforma.spec.ts`. Listo en local, después del PR 3a.
  - PR 4a, el soporte con permiso por la API (RN-A09; ADR-129): el dueño da, ve y revoca permisos ACCOUNT o CLINICAL_READ de 1 a
    7 días a una persona de la lista del soporte; el soporte entra a la organización en modo soporte, solo lee lo que abre su
    alcance y cada petición queda en la auditoría; vencer o revocar corta el acceso en la petición siguiente. La base ya no deja
    a la plataforma darse un permiso. Listo en local, después del PR 3b.
  - PR 4b, las pantallas del soporte con permiso (ADR-130): el dueño da y revoca en Organización; el soporte ve sus permisos en el
    panel interno, entra en modo soporte (franja de solo lectura, sin escribir, sin pacientes con ACCOUNT) y sale. E2E
    `soporte.spec.ts`. Listo en local, después del PR 4a.
- P14.5 terminado (#70 a #94; aprobado el 2026-11-08, ADR-098), en 25 PR contra main: lo que trae la hoja piloto de Jeremy, por
  fases. Fase A, sin esperar respuestas:
  PR 1a, metas de día de entrenamiento y de descanso; PR 2, volumen ajustado por RIR y descanso; PR 6a, la cadera en Progreso,
  la comparativa inicial → actual y el estrés en el control semanal. Nada que dependa de una respuesta se publica con valores
  inventados.
  - PR 1a por la API (ADR-099): `MACROS_REST_DAY` (motor 1.7.0), las kcal del día de descanso en el plan y su snapshot
    (versión 2), el tipo de cada día según el programa vigente en `daily_target` y en el resumen diario, la meta de ese tipo
    (sin programa, la de la prescripción), Hoy y Mi plan por /me, y la analítica de dieta. El editor de la web conserva las
    kcal de descanso al guardar. Fusionado (#70).
  - Jeremy respondió P-20 el 2026-11-08 (ADR-100): mandan los gramos y hay perfiles de día propios. El PR 1c, por la API, reemplaza
    las kcal de descanso:
    - `MACROS_DAY_PROFILE` (motor 1.8.0) y `nutrition.plan_day_profile`;
    - el perfil de cada sesión del programa;
    - la meta de cada día según el perfil que pide el programa;
    - el perfil en `daily_target`, en el resumen diario, en /me y en la analítica.
  - PR 1d (ADR-101):
    - el editor de perfiles en los tres editores del plan, con la proteína y la grasa de Entrenamiento ya puestas;
    - el perfil de cada sesión del programa;
    - Hoy, Mi plan y la analítica;
    - las fichas EXCHANGE_DIET y WEEKLY_MENU 1.1.0;
    - Mateo en `demo:3`, con 2,510 y 2,230 kcal y la meta de cada día de octubre.
  - PR 1b, las porciones de cada perfil por la API (P-20.5, ADR-102):
    - `STARCH_BY_DAY_PROFILE` (motor 1.9.0) sugiere los almidones de cada tiempo y el coach los cambia
      (`nutrition.plan_meal_profile_exchange`);
    - en composición y menú, la cantidad de cada alimento o receta por perfil (`nutrition.plan_item_profile`);
    - la adecuación de cada perfil, el snapshot 4 y, en la app, las porciones del perfil del día al ver y registrar el plan.
  - PR 1f, sus pantallas (ADR-103):
    - los almidones de cada perfil en el paso «Reparto y alimentos», con la sugerencia y su método, el ajuste a mano y la
      adecuación de cada perfil;
    - «Porciones de» en composición y menú: en un perfil solo se escriben sus cantidades, con su día y su adecuación;
    - el plan publicado, Hoy y Plan de la app, y las fichas EXCHANGE_DIET y WEEKLY_MENU 1.2.0;
    - el Descanso de Mateo en `demo:3`: 30 g de pan en la media tarde y 50 g de papa en la cena, de ejemplo.
  - PR 1e, los cambios del día por la API (P-20.3, ADR-104):
    - «no entreno hoy», «mover a mañana» (con la sesión y su perfil) y «sí entreno hoy», del paciente o del coach, solo hoy;
    - el perfil que el coach elige para hoy o mañana (`tracking.day_change`);
    - la meta de hoy se vuelve a fijar con `tracking.day.rescheduled`, y la analítica recalcula con `tracking.target.changed`;
    - Hoy trae la agenda de hoy y mañana; Entreno y los registros leen el día con sus cambios.
  - PR 1g, sus pantallas (ADR-105): «Hoy y mañana» en Hoy, con «No entreno hoy», «Mover a mañana» y «Sí entreno hoy», y en
    Seguimiento del panel, con el perfil de hoy y de mañana que elige el coach.
  - PR 2, volumen ajustado (P-26, ADR-106): `ADJUSTED_VOLUME` (motor 1.10.0) con la tabla de factores versionada y el descanso
    prescrito de cada serie; por día, por semana y por grupo en la analítica de rutina, con «sin factor» aparte.
  - PR 6a (ADR-107): la cadera en Progreso de la app, la «Comparativa física» en Evolución y el estrés promedio en el control
    semanal, que solo informa (P-25).
  - PR 3, panel de fatiga y recuperación (P-23 a P-25, ADR-108): `FATIGUE_PANEL_JV` (motor 1.11.0) con los umbrales versionados,
    por semana en Analítica › Rutina y con la alerta en Inicio. Reproduce las semanas de Mateo: el 22/10 asistió (P-33).
  - PR 5a, el check-in de la semana por la API (P-21, P-22, ADR-109): del domingo al martes, con la alimentación, el peso si la app
    lo permite y un comentario que llega como nota sin leer; el control semanal toma esa alimentación (`WEEKLY_REVIEW_JV` 3.1.0,
    motor 1.12.0).
  - PR 5b, sus pantallas (ADR-110): «Check-in de la semana» en Hoy, del domingo al martes, con «Corregir»; el registro diario deja
    de pedir la alimentación.
  - PR 9a, el catálogo de la prescripción (P-34, ADR-111): movilidad de hombro, movilidad torácica y estabilidad lumbar, los
    ejercicios de Jeremy por nivel (provisionales) y sus 9 filas en la tabla patrón × nivel.
  - PR 9b, la propuesta con las sesiones de la hoja (P-34, ADR-112): plantilla 2.0.0 (motor 1.13.0) con Superior A, Inferior A,
    Superior B e Inferior B con 4 días y Acondicionamiento el día 3 con 5; el tempo y el descanso de cada patrón; la flexión y la
    extensión de rodilla como patrones (20), con sus filas provisionales. G-31 cambia: ya aplicado en Notion 03.
  - El ajuste del volumen ajustado (P-26, ADR-113): `ADJUSTED_VOLUME` 1.1.0 (motor 1.14.0), con el descanso por tramos, el RIR
    entre filas por la fórmula y, con RPE y sin RIR, 10 − RPE entre 0 y 5.
  - PR 9c, cómo se escribe la prescripción (P-34, ADR-114): «/lado», segundos y «esfuerzo suave (RPE 5–6)» con un solo texto en
    contracts para el panel, la app y la ficha de rutina 1.1.0; el snapshot congela si el ejercicio es unilateral, su modalidad y
    su medida. WhatsApp (P-35) va aparte. Fusionado (#85).
  - PR 4, fatiga por grupo muscular (P-27, ADR-115): `MUSCLE_FATIGUE_JV` 1.0.0 (motor 1.15.0) con la fatiga de cada grupo (1.0 y
    0.5), su «Base 3 sem.» (las semanas de la carga del panel, con 0 donde no se entrenó), el estado con +15 % y +30 % y la
    recuperación estimada de 48, 60 y 72 h, versionada en `training.fatigue_panel_threshold`. En Analítica › Rutina, debajo de
    las series por grupo. Las cuatro columnas de coeficientes esperan a Jeremy (P-27.1). Fusionado (#86).
  - PR 9d, el seguimiento asistido por WhatsApp (P-35, ADR-116): se activa en el perfil de entrenamiento; una línea arriba del
    macrociclo del programa y del control semanal con «Abrir WhatsApp», que pide el enlace wa.me a la API. Sin el código de país,
    pide agregarlo en la ficha; cada pedido del teléfono queda en la auditoría. Fusionado (#87).
  - PR 7a, el informe del mesociclo por la API (fase C; P-28 y P-29, ADR-117): `MESOCYCLE_REPORT_JV` 1.0.0 (motor 1.16.0, RN-G19,
    G-44) con el volumen cumplido, los récords y los promedios de cada semana; `training.mesocycle_report` con Borrador y Enviado,
    que se envía al cerrar el mesociclo y congela los números, el control semanal y la comparativa física; el comentario del
    alumno por /me. Mateo da 9 de 9 series por semana y récords 0, 3, 3 y 0. Fusionado (#88).
  - PR 7b, las pantallas del informe (ADR-118): Entrenamiento › Informes en el panel, con el resumen, cada semana con su
    control, los récords, la comparativa física, el borrador y el envío; Más › Informes en la app, con el comentario. E2E
    `informe.spec.ts` y la sección 9 del guion de la Demo 3. Fusionado (#89).
  - PR 6b-1, las fotos de progreso por la API (P-30, ADR-119): el consentimiento propio `PROGRESS_PHOTOS` con el texto del abogado,
    tres vistas por mesociclo desde su última semana, que suben el alumno y el coach; cada lectura auditada; se borran al archivar
    al alumno o al revocar, sin días de gracia. Fusionado (#90).
  - PR 6b-2, las pantallas de las fotos (ADR-120): Entrenamiento › Fotos en el panel y Progreso › Fotos de progreso en la app, con
    la autorización, las tres vistas de cada mesociclo y la comparativa por vista; el navegador achica la foto antes de subirla.
    E2E `fotos.spec.ts` y las fotos en la sección 9 del guion. Fusionado (#91).
  - Los coeficientes de la fatiga por grupo muscular (P-27.1 y P-27.2, ADR-121): `MUSCLE_FATIGUE_JV` 1.1.0 (motor 1.17.0) con las
    cuatro columnas de la hoja por la familia de cada ejercicio (patrón y equipo), promediadas según el volumen.
    `analytics:rebuild --all` ya corrió en la base local; en staging y producción, después de migrar. Fusionado (#92).
  - PR 8a, el expediente de documentos por la API (P-31, ADR-122): `clinical.record_document` con 8 categorías, Pendiente → Por
    revisar → Validado, HEALTH_DATA e IMAGES, archivos de hasta 5 MB y borrado lógico auditado. Fusionado (#93).
  - PR 8b, sus pantallas (ADR-123): la pestaña Documentos en el panel y Más › Documentos en la app, con la E2E
    `documentos.spec.ts` y la sección 9 del guion. Fusionado (#94).
  - Cierre (2026-11-12): /notion-sync aplicado, 87 cambios en 11 páginas (02, 03 en la 1.16, 04, 05 en la 1.13, 05.1, 05.2,
    05.3, 07 en la 1.4, Proyecto, los prompts P14.5 a P16 y el Documento técnico en la 1.10), y G-41 a G-44 en `test/golden`, que
    ahora corre `pnpm test:golden`.
- P14 terminado (#57 a #68, etiqueta v0.3.0 en 39f5b64; plan aprobado el 2026-11-05, ADR-086), en 7 PR contra main. Plan de Rodrigo: completar la Demo 3 y, en ella, corregir
  cada punto faltante, como P4, para llevar bien la Demo 4 y cerrar el proyecto:
  - PR 1, motor: `WEEKLY_REVIEW_JV` 3.0.0 con los agregados, el semáforo, el factor ajustado y la decisión sugerida (RN-G16); G-39 en
    verde. Motor 1.6.0 (#57);
  - PR 2a, analítica de dieta por la API (#58, ADR-087): el módulo analytics con el resumen diario (consumidor, trabajo de cada hora y
    `analytics:rebuild`), `TrackingApi` con los ajustes aplicados y `GET /patients/:id/analytics/diet`. Criterios 1 a 3 en la integración;
  - PR 2b, analítica de rutina por la API (#59, ADR-088): el volumen semanal por grupo contra lo programado, el 1RM por día con la fórmula
    del programa y `GET /patients/:id/analytics/training` con el macrociclo, el cumplimiento, la carga sRPE y el SFR;
  - PR 3, control semanal por la API (#60, ADR-089): `training.weekly_review`, el cálculo al cerrar cada semana (trabajo de cada hora o al
    abrir el control), la decisión del coach con nota que deja la versión siguiente en borrador, el registro tardío que reemplaza el
    control y los umbrales editables. Criterio 5 y G-39 por HTTP;
  - PR 4, web (#61, ADR-090): la pestaña Analítica con dieta y rutina (gráficos de `@nutricoach/ui/chart` con su tabla accesible), el control
    semanal en Entrenamiento con el resumen del macrociclo y la decisión (el factor sugerido a 2 decimales) y los umbrales en Ajustes. E2E
    en escritorio y celular, con el criterio 5 en pantalla;
  - PR 5a, evolución por la API (#62, ADR-091): las series por método con el cambio frente al CMD95, lo que ve el paciente (por dos
    funciones SECURITY DEFINER que solo le devuelven lo suyo), la tendencia por mes de RN-G09 y la ficha de evolución 1.0.0;
  - PR 5b, pantallas de la evolución (ADR-092): Evaluaciones › Evolución con las medidas frente al CMD95, los métodos por separado,
    el gráfico de una serie, la tendencia por mes y la ficha; Progreso en la app. E2E en escritorio y celular;
  - PR 6a, panel con alertas (ADR-093): `patient_overview` recalculada por eventos y cada hora, `GET /analytics/overview` y las
    alertas en Inicio (sin registros en 3 días, adherencia baja, notas sin leer, semáforo del día y de la semana, controles sin
    decidir). E2E en escritorio y celular;
  - PR 6b, material educativo (ADR-094): la biblioteca con enlaces, videos, artículos y PDF, la asignación desde la app de cada
    paciente y Más › Material en la app, con la primera hora en que lo abrió. E2E en escritorio y celular;
  - PR 6c, fichas en la app (#66, ADR-095): Más › Fichas en PDF con las vigentes (plan, rutina, resultados y evolución); el paciente pide
    por el nombre y la API elige el origen. E2E en escritorio y celular;
  - PR 7a, carga y p95 (#67, ADR-096): `pnpm seed:load` (500 pacientes, dos años, 2.97 GB) y `pnpm analytics:p95`, con el peor p95 en
    102 ms (criterio 4). Los trabajos de cada hora y la reconstrucción ya no recorren los registros con la RLS fila por fila;
  - PR 7b, Demo 3 (#68, ADR-097):
    - `pnpm demo:3` deja dos casos. Luis, con «Fuerza base» y su semana G-20. Mateo Prueba, el alumno ficticio de la hoja
      piloto de Jeremy, con su mes de octubre: el control de sus 4 semanas da lo que da la hoja (descarga, descarga,
      continuar, continuar);
    - el guion `docs/demos/demo-3.md` y las preguntas para Jeremy, P-20 a P-37.
- P13 terminado (#50 a #55; plan aprobado el 2026-11-01, ADR-080), en 6 PR contra main:
  - PR 1, motor: `READINESS_JV` 3.0.0 con la carga sRPE, el rendimiento, la recuperación y la indicación del día (RN-G14, RN-G15);
    G-36 a G-38 en verde. Motor 1.5.0;
  - PR 2, registros por la API (ADR-081): comida del plan o del catálogo, agua, notas y peso por /me, con `@PatientOnly`, la ventana de 3
    días, el clientId en cada registro y los eventos; content con los ajustes de la app y los mensajes motivacionales;
  - PR 3, app (ADR-082): Hoy con las comidas del plan para registrar en tres toques, el agua y la sesión del día; el plan con lo de
    fuera del plan; notas, peso e instalar la app en Más; y en el panel, la app del paciente y el plazo de los registros. E2E en
    escritorio y celular; Lighthouse móvil 96 en Hoy;
  - PR 4a, registro diario y entreno por la API (ADR-083): el registro diario con la indicación del día, el entreno con sus series y su
    tonelaje, MENSTRUAL_TRACKING y el cribado del paciente por /me, y la anticoncepción hormonal en el perfil;
  - PR 4b, pantallas (ADR-084): el registro diario en menos de 2 minutos, la indicación del día en Hoy, Entreno serie por serie con el
    tonelaje, el seguimiento del ciclo y el cribado en Más, y la anticoncepción hormonal en el panel. E2E en escritorio y celular;
    Lighthouse móvil 97 en Hoy;
  - PR 5, el profesional y los registros (ADR-085): la pestaña Seguimiento con el día en solo lectura, los ajustes con motivo (excluir o
    corregir la cantidad y los valores) y las notas que quedan leídas al abrirlas. La cola sin conexión (RF-31) queda fuera de P13;
  - los PR 1 a 5 son #50 a #55 (el 4 se dividió en 4a, #53, y 4b, #54). Idempotency-Key obligatoria en los POST de /me (06 §5).
- P12 terminado (#39 a #42 y #44 a #47; #43 se fusionó en la rama de alergias y #44 lo llevó a main):
  - #39 (ADR-070): en el motor, `PRI_JV`, las llaves de seguridad, la propuesta y el macrociclo; G-29 a G-35 y G-40 en verde. Motor 1.4.0;
  - #40 (ADR-071): biblioteca de 169 ejercicios (146 provisionales), tabla patrón × nivel y ejercicios propios; `patient_no_delete`;
  - #41 (ADR-072, ADR-073): anamnesis V2 con su perfil de rendimiento (G-40 por HTTP y en pantalla) y aviso de alergias en la dieta;
  - #42 (ADR-074): un plan no lleva el alimento al que el paciente es alérgico, tampoco dentro de una receta (RN-E17);
  - #44 (ADR-075, ADR-076): seguridad antes de prescribir (perfil, cribado, postura y pruebas físicas) y el expediente oculta lo que la API
    negaría; trae también el arreglo de la E2E de la Demo 1 (run #88);
  - #45 (ADR-077): programa por la API, a mano o como propuesta, con aprobación por bloque, snapshot y metas de entrenamiento del día;
  - #46 (ADR-078): programa en la web, con la E2E del criterio 1 (un mesociclo de 4 semanas con 3 sesiones, duplicado y publicado);
  - #47 (ADR-079): ficha de la rutina `TRAINING@1.0.0`, con las semanas iguales juntas.
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
- Notion: el /notion-sync de P14.5 (2026-11-12) llevó ADR-099 a ADR-123 a 02, 03 (1.16: RN-F18, RN-G18 a RN-G21 y G-41 a G-44),
  04 (RF-44 a RF-46, «Hoja piloto · fase C»), 05 (1.13), 05.1, 05.2, 05.3, 07 (1.4: P-20 a P-37 resueltas), Proyecto, los prompts
  P14.5, P15 y P16 y el Documento técnico (1.10): 87 cambios aprobados por Rodrigo.
- Notion: el /notion-sync de P14 (2026-11-08) llevó ADR-086 a ADR-098 a 01, 02, 03 (1.14), 04, 05 (1.12), 05.1, 05.2, 05.3, 06,
  07 (1.3: P-20 a P-37 en §15), Proyecto (hoja piloto y R9), Creación del proyecto, Prompts (P14.5 nuevo) y el Documento
  técnico (1.9): 51 cambios aprobados por Rodrigo.
- Notion: el /notion-sync de P13 (2026-11-05) llevó ADR-080 a ADR-085 a 02, 03 (1.13), 04, 05 (1.11), 05.1, 05.2, 06, 07 (1.2),
  Proyecto, el prompt de P14 y el Documento técnico (1.8: el resumen de ADR-052 a ADR-085, que se había quedado en ADR-051, y el
  glosario): 30 cambios aprobados por Rodrigo.
- Notion: el /notion-sync de P12 (2026-10-31) llevó ADR-070 a ADR-079 a 02, 03 (1.12), 04, 05 (1.10), 05.1, 05.2, 06, 07 (1.1) y
  Archivos del repositorio: 35 cambios aprobados por Rodrigo.
- Notion: el método de entrenamiento de Jeremy (plantilla V3, sin reloj) quedó documentado en la página 07 y en 03
  (RN-F13 a RN-F17, RN-G11, RN-G14 a RN-G17, G-29 a G-40), 04 (RF-25, RF-26, RF-28, RF-29, RF-34, RF-41 a RF-43),
  05.2 (sección «Entrenamiento según la plantilla V3»), prompts P12 a P14, Proyecto y Documento técnico (aprobado por
  Rodrigo, 2026-10-21).
- Rediseño «Instrumento» (ADR-051): #20 fusionado (039bb67)
- Notion sigue nombrando a Iván en 01 (aprobación del despliegue a producción), en la ruta crítica de Creación del
  proyecto, en la plantilla de STATUS de Archivos del repositorio y en el Equipo de Proyecto: se deja así por decisión
  de Rodrigo (2026-10-16)

## Siguiente paso
- Antes de la Demo 3: la matriz manual de navegadores (RNF-19: Chrome, Edge, Safari y Firefox; la E2E cubre Chromium
  y WebKit), que no quedó registrada en las demos 1 y 2
- P15 (marca, calendario, panel interno, exportación y migración): /prompt P15, plan primero. Su exportación y su supresión suman
  lo de P14.5: los check-in del domingo, los cambios del día, los informes, las fotos y el expediente (RN-G19 a RN-G21)
- Al desplegar P14.5 en staging y producción: `pnpm db:migrate` y después `analytics:rebuild --all` (ADR-121; está en el prompt
  de P16)
- Demo 3: lista con v0.3.0 y `pnpm demo:3` (guion en docs/demos/demo-3.md). Falta la semana del paciente de prueba desde su
  celular (la evidencia de 04)
- Hoja piloto de Jeremy (2026-11-07, interna: no se comparte hasta que la valide): P-20 a P-37 resueltas (07 §15) y P14.5
  entregado. Siguen «Provisional» los ejercicios de la hoja (ADR-111) y las 6 filas de flexión y extensión de rodilla (ADR-112):
  se revisan en P16 (alcance 7)
- Para la Demo 3 y la Demo 4, según el plan de Rodrigo (2026-11-05): resolver lo que falta del Notion maestro, empezando por P4
  (staging) en cuanto llegue la cuenta de Hetzner
- Confirmar la fecha de inicio: si fue el 24-09, el 2026-11-05 es el primer día de la semana 7 y la Demo 4 cae el 25-11
- Demo 2: presentada, a la espera de su feedback. Falta enviar el acta (docs/actas/demo-2.md) con los nombres de las partes
  confirmados contra el contrato (ADR-068): la aceptación por escrito deja el cobro de la semana 7 (Pago 2) sin otra revisión
- Cada base nueva necesita los catálogos: `pnpm --filter api build && pnpm catalog:load plataforma@demo.example.com`
  en local; en staging y producción, con el correo de su PLATFORM_ADMIN
- db:seed carga el caso Luis: sus resultados aparecen cuando corre el worker
- Desde P6, cada apps/api/.env local necesita STORAGE_LOCAL_PATH con una ruta absoluta (ADR-043)

## Bloqueos y preguntas al cliente
- [ ] Cuenta de Hetzner y dominio a nombre de Jeremy: bloquea P4
- [x] Hoja piloto «JV Fitness · Mi plan» (`docs/preguntas/hoja-piloto-mateo.md`): P-20 a P-37 resueltas (Jeremy, del
  2026-11-08 al 2026-11-10; P-27.1 y P-27.2, Rodrigo, el 2026-11-12) y P14.5 entregado (#70 a #94); lo decidido está en ADR-099
  a ADR-123. Provisionales, de acuerdo con Jeremy: los ejercicios de la hoja, la máquina en los tres niveles de rodilla y
  3 × 8–12 (ADR-111, ADR-112)
- [ ] N9: límites y precio de los tramos de membresía; qué pasa al superar el límite
- [x] Ficha de anamnesis de Jeremy recibida (2026-10-20): será la versión 2 de la historia clínica (RF-43, P12)
- [ ] Antes de P16: cargar en producción los valores definitivos de TRAMO_5 y TRAMO_50 (la semilla no corre en
  producción): desde el panel interno (ADR-127), cuando Jeremy responda N9
- [ ] N22: caducidad del enlace de acceso del paciente (provisional: 7 días, ajustable por organización en
  patient_invitation.ttl_days, de 1 a 30)
- [ ] N19: confirmar la carga manual de bioimpedancia (lista cerrada de 8 indicadores, ADR-044)
- [ ] ⚠️ Noveno diámetro de ISAK 2: confirmarlo con la guía de acreditación ISAK (2023); hoy el catálogo tiene 42 sitios
- [ ] ⚠️ Rangos de rechazo de perímetros, diámetros y longitudes, y condiciones de la evaluación con umbral de 2 h:
  validarlos con quien revisa los cálculos clínicos
- [ ] P7: «etiqueta v0.1.0 desplegada en staging» queda pendiente de P4; la Demo 1 se hizo en local con la semilla
- [ ] P11: la v0.2.0 tampoco está en staging (P4); la Demo 2 se hizo en local con `pnpm demo:2`
- [ ] Acta de la Demo 2: confirmar los nombres de las partes contra el contrato antes de enviarla (ADR-068)
- [x] N13: alternativa, regresión y progresión en la biblioteca (RF-25); Jeremy lo confirma en P-13
- [x] N7: lo resuelve el registro diario de la plantilla V3 (RN-G11)
- [ ] Método de entrenamiento de Jeremy: preguntas P-01 a P-19 (Notion 07 §15; P-17 ya resuelta). Mientras no respondan, P12 a P14 se
  construyen con la propuesta de cada una
- [ ] P-19, pregunta nueva para Jeremy (ADR-080): con la FC en reposo bajo la basal, la parte de FC de la recuperación pasa de 100, aunque la
  recuperación se declara de 0 a 100. Se construye con tope de 100
- [ ] Jeremy revisa los 146 ejercicios base provisionales, y la regresión y progresión de los 23 de la V3 (ADR-071)
- [ ] Preguntas nuevas para Jeremy (ADR-070): P-15, cuál formulario manda (`01` y `02` con puntaje, o `08_ANAMNESIS_V2` y
  `09_CRIBADO_V2`, sin puntaje y con otros códigos); P-16, si «Caminata inclinada» va de verdad con 3 × 8-12 y RIR 2; y
  confirmar el quinto día (P-04)
- [x] P-17: un plan no lleva el alimento enlazado a una alergia o intolerancia activa; Jeremy dio el visto bueno (ADR-074)
- [ ] P-18, notas del coach (ADR-077, ADR-079): la ficha de la rutina imprime las de la sesión y del ejercicio, no la de la
  sustitución, y la app de P13 sigue el mismo criterio (ADR-080). Confirmar con Jeremy
- [ ] R4: permiso de uso de las listas Dextre y ADA
- [x] Porción sugerida de verduras, frutas y almidones: carbohidratos totales de la TPCA (CHOCDF), los que la app
  muestra como «Carbohidratos»; lo decidió Rodrigo (2026-10-22, ADR-059)
- [x] TPCA 2017: Rodrigo, tras consultar con un abogado, autoriza usarla sin la autorización del INS con tres
  condiciones (ADR-055): la API no devuelve el código del alimento en la TPCA, el texto «de referencia» en vez de
  «oficiales» y la atribución de fuentes una sola vez, en «Acerca de» (ADR-056). Sin logos ni aval del Estado
- [ ] Captura de un plato por foto: la visión espera un acuerdo con Jeremy (un modelo propio también es IA, regla 10)
- [x] Textos legales revisados por el abogado del cliente, en lenguaje claro (Notion, Proyecto §7; lo confirmó Rodrigo el
  2026-11-05). El repositorio sigue con las versiones 0.1-provisional: las revisadas entran como versión nueva (ADR-039) y la marca
  «Provisional» se quita en P16
- [ ] Recordatorio (Rodrigo, 2026-11-05): revisar después el texto de MENSTRUAL_TRACKING, 0.1-provisional desde P13 (ADR-083), que
  no estaba entre los que revisó el abogado
- [ ] ⚠️ Menores: desde los 14 consienten como un adulto; antes, solo en papel firmado por su padre, madre o tutor, sin
  registrar quién es el tutor (ADR-042). Pendiente de confirmar con el abogado

## Deuda técnica
- La unidad del repositorio (/mnt/Datos2, NTFS con ntfs3) quedó con una entrada dañada tras un reinicio (2026-11-08): está
  apartada en `.git/refs-remotes-origin-danado-2026-11-08` y git funciona. Hay que correr `chkdsk /f` desde Windows, o
  `ntfsfix` con la unidad desmontada, y después borrar esa carpeta
- Consultas en paralelo dentro de una transacción (`Promise.all` en `me.queries.ts` y `patient-self-service.ts`): `pg` avisa que `pg@9` lo quitará.
  Antes de subir a esa versión, pasarlas a secuencia (ADR-083)
- P16, antes de la entrega: revisar y quitar los mensajes de «Provisional» (ejercicios base, lista DEMO, textos legales) o
  dejar marcado lo que siga sin confirmar (pedido de Rodrigo, 2026-10-30)
- Al terminar la Demo 3 (recordatorio que pidió Rodrigo, 2026-11-01):
  - activar en GitHub el borrado automático de la rama al fusionar y borrar las ramas ya fusionadas, remotas (47 el
    2026-11-01) y locales: con la rama vieja viva, un PR apilado se fusiona contra ella, como pasó con #43
- care_team_scope medido con `seed:load` (ADR-096): la función por fila solo pesó al recorrer los registros de todos los
  pacientes (ya no se hace); las consultas de un paciente quedan con p95 de 102 ms o menos. Si con 3 000 pacientes pesa
  (P16), pasar a patient_id = ANY((SELECT app.visible_patient_ids())), que se evalúa una vez por consulta (ADR-037)
- P5 sin desplegar a staging (06 §9): queda pendiente de P4. Al desplegar: APP_URL con https,
  SESSION_COOKIE_NAME=__Host-nc_session, API_INTERNAL_URL al compilar, SEED_DEMO_PASSWORD y la CLI
  create-platform-admin para el primer PLATFORM_ADMIN
- Para P4: Caddy sin trusted_proxies, para que reescriba X-Forwarded-For con la IP real; en el Sentry de la web,
  quitar el fragmento de las URL (beforeSend y beforeBreadcrumb): ahí viajan los tokens de invitación y recuperación
- RF-31, cola sin conexión (deseable): fuera de P13 por decisión de Rodrigo (ADR-085); hoy cada registro lleva clientId e
  Idempotency-Key, así que un reintento no duplica
- La alternativa y las variantes de un ejercicio todavía no se registran en la app: el snapshot no trae sus músculos (ADR-083)
- Lighthouse móvil en CI sobre staging (RNF-03) cuando exista staging; hoy se mide en local
- CSP del despliegue: style-src con 'unsafe-inline' por BrandStyle (ADR-027)
- La marca es provisional hasta la personalización (módulo 19, RF-36), que se hace en P15; la organización activa ya
  sale de la sesión (P5)
- `pnpm seed:load` genera 500 pacientes con dos años (ADR-096); el de 3 000 y los escenarios k6 sobre un servidor idéntico
  llegan en P16 (RNF-01 y RNF-02). Reconstruir todo tarda 21 min en local, limitado por la CPU de Node
- Planes TRAMO_5 y TRAMO_50 con límites y precio provisionales (N9): corregir con migración de datos al cerrarse
- La imagen de la API debe copiar apps/api/prisma/migrations: /api/health/ready las compara (ADR-026)
- TypeScript fijado en 6.0 hasta que typescript-eslint soporte TypeScript 7 (ADR-018)
- Jackson y Pollock 7 deja de crecer con la suma de pliegues sobre 395 mm (hombres) y 419 mm (mujeres): consultar si se advierte
- RF-06: LOGIN y LOGIN_FAILED (sin organización) solo los ve la plataforma; su vista llega con el panel interno (P15)
- P14: las series de evolución leen result_metric unido a calculation_result vigente (ADR-046)
- Dos copias de atomically en iam, en las invitaciones de staff y de paciente: usar la de apps/api/src/platform
  (ADR-045). backoffice ya la usa
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
- Un borrador de programa o de plan no se puede borrar: generar dos propuestas deja dos borradores en la lista (ADR-078)
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

## Registro de sesiones (solo las 5 últimas)
- 2026-11-12 · Cierre de P14.5 · #93 y #94 fusionados (el expediente de documentos por la API y sus pantallas, ADR-122 y
  ADR-123). /notion-sync aplicado: 87 cambios en 11 páginas (ADR-099 a ADR-123, RN-F18, RN-G18 a RN-G21 y G-41 a G-44). P14.5
  terminado en 25 PR (#70 a #94), con los 4 criterios en verde y G-41 a G-44 en `test/golden`
- 2026-11-12 · P14.5, fase C (6b-2, coeficientes y 8a) · #90, #91 y #92 fusionados (las fotos de progreso por la API y sus
  pantallas, ADR-119 y ADR-120; los coeficientes de la fatiga por grupo muscular, motor 1.17.0, ADR-121). Plan del PR 8 aprobado:
  el 8a, el expediente de documentos por la API, con IMAGES para las fotos y los enlaces por 07 (#93, ADR-122), y el 8b, sus
  pantallas en el panel y en la app (ADR-123)
- 2026-11-08 · Cierre de P14 · #66, #67 y #68 fusionados (fichas en la app, carga y p95, `demo:3`), etiqueta v0.3.0 en 39f5b64 y
  /notion-sync aplicado (51 cambios en 14 páginas, con P-20 a P-37 en 07 §15). P14.5 aprobado (ADR-098) y en Notion; su
  PR 1a por la API (#70, ADR-099). Jeremy respondió P-20: PR 1c con los perfiles de día por la API (#71, ADR-100, motor 1.8.0) y
  PR 1d con sus pantallas, las fichas 1.1.0 y Mateo en `demo:3` (ADR-101). La
  unidad NTFS dejó dañada la ref `origin/main` tras un reinicio: quedó apartada en `.git/refs-remotes-origin-danado-2026-11-08`
- 2026-11-07 · P14 (PR 5a a PR 7b) · #61 a #64 fusionados y #65 abierto; 6c, 7a y 7b listos en local. Evolución y sus pantallas,
  panel con alertas, material educativo, fichas en la app, `seed:load` con el p95 (102 ms) y `demo:3` con Luis y Mateo. Hoja piloto
  de Jeremy revisada: Mateo en la demo, preguntas P-20 a P-37 y P14.5 propuesto
- 2026-11-06 · P14 (PR 1 a PR 4) · #56 a #59 fusionados y #60 abierto. Cierre de P13 con el /notion-sync; motor del control semanal (#57),
  analítica de dieta y de rutina por la API (#58, #59), control semanal por la API (#60, ADR-089) y su web con la analítica y los umbrales
  (ADR-090), con E2E en escritorio y celular
