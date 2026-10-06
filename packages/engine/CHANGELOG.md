# Changelog del motor de cálculo

Cambiar una fórmula o una constante sube la versión del método afectado y la del motor (02 §9).
Los resultados guardados conservan la versión con que se calcularon (RN-D01, RN-D08).

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
  `EE_MET_COMPENDIUM2024`, y el GET aditivo o factorial (`totalEnergyExpenditure`, sin código propio).
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
