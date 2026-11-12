# Changelog del motor de cálculo

Cambiar una fórmula o una constante sube la versión del método afectado y la del motor (02 §9).
Los resultados guardados conservan la versión con que se calcularon (RN-D01, RN-D08).

## 1.16.0 — 2026-11-11

- `MESOCYCLE_REPORT_JV` 1.0.0 (P14.5, PR 7a; P-28 y P-29, respuestas de Rodrigo del 2026-11-10 y del 2026-11-11; ADR-117), el informe
  de un mesociclo:
  - volumen cumplido: series hechas × 100 ÷ planificadas de la rutina completa, por semana y en el mesociclo; sin series
    planificadas, sin dato;
  - récords (RN-G19): un 1RM estimado más alto que el mejor que el ejercicio tenía hasta ese día; la primera vez no cuenta y cada
    ejercicio cuenta una vez por semana, con su récord más alto;
  - el sueño, el estrés, la fatiga, el rendimiento y la alimentación de cada semana, del control semanal, y su promedio en las
    semanas con dato, como la hoja (6.4, 6.8, 7.1 y 7.4 h dan 6.9 h);
  - NC-ENG-417 (semanas fuera de orden o de rango) y NC-ENG-418 (los 1RM de los ejercicios).
- G-44: el mes de Mateo da 223 ÷ 240 = 92.9 % y récords en las semanas 2 y 3.

## 1.15.0 — 2026-11-11

- `MUSCLE_FATIGUE_JV` 1.0.0 (P14.5, PR 4; P-27, respuesta de Jeremy del 2026-11-10 y decisiones de Rodrigo del 2026-11-11;
  ADR-115), la fatiga por grupo muscular de una semana:
  - «Fatiga entrenamiento»: el volumen ajustado del grupo, con 1.0 para el principal y 0.5 para el secundario;
  - «Base 3 sem.»: el promedio del grupo en las semanas previas que entran en la carga del panel (P-24), con 0 en la que no se
    entrenó;
  - estado con los umbrales de P-23 (ámbar sobre +15 % y rojo sobre +30 %) y recuperación estimada de 48, 60 y 72 h;
  - sin volumen, «faltan datos»; sin base o con la base en 0, «sin base»;
  - NC-ENG-415 (insumos fuera de rango) y NC-ENG-416 (umbrales cruzados).
- `FATIGUE_PANEL_JV` no cambia: su regla de la carga se exporta como `loadLightOf` para que ambos comparen igual.

## 1.14.0 — 2026-11-11

- `ADJUSTED_VOLUME` 1.1.0 (P14.5; P-26, respuestas de Rodrigo del 2026-11-11; ADR-113):
  - el descanso va por tramos: cada fila vale hasta su valor, la «o más» desde el suyo y, entre la última fila y la «o más», la
    última. Con la tabla de Jeremy: hasta 45 s = 1.15, de 46 a 60 s = 1.10, de 61 a 75 s = 1.05, de 76 a 179 s = 1.00 y 180 s o
    más = 0.95;
  - el RIR entre dos filas sigue la recta entre ellas, que es la fórmula de Jeremy (RIR 1.5 = 1.15);
  - con RPE y sin RIR, el RIR es 10 − RPE entre 0 y 5 (RN-F05): RPE 8 = RIR 2 = 1.1. Un RPE fuera de 0 a 10 da NC-ENG-412.
  - Sin RIR ni RPE, o sin descanso prescrito, la serie sigue «sin factor». Las tablas no cambian.

## 1.13.0 — 2026-11-11

- Plantilla de la propuesta de rutina 2.0.0 (RN-F14; P14.5, PR 9b; P-34, respuesta de Jeremy y decisiones de Rodrigo del
  2026-11-11; ADR-112):
  - con 4 días, Superior A, Inferior A, Superior B e Inferior B, con los bloques de la hoja piloto; con 5, lo mismo con
    Acondicionamiento el día 3 (`UPPER_LOWER_CONDITIONING`, antes `PUSH_PULL_LEGS`, que queda para los programas guardados);
  - con 2 y 3 días, los días 1 a 3 de la V3, sin cambios en sus bloques;
  - el tempo y el descanso salen del patrón (`PATTERN_BASE`), como la hoja: por ejemplo, sentadilla 3-1-1 y 120 s, curl femoral
    2-1-2 y 75 s, movilidad 45 s. Las series, las repeticiones y el RIR base siguen en 3 × 8–12 y RIR 2;
  - dos patrones nuevos, flexión y extensión de rodilla (20 en total).
- G-31 con 5 días pasa a `UPPER_LOWER_CONDITIONING`. El criterio 4 de P12 compara la hoja de la V3 con la propuesta de 3 días
  (sus 24 primeras filas). Los programas ya propuestos conservan su `template_version` 1.0.0.

## 1.12.0 — 2026-11-10

- `WEEKLY_REVIEW_JV` 3.1.0: la alimentación que el asesorado declara en el check-in del domingo (P14.5, PR 5a; P-21 y P-22,
  respuestas de Jeremy; ADR-109) manda sobre el promedio de los días, en el agregado y en el semáforo. Llega como
  `weeklyNutritionCompliancePct`, de 0 a 100 y entero (NC-ENG-410 fuera de rango). Sin check-in no se envía y todo sigue igual:
  los controles que ya existen conservan sus insumos y su hash. G-39 sigue igual.

## 1.11.0 — 2026-11-10

- Nuevo método `FATIGUE_PANEL_JV` 1.0.0: el panel de fatiga y recuperación de la hoja piloto de JV Fitness (P14.5, PR 3; P-23 y
  P-24, respuestas de Jeremy), por semana del macrociclo (ADR-108). Recuperación con el estrés y el sueño promedio, carga con el
  volumen ajustado frente al promedio de las 3 semanas previas que tienen volumen, fatiga percibida y estado general (el peor de
  los tres; «sin base» no suma alerta). Los umbrales son datos versionados y los promedios se comparan sin redondear. Insumos
  fuera de rango: NC-ENG-413; umbrales cruzados: NC-ENG-414. G-01 a G-40 siguen igual.

## 1.10.0 — 2026-11-10

- Nuevo método `ADJUSTED_VOLUME` 1.0.0: el volumen ajustado de la hoja piloto de JV Fitness (P14.5, PR 2; P-26, respuesta de
  Jeremy): por serie, repeticiones × carga × factor RIR × factor del descanso prescrito, con las tablas de factores como datos
  versionados (ADR-106). Un RIR o un descanso que la tabla no trae queda «sin factor», nunca como 1, y se cuenta aparte. Sin
  carga, la serie aporta 0 kg. Tablas mal formadas: NC-ENG-411; series con valores negativos: NC-ENG-412. G-01 a G-40 siguen
  igual.

## 1.9.0 — 2026-11-09

- Nuevo método `STARCH_BY_DAY_PROFILE` 1.0.0: los almidones de un perfil de día por tiempo de comida (07 §2, P14.5). El perfil
  es el mismo plan con más o menos intercambios de almidones y lo demás no cambia (P-20.5, respuesta de Jeremy). Los que pide
  salen de la diferencia de carbohidratos entre el perfil y el plan, en intercambios enteros (medio cuenta como uno). Los de
  menos se quitan primero de la media tarde, luego de la cena y después del último tiempo al primero, sin bajar de 0; los de
  más se suman de a uno, alternando la media tarde y la cena (P-20.6, respuesta de Jeremy), y sin ninguna de las dos, por
  turnos del último tiempo al primero (RN-E09). Es la sugerencia que el coach cambia (ADR-102). Insumos fuera de rango:
  NC-ENG-313 (carbohidratos) y NC-ENG-314 (tiempos). G-01 a G-40 siguen igual.

## 1.8.0 — 2026-11-08

- Nuevo método `MACROS_DAY_PROFILE` 1.0.0: un perfil de día del plan (07 §2, P14.5). El coach escribe los gramos de
  carbohidratos, proteína y grasa, y las kcal salen de ellos con Atwater (RN-E07): mandan los gramos (P-20.2, respuesta de
  Jeremy). Gramos negativos o todos en 0: NC-ENG-312.
- Se retira `MACROS_REST_DAY` 1.0.0 (1.7.0), con NC-ENG-310 y NC-ENG-311: partía de las kcal del día de descanso y Jeremy
  respondió que mandan los gramos. No llegó a staging ni a producción, así que ningún resultado guardado lo cita (ADR-100).
- Ningún otro método cambia: G-01 a G-40 siguen igual.

## 1.7.0 — 2026-11-08

- Nuevo método `MACROS_REST_DAY` 1.0.0: metas del día de descanso (07 §2, P14.5). La proteína y la grasa en gramos son
  las del día de entrenamiento y los carbohidratos van por diferencia con los factores de Atwater (RN-E07), como en la
  hoja piloto de JV Fitness; Jeremy lo confirma en P-20. Carbohidratos negativos: NC-ENG-310. Kcal no positivas o gramos
  negativos: NC-ENG-311.
- Ningún método existente cambia: G-01 a G-40 siguen igual.

## 1.6.0 — 2026-11-05

- Nuevo método `WEEKLY_REVIEW_JV` 3.0.0: control semanal de JV Fitness (RN-G16, 07 §10). Da los agregados de la semana
  (sesiones con duración mayor que 0, carga sRPE y los promedios sobre los días con dato), el semáforo con sus razones, el
  factor ajustado (× 0.75 en rojo, × 0.90 en ámbar) y la decisión sugerida, con los umbrales vigentes de la organización,
  que recibe como insumo. Sin sesiones, falta registro y no hay factor sugerido. Un promedio sin dato no enciende el
  semáforo. Funciones puras `weeklyAggregates` y `weeklyDecision`. Insumos fuera de rango: NC-ENG-409 (la semana) y
  NC-ENG-410 (el factor del plan y los umbrales).
- La validación de rangos de `READINESS_JV` pasa a un módulo común, sin cambiar sus mensajes ni su versión.
- Ningún método existente cambia: G-01 a G-38 y G-40 siguen igual.

## 1.5.0 — 2026-11-01

- Nuevo método `READINESS_JV` 3.0.0: recuperación e indicación del día de JV Fitness (RN-G14, RN-G15, 07 §9). Da la carga
  sRPE (minutos × RPE), el rendimiento (real ÷ planificado, con tope de 120 %), las cuatro partes de la recuperación con el
  neutral de la organización donde falta un dato, su promedio y la indicación con los umbrales vigentes, que recibe como
  insumo. La parte subjetiva promedia solo lo respondido (P-02) y la de FC no pasa de 100 (P-19). Sin ningún dato de
  recuperación no hay recuperación ni indicación. Funciones puras `srpeLoad`, `performancePct` y `dailyIndication`.
  Insumos fuera de rango: NC-ENG-406 (registro diario), NC-ENG-407 (línea base) y NC-ENG-408 (umbrales).
- Ningún método existente cambia: G-01 a G-35 y G-40 siguen igual.

## 1.4.0 — 2026-10-30

- Nuevo método `PRI_JV` 2.0.0: perfil de rendimiento de la anamnesis de JV Fitness (RN-F16, 07 §12). Cada dominio vale de
  0 a 100 con sus preguntas respondidas, el PRI pondera solo los dominios respondidos (P-10) y las clases salen sin dato
  si falta uno de sus dominios, como la hoja. Respuesta inválida: NC-ENG-405.
- Reglas puras de la plantilla V3, sin sobre porque no son un cálculo guardado: `screeningStatus`, `movementTestStatus`
  y `prescriptionStatus` (RN-F15, `SAFETY_RULE_VERSION` 1.0.0); `routineSplit`, `sessionName`, `suggestedExercise` y
  `proposeRoutine` (RN-F14, `ROUTINE_TEMPLATE_VERSION` 1.0.0); `macrocycleWeeks`, `macrocycleMesocycles`, `weekSets` y
  `proposalWeek` (RN-F13, P-06, P-07). Las tablas de fases y de patrón por nivel son datos: el motor las recibe.
- Ningún método existente cambia: G-01 a G-28 siguen igual.

## 1.3.0 — 2026-10-23

- `RECIPE_NUTRIENTS` 1.1.0: además de los totales, suma aparte lo que sí se conoce (`knownTotals` y
  `knownPerServing`) y cuenta los ingredientes que no traen cada nutriente (`missingIngredients`). Sirve para mostrar
  «al menos X · falta en N de M» en los micronutrientes de una receta o de un día (RN-I03, ADR-061). Los totales no
  cambian: un dato que falta en un ingrediente sigue dejando el total «sin dato». El aviso NC-ENG-307 ya no nombra
  la versión.

## 1.2.0 — 2026-10-13

- `MUSCLE_LEE2000` 1.1.0: el insumo del coeficiente de grupo de referencia se llama `referenceGroupCoefficient`, y
  la lista de valores, `LEE_REFERENCE_GROUP_COEFFICIENTS`, como lo nombra RN-D11. El nombre anterior aludía a un dato
  que la ficha del paciente no guarda (Ley 29733). Cambia el nombre de un insumo y con él el hash; ningún número
  cambia: G-09 (32.58 kg) sigue igual.

## 1.1.0 — 2026-10-07

- Nuevo método `TEE_PAL` 1.0.0: gasto energético total, GET = TMR × PAL más el ejercicio neto en la estrategia
  aditiva (RN-E02, RN-E03, ADR-016). Reemplaza la función `totalEnergyExpenditure`, que no tenía código. Insumos:
  TMR, PAL, estrategia (`ADDITIVE` o `FACTORIAL`), modo del ejercicio (`NET`), ejercicio neto diario y edad.
  Validez de la fila «GET con PAL» de 03: ERROR fuera de PAL 1.40–2.40 (NC-ENG-211) y aviso en menores de 18
  (NC-ENG-210). Ningún número cambia: G-14 (2462) y G-15 (2605) siguen igual.

## 1.0.0 — 2026-10-06

Primera versión, portada de `docs/reference/engine.ts` sin cambiar ningún número de `examples.ts`
(prueba `test/reference-parity.spec.ts`). Todos los métodos en la versión 1.0.0.

### Métodos (39, Notion 02 §9)

- Calidad del dato: `CONSOLIDATE_ISAK`, `TEM_ISAK`, `MDC95`.
- Indicadores: `BMI`, `WAIST_HEIGHT`, `WAIST_HIP`, `CORRECTED_GIRTH`.
- Dos componentes: `FAT_DW1974_SIRI1961`, `FAT_JP1978_7`, `FAT_FAULKNER1968`, `FAT_YUHASZ1974`.
- Cuatro y cinco componentes: `COMP4_DEROSE_GUIMARAES`, `BONE_ROCHA1975`, `RESIDUAL_WURCH1974`,
  `MUSCLE_LEE2000`, `COMP5_KERR1988`.
- Proporcionalidad: `CORMIC_INDEX`, `MANOUVRIER_INDEX`, `ACROMIOILIAC_INDEX`.
- Metas: `TARGET_WEIGHT_FAT_PCT`, `FAT_LOSS_7700`.
- Energía: `RMR_MIFFLIN1990`, `RMR_HB1919`, `BMR_SCHOFIELD1985`, `RMR_CUNNINGHAM1980`, `RMR_KATCH_MCARDLE`,
  `EE_MET_COMPENDIUM2024`, y el GET aditivo o factorial (función sin código; desde 1.1.0 es `TEE_PAL`).
- Dieta: `MACROS_PROTEIN_FIRST`, `EXCHANGES_CLASSIC`, `MEAL_SPLIT_LARGEST_REMAINDER`, `RECIPE_NUTRIENTS`,
  `ADEQUACY`.
- Entrenamiento: `TONNAGE`, `ONERM_EPLEY1985`, `ONERM_BRZYCKI1993`, `RPE_FROM_RIR`, `FRACTIONAL_SETS`, `SFR`,
  `COMPLIANCE`.

### Diferencias con el motor de referencia, todas fijadas en Notion 03 v1.1 y v1.2

- Durnin y Womersley: hombres de 50 o más con m = 0.0779 del artículo original; la referencia y la guía
  copiaban la errata 0.0799 del consenso GREC 2009 y se corrigieron en el mismo cambio (ADR-022, G-26).
  Bandas nuevas de 17–19 años (hombres) y 16–19 (mujeres), y bandas por años cumplidos.
- FAO/OMS/UNU pasa a `BMR_SCHOFIELD1985` con sus seis bandas desde 0 años (G-28).
- Validez por método con gravedad ERROR, ADVERTENCIA o INFO (RN-D06), coeficiente obligatorio de Lee
  (RN-D11), 1RM sin estimar con más de 12 repeticiones (RN-F04) y PAL entre 1.40 y 2.40 (RN-E02).
- Rangos fisiológicos antes de calcular (RN-C04) y avisos con su regla: RN-D07, RN-E04, RN-E07 y RN-E12.
- Intercambios nunca negativos (RN-E08); tonelaje y series fraccionadas sin calentamiento (RN-F03, RN-F06).
- Sobre de resultado común con `inputsHash` = SHA-256 del JSON canónico de los insumos (RN-D01).
