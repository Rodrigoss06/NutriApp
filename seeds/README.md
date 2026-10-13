# seeds

Datos que no son código (06 §1). Todo es sintético: ningún dato de una persona real (RN-B08).

## assessment/measurement-sites.json

Catálogo global de sitios de medición (assessment.measurement_site, RN-C01, RN-C04). Tiene 45 sitios:

- los 42 de ISAK 2 que usa la versión 1.0, con los 21 de ISAK 1 y los 4 del nivel básico (peso, talla, cintura y
  cadera). ⚠️ Falta el noveno diámetro de ISAK 2: se agrega con una migración de datos cuando se confirme con la guía
  de acreditación ISAK (2023);
- los 3 pliegues extra de Jackson y Pollock (pectoral, axilar medio y suprailíaco), sin nivel (RN-D04).

Los rangos son de rechazo (RN-C04): dejan pasar desde un niño de 100 cm hasta un adulto con obesidad severa. ⚠️ Los de
perímetros, diámetros y longitudes son provisionales hasta validarlos con quien revisa los cálculos clínicos.

Los códigos que usa el motor salen de packages/engine/src/sites.ts (ADR-023). La migración del catálogo carga estas
mismas filas; si cambia una, cambian las dos, y una prueba de integración lo verifica.

## luis/luis.json

El caso Luis de la guía de dominio, completo para la Demo 1:

- paciente, consentimiento HEALTH_DATA e historia clínica;
- el coeficiente de Lee de la organización (0, como en docs/reference/examples.ts);
- el estudio de ETM del evaluador con los pares de G-04, vigente desde 90 días antes de la evaluación actual;
- dos evaluaciones ISAK 2 completas: la actual, cuyas tomas consolidan exactamente en los insumos del caso dorado de
  03, y una anterior, 28 días antes, con cambios por encima y por debajo del CMD95 (RN-C06);
- la prescripción energética de G-13 a G-17;
- `expected`: los valores de G-01 a G-17 tal como los fija 03, sin redondear para presentar (RN-D09).

Las fechas son relativas a la evaluación actual (`daysBeforeCurrentEvaluation`). Luis cumple 28 años ese mismo día: la
edad decimal al medir es 28.00 y así G-13 cuadra.

Lo usan la semilla de la demo (pnpm db:seed), el E2E de la Demo 1 y las pantallas mientras la API no existe.
packages/contracts/src/assessment/seeds.spec.ts lo valida contra los contratos y el motor.
