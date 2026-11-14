# Migración de cuentas de nutricionista

El contrato incluye la migración de hasta cinco cuentas de nutricionista (Paquete B, RF-40): sus pacientes, sus evaluaciones y sus
planes. Entran con la plantilla CSV de esta carpeta. Cuando llegue una muestra de las exportaciones de NutriPlace, un conversor las
pasará a este formato. Decisiones en DECISIONS.md, ADR-135.

## Qué hay que preparar

Una carpeta por cuenta, con estos cuatro archivos y estos nombres exactos. La carpeta `plantilla/` trae un ejemplo con datos
inventados.

- `pacientes.csv`
- `evaluaciones.csv`
- `tomas.csv`
- `planes.csv`

Cada archivo:

- **Formato:** CSV en UTF-8, separado por comas, con el encabezado exacto de abajo en la primera fila. En Excel: «Guardar como» →
  «CSV UTF-8 (delimitado por comas)».
- **Celdas:** un texto con comas va entre comillas, como en el ejemplo.
- **Fechas y números:** las fechas, AAAA-MM-DD (2025-03-14). Los decimales, con punto (72.5) y sin separador de miles.
- **Vacíos:** un archivo puede tener solo el encabezado, por ejemplo si la cuenta no tenía planes.
- **El `id_origen`:** el id de cada fila en el sistema anterior, de 1 a 64 letras sin tildes, números, punto o guiones. Nunca el
  número de documento ni el nombre. Con él, la importación sabe qué ya entró.

### pacientes.csv

`id_origen,nombres,apellidos,sexo,fecha_nacimiento,tipo_documento,numero_documento,telefono,correo,poblacion,activo,consentimiento_datos_salud`

| Columna | Qué va | Obligatoria |
|---|---|---|
| `sexo` | F o M | Sí |
| `tipo_documento`, `numero_documento` | DNI, CE, PASAPORTE u OTRO, y su número. Los dos o ninguno | No |
| `telefono`, `correo` | Para contactarlo e invitarlo a la app | No |
| `poblacion` | ADULTO, DEPORTISTA, NINO, ADOLESCENTE, OBESIDAD o ADULTO_MAYOR. Vacía es ADULTO, como en el alta de la app. Decide los métodos de cálculo | No |
| `activo` | SI o NO. Vacía es SI. El inactivo entra archivado y no ocupa cupo | No |
| `consentimiento_datos_salud` | La fecha en que el paciente consintió el tratamiento de sus datos de salud con su nutricionista | No, pero ver abajo |

**El consentimiento:**

- **Con fecha:** entra como consentimiento «migrado», con esa fecha (pendiente de validación legal).
- **Sin fecha:** el paciente entra con su ficha, pero sin sus evaluaciones ni sus planes, que son datos de salud (RN-B01). El
  profesional registra el consentimiento en la app y se vuelve a correr la importación.
- **Menor de 14 en esa fecha:** el consentimiento no se migra, porque solo vale el papel firmado por su tutor, y se registra en la
  app con el escaneo.
- **OBESIDAD:** necesita la fecha del consentimiento.

### evaluaciones.csv

`id_origen,id_paciente,fecha,nivel,en_ayunas,actividad_intensa_24h`

- **`id_paciente`:** el `id_origen` del paciente en `pacientes.csv`.
- **`fecha`:** AAAA-MM-DD, con la hora opcional (2025-03-14 08:30), en la hora de Lima. Sin hora, las 09:00.
- **`nivel`:** BASICO, ISAK1 o ISAK2. Cada nivel pide sus sitios (la tabla de abajo).
- **`en_ayunas` y `actividad_intensa_24h`:** SI o NO. Vacías son NO, como en el formulario de la app.
- **El cálculo:** la evaluación entra cerrada y NutriCoach calcula sus resultados con los métodos de la organización, cada número
  con su método. Si el sistema anterior usaba otra ecuación, el % de grasa puede no coincidir.

### tomas.csv

`id_evaluacion,sitio,toma_1,toma_2,toma_3,lado`

- **Una fila por sitio:** con su código y sus tomas, en la unidad de la tabla.
- **Las tomas:** dos por sitio, como en la app (RN-C02). Si difieren más que la tolerancia del sitio, hace falta la tercera.
- **`lado`:** DERECHO o IZQUIERDO. Vacío es DERECHO.
- **Fila con error:** una evaluación con una toma mala no entra entera, para no quedar incompleta.

| Código | Sitio | Unidad | Rango | BASICO | ISAK1 | ISAK2 |
|---|---|---|---|---|---|---|
| BASIC_WEIGHT | Peso | kg | 20 a 300 | ✔ | ✔ | ✔ |
| BASIC_HEIGHT | Talla | cm | 100 a 230 | ✔ | ✔ | ✔ |
| BASIC_SITTING_HEIGHT | Talla sentado | cm | 45 a 130 |  | ✔ | ✔ |
| BASIC_ARM_SPAN | Envergadura | cm | 90 a 250 |  | ✔ | ✔ |
| SKF_TRICEPS | Pliegue del tríceps | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_SUBSCAPULAR | Pliegue subescapular | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_BICEPS | Pliegue del bíceps | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_ILIAC_CREST | Pliegue de la cresta ilíaca | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_SUPRASPINALE | Pliegue supraespinal | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_ABDOMINAL | Pliegue abdominal | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_FRONT_THIGH | Pliegue del muslo anterior | mm | 0 a 80 |  | ✔ | ✔ |
| SKF_MEDIAL_CALF | Pliegue de la pantorrilla medial | mm | 0 a 80 |  | ✔ | ✔ |
| GIRTH_HEAD | Perímetro de la cabeza | cm | 40 a 70 |  |  | ✔ |
| GIRTH_NECK | Perímetro del cuello | cm | 20 a 60 |  |  | ✔ |
| GIRTH_ARM_RELAXED | Perímetro del brazo relajado | cm | 12 a 70 |  | ✔ | ✔ |
| GIRTH_ARM_FLEXED | Perímetro del brazo flexionado y en tensión | cm | 12 a 75 |  | ✔ | ✔ |
| GIRTH_FOREARM | Perímetro del antebrazo | cm | 12 a 50 |  |  | ✔ |
| GIRTH_WRIST | Perímetro de la muñeca | cm | 8 a 25 |  |  | ✔ |
| GIRTH_CHEST | Perímetro del tórax | cm | 40 a 170 |  |  | ✔ |
| GIRTH_WAIST | Perímetro de la cintura | cm | 40 a 200 | ✔ | ✔ | ✔ |
| GIRTH_HIP | Perímetro de la cadera | cm | 45 a 200 | ✔ | ✔ | ✔ |
| GIRTH_THIGH_GLUTEAL | Perímetro del muslo a 1 cm del pliegue glúteo | cm | 25 a 110 |  |  | ✔ |
| GIRTH_THIGH | Perímetro del muslo medio | cm | 20 a 100 |  | ✔ | ✔ |
| GIRTH_CALF | Perímetro de la pantorrilla | cm | 15 a 70 |  | ✔ | ✔ |
| GIRTH_ANKLE | Perímetro del tobillo | cm | 10 a 40 |  |  | ✔ |
| LENGTH_ACROMIALE_RADIALE | Longitud acromial-radial | cm | 14 a 45 |  |  | ✔ |
| LENGTH_RADIALE_STYLION | Longitud radial-estilión | cm | 10 a 35 |  |  | ✔ |
| LENGTH_MIDSTYLION_DACTYLION | Longitud mediestilión-dactilión | cm | 8 a 25 |  |  | ✔ |
| LENGTH_ILIOSPINALE_HEIGHT | Altura ilioespinal | cm | 40 a 130 |  |  | ✔ |
| LENGTH_TROCHANTERION_HEIGHT | Altura trocantérea | cm | 40 a 125 |  |  | ✔ |
| LENGTH_TROCHANTERION_TIBIALE_LATERALE | Longitud trocantéreo-tibial lateral | cm | 18 a 60 |  |  | ✔ |
| LENGTH_TIBIALE_LATERALE_HEIGHT | Altura tibial lateral | cm | 20 a 65 |  |  | ✔ |
| LENGTH_TIBIALE_MEDIALE_SPHYRION_TIBIALE | Longitud tibial medial-maleolar | cm | 16 a 55 |  |  | ✔ |
| LENGTH_FOOT | Longitud del pie | cm | 12 a 35 |  |  | ✔ |
| BREADTH_BIACROMIAL | Diámetro biacromial | cm | 18 a 55 |  |  | ✔ |
| BREADTH_BIILIOCRISTAL | Diámetro biiliocrestal | cm | 14 a 45 |  |  | ✔ |
| BREADTH_TRANSVERSE_CHEST | Diámetro transverso del tórax | cm | 14 a 45 |  |  | ✔ |
| BREADTH_AP_CHEST | Diámetro anteroposterior del tórax | cm | 9 a 35 |  |  | ✔ |
| BREADTH_HUMERUS | Diámetro biepicondíleo del húmero | cm | 3 a 10 |  | ✔ | ✔ |
| BREADTH_WRIST | Diámetro biestiloideo de la muñeca | cm | 2.5 a 8 |  | ✔ | ✔ |
| BREADTH_FEMUR | Diámetro bicondíleo del fémur | cm | 5 a 14 |  | ✔ | ✔ |
| BREADTH_ANKLE | Diámetro bimaleolar del tobillo | cm | 4 a 10 |  |  | ✔ |
| SKF_CHEST | Pliegue pectoral (Jackson y Pollock) | mm | 0 a 80 |  |  |  |
| SKF_MIDAXILLARY | Pliegue axilar medio (Jackson y Pollock) | mm | 0 a 80 |  |  |  |
| SKF_SUPRAILIAC | Pliegue suprailíaco (Jackson y Pollock) | mm | 0 a 80 |  |  |  |

Un sitio sin marca en ningún nivel, como los pliegues de Jackson y Pollock, se puede sumar a cualquier evaluación.

### planes.csv

`id_origen,id_paciente,desde,hasta,kcal,proteina_g,grasa_g,carbohidratos_g,agua_ml,indicaciones`

- **Qué entra:** cada plan pasa al historial del paciente, de solo lectura, con sus metas y sus indicaciones tal como venían.
- **Qué no:** no se convierte en un plan de NutriCoach, porque un plan nace de una prescripción que calcula el motor (RF-18).
  Cuando el profesional arma el plan nuevo, ve al lado las metas del último plan importado.
- **Metas:** cada una puede faltar, pero el plan necesita al menos una o sus indicaciones.
- **Fechas:** `hasta` vacío si seguía vigente.
- **`agua_ml`:** entera.

## Cómo se corre

La corre un administrador de plataforma, una cuenta a la vez. El nutricionista de la cuenta tiene que ser antes miembro activo de
la organización: queda como responsable de sus pacientes y como autor de sus evaluaciones y planes.

```sh
# 1. Validar sin escribir nada: lo que entraría, lo que ya entró y cada fila con error.
pnpm --filter api account:import ./cuenta-1 --org <id de la organización> --member <correo del nutricionista> --admin <correo> --dry-run

# 2. Importar, con el informe completo en JSON.
pnpm --filter api account:import ./cuenta-1 --org <id> --member <correo> --admin <correo> --report informe-cuenta-1.json
```

- **El informe:** por archivo, cuántas filas trae, cuántas entraron, cuántas ya estaban y cuántas tienen error, con el número de fila
  y el motivo. Después, los conteos contra la base y un muestreo de 10 filas por tipo (`--sample N`) vueltas a leer campo por
  campo. No trae nombres, documentos ni correos.
- **Correr dos veces:** no duplica. Lo que ya entró se salta; lo que falló entra cuando se corrige la causa (el cupo, un
  consentimiento) y se vuelve a correr.
- **Lo que no corrige:** una fila que ya entró no se actualiza. Si cambió en el origen, el muestreo lo muestra como diferencia.
- **El cálculo:** los resultados de las evaluaciones los calcula el worker, como siempre. Tiene que estar corriendo.
- **Cada archivo:** queda como lote en `platform.import_batch`, con su hash, sus conteos y quién corrió la importación.
