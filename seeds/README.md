# seeds

Datos que no son código (06 §1). Los de personas son sintéticos: ningún dato de una persona real (RN-B08). Los
catálogos de food/ y exercise/ salen de publicaciones, con su fuente, edición y licencia (RN-I02).

## Catálogos globales (RF-38)

`pnpm catalog:load <correo de un PLATFORM_ADMIN activo>` los importa, en orden, con el importador de la plataforma
(RN-I04): cada archivo es un lote de platform.import_batch con su hash SHA-256 y sus conteos, y el mismo archivo dos
veces deja el segundo lote como DUPLICATE sin tocar nada. Corre en todo entorno, también en producción, donde db:seed
no corre; antes hay que compilar la API (`pnpm --filter api build`). Un archivo suelto se importa con
`pnpm catalog:import <TIPO> <archivo> <correo>`.

| Archivo | Tipo | Filas | SHA-256 del CSV |
|---|---|---|---|
| food/tpca-2017.csv | TPCA_FOODS | 928 | 2c70ad57f15091b944adb7b1ea8ccf10bdc2adecbde3fdf52177b3a663d384b6 |
| exercise/compendium-2024.csv | COMPENDIUM_ACTIVITIES | 560 | bc7fdf041739c180b1934e0d6c39f414889246b3da57fea44ee47486c5fca6b5 |

Un CSV nuevo cambia su hash: se carga como un lote nuevo y actualiza por código lo que cambió (ADR-052).

## food/tpca-2017.csv

Tablas peruanas de composición de alimentos 2017, 10.ª edición (Instituto Nacional de Salud, Centro Nacional de
Alimentación y Nutrición; ISBN 978-612-310-117-6). PDF oficial de 146 páginas, SHA-256
db18470f2651ba198db806fe45bf7f04e30d1f62783f8a88b9755c2ad42c25d7, de
https://lamejorreceta.ins.gob.pe/sites/default/files/2020-12/tablas-peruanas-QR_0.pdf

⚠️ **Licencia:** la publicación dice «Prohibida la reproducción total o parcial de esta obra por cualquier medio sin
autorización del Instituto Nacional de Salud». Se carga mientras se tramita esa autorización; si no llega, el plan B
es USDA FoodData Central, de dominio público (decisiones de Rodrigo, 2026-10-20).

- 928 alimentos en 14 grupos (A:160 B:125 C:142 D:41 E:90 F:103 G:26 H:16 J:15 K:7 L:29 Q:8 T:85 U:81). El grupo S,
  942 preparaciones del INEI, queda fuera por ahora (decisión de Rodrigo, 2026-10-20).
- Columnas: `codigo,grupo,nombre,imputado_de` y los 22 nutrientes por 100 g de parte comestible con su identificador
  INFOODS del Anexo 1, en el orden de la publicación. La tabla escribe `<CARTBQ>`; aquí va CARTBEQ, el de INFOODS.
  «Ácido fólico» no trae identificador: va como FOL (ADR-052).
- Convenciones de la publicación: «•» es «sin dato» y queda vacío (RN-I03); «0,0» es cero o trazas y queda 0; «Tr,»,
  una sola vez (F98, tiamina), queda `tr`. Los asteriscos tras el nombre marcan alimentos imputados de otras tablas
  (* Tabla INCAP 2012, ** Tabla Boliviana 2005, *** Tabla Uruguaya, **** FAO): van en `imputado_de` y se quitan del
  nombre. Son 64.
- El importador guarda «sin dato» como NULL con MISSING, las trazas como 0 con TRACE y los valores de un alimento
  imputado con IMPUTED; el estado sale del nombre: COOKED si nombra una cocción, RAW si no (ADR-052).

Se extrae con `node scripts/catalogs/extract-tpca.ts <pdf> ../../seeds/food/tpca-2017.csv` desde apps/api (requiere
poppler). Cada valor va a la columna que tiene encima en la fila de unidades. El extractor comprueba el conteo y los
códigos, y lista las diferencias de la propia publicación, que se conservan tal cual:

- kJ que no son kcal × 4.184 (más de 3 kJ de diferencia): A93, A94, A95, A96, D18, F3, F14, F32, F34, F37, F47, F48,
  F51 a F61, F102, F103 y K1;
- D25 (Linaza): carbohidratos totales y disponibles 0 con fibra dietaria 27.9 g; su suma proximal da 74.5 g;
- L29 (Vainilla, extracto): la suma proximal da 65.8 g.

## exercise/compendium-2024.csv

2024 Adult Compendium of Physical Activities (Herrmann SD, Willis EA, Ainsworth BE y otros. 2024 Adult Compendium of
Physical Activities: A third update of the energy costs of human activities. Journal of Sport and Health Science
2024;13(1):6-12, doi:10.1016/j.jshs.2023.10.010). PDF de 28 páginas, SHA-256
ac30234b8f8f813837e282773cfcb3e0fe062334777c2f7b3213429c4fbc251c, de
https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf

**Licencia:** el sitio permite el uso comercial gratuito si se cita, sin cambiar los MET y sin combinar actividades
con MET distintos.

- 560 de las 1114 actividades, las de 7 encabezados (decisión de Rodrigo, 2026-10-20): Ciclismo 44,
  Acondicionamiento físico 86, Baile 28, Correr 66, Deportes 156, Caminar 93 y Actividades acuáticas 87.
- Columnas: `codigo,encabezado,descripcion,met,descripcion_en`. Código, MET y descripción en inglés son los del PDF;
  la descripción en español es una traducción propia, guiada por la traducción oficial de la edición 2011
  (SHA-256 270d82273462fba3669a48c73c39bdd050e2573d6552ca2d696e78d757ac01a5), que no sirve tal cual: el 2024 cambió
  descripciones, MET y algunos códigos.
- Convenciones de la traducción: *vigorous* es «vigoroso»; las mph llevan sus km/h entre paréntesis
  (× 1.609344, a un decimal), los min/milla sus min/km, las lb sus kg, las pulgadas sus cm y las yardas por minuto sus
  m/min; punto decimal, como el resto de la aplicación, y raya en los rangos. Los códigos Taylor se conservan.
- El MET de 18290 viene con dos decimales («8.00»): queda 8.0, el mismo valor.

Se extrae con `node scripts/catalogs/extract-compendium.ts <pdf> ../../seeds/exercise/compendium-2024.csv` desde
apps/api. El extractor une las 5 filas partidas del PDF (02050, 03039, 03060, 15135 y 18290), conserva la traducción
de cada código cuyo MET y descripción en inglés no cambiaron y verifica cada traducción: que conserve todos los
números de la descripción oficial y que cada equivalencia entre paréntesis sea la conversión exacta.

Las equivalencias que ya trae el Compendium se copian tal cual, aunque no sean exactas: 15591, 15593 y 15594 (km/h
frente a mph), 17220, 17231 (5.0–5.5 mph como 8.8–8.9 km/h) y 17346 (mph frente a km/h), y 17018, 17313, 17315
(20–30 lb como 9.0–15.0 kg), 17434 y 17438 (lb frente a kg).

## assessment/measurement-sites.json

Catálogo global de sitios de medición (assessment.measurement_site, RN-C01, RN-C04). Tiene 45 sitios:

- los 42 de ISAK 2 que usa la versión 1.0, con los 21 de ISAK 1 y los 4 del nivel básico (peso, talla, cintura y
  cadera). ⚠️ Falta el noveno diámetro de ISAK 2: se agrega con una migración de datos cuando se confirme con la guía
  de acreditación ISAK (2023);
- los 3 pliegues extra de Jackson y Pollock (pectoral, axilar medio y suprailíaco), sin nivel (RN-D04).

Los rangos son de rechazo (RN-C04): dejan pasar desde un niño de 100 cm hasta un adulto con obesidad severa. ⚠️ Los de
perímetros, diámetros y longitudes son provisionales hasta validarlos con quien revisa los cálculos clínicos.

Los códigos que usa el motor salen de packages/engine/src/sites.ts (ADR-023). La migración del catálogo se genera
desde este archivo una sola vez y queda fija. Todo cambio posterior, como el noveno diámetro, va en una migración
nueva y se refleja aquí; una prueba de integración compara el catálogo de la base con este archivo.

## luis/luis.json

El caso Luis de la guía de dominio, completo para la Demo 1:

- paciente, consentimiento HEALTH_DATA e historia clínica, registrados 35 días antes de la evaluación actual: antes
  de cualquier dato de salud (RN-B01);
- el coeficiente de grupo de referencia de Lee de la organización (0, como en docs/reference/examples.ts);
- el estudio de ETM del evaluador con los pares de G-04, vigente desde 90 días antes de la evaluación actual;
- dos evaluaciones ISAK 2 completas: la actual, cuyas tomas consolidan exactamente en los insumos del caso dorado de
  03, y una anterior, 28 días antes, con cambios por encima y por debajo del CMD95 (RN-C06). La actual es mixta: trae
  una lectura de bioimpedancia sintética, con marca y modelo inventados (RN-C08);
- la prescripción energética de G-13 a G-17, que el guion carga en vivo;
- `expected`: los valores de G-01 a G-17 tal como los fija 03, sin redondear para presentar (RN-D09).

Las fechas son relativas a la evaluación actual (`daysBeforeCurrentEvaluation`). Luis cumple 28 años ese mismo día: la
edad decimal al medir es 28.00 y así G-13 cuadra.

Lo usan la semilla de la demo (pnpm db:seed), el guion (docs/demos/demo-1.md), el E2E de la Demo 1 y las pantallas
mientras la API no existe. packages/contracts/src/assessment/seeds.spec.ts lo valida contra los contratos y el motor.

## ana/ana.json

La paciente de la captura en vivo del guion, para que los números de Luis no cambien:

- paciente adulta, con consentimiento HEALTH_DATA e historia clínica, sin evaluaciones;
- `liveCapture`: la evaluación básica que se escribe en vivo, con el pliegue del tríceps como sitio extra para G-01 a
  G-03 (12.0 y 12.4; la segunda corregida a 13.0 pide tercera; 12.6) y la enmienda que corrige el peso (RN-C07);
- `expected`: IMC, cintura/talla y cintura/cadera del motor, antes y después de la enmienda, sin redondear.

La semilla carga a Ana sin `liveCapture`; el guion y el E2E de la Demo 1 escriben esas tomas. seeds.spec.ts la valida
contra los contratos y el motor.
