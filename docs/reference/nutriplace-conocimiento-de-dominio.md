# Conocimiento de dominio detrás de NutriPlace

### Guía para desarrolladores: qué ciencia usa la plataforma y cómo se convierte en código

> **Para qué sirve este documento.** NutriPlace es un SaaS peruano para nutricionistas y entrenadores: mide al paciente, calcula su composición corporal y su gasto energético, arma dieta y rutina, y sigue lo que el paciente registra en una Web App. Detrás de cada pantalla hay una fórmula publicada, un protocolo de medición o una tabla de referencia. Esta guía explica cada concepto desde cero y muestra cómo se implementa.
>
> **Supuestos.** No hace falta saber nutrición. Sí se asume que lees TypeScript. Los ejemplos usan TS porque se traducen directo a un backend Node/NestJS con PostgreSQL.
>
> **Advertencia.** Los coeficientes están transcritos de fuentes citadas al final, pero antes de llevar algo a producción hay que verificarlos contra el artículo original y validar con un profesional. Un error de unidades aquí no es un bug estético: cambia el diagnóstico de una persona.

---

## Cómo leer esta guía

Cada concepto sigue el mismo patrón:

1. **Qué es** — la idea en lenguaje llano.
2. **La regla** — la fórmula o el protocolo, con unidades.
3. **Ejemplo** — calculado sobre el mismo paciente ficticio en toda la guía.
4. **En la app** — cómo se modela, qué se guarda y qué pantalla de NutriPlace lo usa.

Todos los números de los ejemplos salen de ejecutar el código incluido; no son inventados ni redondeados a ojo.

### Paciente de ejemplo ("Luis")

| Dato | Valor |
|---|---|
| Sexo / edad | Hombre, 28 años |
| Peso / talla | 80 kg / 175 cm |
| Talla sentado | 91 cm |
| Pliegues (mm) | tríceps 12, subescapular 16, bíceps 6, cresta ilíaca 22, supraespinal 14, abdominal 25, muslo anterior 18, pantorrilla medial 10 |
| Perímetros (cm) | cabeza 57, brazo relajado 33, antebrazo 28, tórax 100, cintura 86, cadera 98, muslo 55, pantorrilla 37 |
| Diámetros (cm) | húmero 7,0, muñeca 5,8, fémur 9,8, biacromial 40, biiliocrestal 28,5, tórax transverso 30, tórax anteroposterior 20 |
| Objetivo | Bajar grasa hasta 15 %, entrena 3 días/semana |

### Glosario mínimo

| Término | Significado |
|---|---|
| **Antropometría / cineantropometría** | Medir el cuerpo (pliegues de piel, perímetros, diámetros) para estimar de qué está hecho. |
| **ISAK** | Sociedad internacional que estandariza *cómo* se mide. Certifica niveles 1 y 2. |
| **Pliegue cutáneo** | Doble capa de piel + grasa que se pinza con un plicómetro; se mide en milímetros. |
| **Composición corporal** | Repartir el peso en compartimentos: grasa, músculo, hueso, etc. |
| **Masa libre de grasa (MLG)** | Todo lo que no es grasa: músculo, hueso, agua, órganos. |
| **TMR / TMB** | Tasa metabólica en reposo / basal: calorías que gastas sin hacer nada. |
| **GET** | Gasto energético total del día. |
| **MET** | Unidad de intensidad: 1 MET = estar en reposo ≈ 1 kcal por kg y por hora. |
| **Intercambio (o equivalente)** | Porción de alimento que aporta casi los mismos macronutrientes que otra del mismo grupo; permite cambiar pollo por pescado sin recalcular. |
| **TPCA** | Tablas Peruanas de Composición de Alimentos (INS-CENAN): cuántos nutrientes tiene cada alimento por 100 g. |
| **Macronutrientes** | Carbohidratos, proteínas y grasas. |
| **% de adecuación** | Consumido ÷ prescrito × 100. |
| **1RM** | Peso máximo que alguien levanta una sola vez en un ejercicio. |
| **Tonelaje** | Kilos totales movidos: series × repeticiones × peso. |
| **RIR / RPE** | Repeticiones en reserva / esfuerzo percibido: cuán cerca del fallo quedó la serie. |
| **Mesociclo** | Bloque de entrenamiento de varias semanas con un objetivo. |

---

## Índice

1. [El ciclo clínico completo](#1-el-ciclo-clínico-completo)
2. [Antropometría: cómo se mide y por qué importa el protocolo](#2-antropometría)
3. [Composición corporal: 2, 4 y 5 componentes](#3-composición-corporal)
4. [Energía: cuántas calorías necesita una persona](#4-energía)
5. [Dieta: macronutrientes, intercambios, menús y agua](#5-dieta)
6. [Entrenamiento: volumen, carga y progreso](#6-entrenamiento)
7. [Seguimiento: qué se calcula con lo que registra el paciente](#7-seguimiento)
8. [Cómo se traduce todo a arquitectura](#8-arquitectura)
9. [Mapa NutriPlace ↔ concepto ↔ cálculo](#9-mapa-nutriplace--concepto--cálculo)
10. [Fuentes](#10-fuentes)

---

## 1. El ciclo clínico completo

Todo software de nutrición implementa la misma secuencia. NutriPlace la resume en su canal: *"evaluar, diagnosticar, planificar, prescribir, hacer seguimiento"*.

```
┌──────────┐   ┌───────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────┐
│ EVALUAR  │ → │DIAGNOSTICAR│ → │ PLANIFICAR │ → │ PRESCRIBIR │ → │  SEGUIR      │
│ medir    │   │ interpretar│   │ metas y    │   │ dieta y    │   │ registro del │
│ el cuerpo│   │ los datos  │   │ calorías   │   │ rutina     │   │ paciente     │
└──────────┘   └───────────┘   └────────────┘   └────────────┘   └──────────────┘
     │               │                │                │                  │
  pliegues,      % de grasa,    TMR → GET →       intercambios,      kcal vs meta,
  perímetros,    masa muscular, déficit o          menú TPCA,        % adecuación,
  diámetros,     índices,       superávit,         series y          volumen semanal,
  peso, talla    interpretación tiempo estimado    repeticiones      evolución
```

Cada flecha es una transformación de datos, y cada transformación es una función pura con entradas y salidas verificables. Ese es el corazón de la aplicación: **un motor de cálculo rodeado de CRUD**.

### La cadena de dependencias (importante para el diseño)

```
Medidas crudas
   └→ Composición corporal (% grasa, masa libre de grasa)
        └→ TMR (algunas ecuaciones usan la masa libre de grasa)
             └→ GET (TMR × actividad + ejercicio)
                  └→ Calorías objetivo (GET ± déficit/superávit)
                       └→ Gramos de macronutrientes
                            └→ Número de intercambios por grupo
                                 └→ Intercambios repartidos por tiempo de comida
                                      └→ Lo que el paciente ve y registra en la app
                                           └→ % de adecuación y tendencias
```

Consecuencia de diseño: si cambia una medición vieja, **todo lo que está aguas abajo queda desactualizado**. Por eso no se recalcula al vuelo un plan ya entregado: se guarda un *snapshot* del cálculo (ver §8).

### Una nota sobre los dos sentidos de "perfil"

El folleto de NutriPlace habla de *perfil básico, restringido y completo*: son **protocolos de medición antropométrica** (cuántas medidas se toman). Los videos hablan de *perfiles Básico, Pro y Premium*: son **cuentas de usuario y permisos**. Nombres iguales, entidades distintas; conviene no reutilizar la palabra en el código.

---

## 2. Antropometría

### 2.1 Qué se mide

Cuatro familias de medidas, cada una con su instrumento y su unidad:

| Familia | Qué es | Instrumento | Unidad |
|---|---|---|---|
| **Básicas** | Peso, talla, talla sentado, envergadura | Balanza, tallímetro | kg / cm |
| **Pliegues cutáneos** | Grosor de piel + grasa que se pinza en un punto | Plicómetro (caliper) | mm |
| **Perímetros** | Contorno de brazo, cintura, muslo… | Cinta metálica | cm |
| **Diámetros y longitudes** | Ancho de hueso (codo, rodilla, hombros) y largo de segmentos | Paquímetro, antropómetro | cm |

La grasa subcutánea es medible desde afuera; el músculo y el hueso no. Por eso todo el edificio se apoya en pliegues y perímetros, y de ahí salen **estimaciones**, no verdades.

### 2.2 Por qué existe ISAK

Si dos personas miden "el pliegue del tríceps" en puntos distintos, los resultados no se pueden comparar. ISAK (*International Society for the Advancement of Kinanthropometry*) estandariza los puntos anatómicos, el lado del cuerpo, la técnica y el orden, y acredita a quien mide en dos niveles:

| Perfil | Nivel ISAK | Medidas | Contenido |
|---|---|---|---|
| **Restringido** | 1 | **21** | 4 básicas + 8 pliegues + 6 perímetros + 3 diámetros |
| **Completo** | 2 | **43** | 4 básicas + 8 pliegues + 13 perímetros + 9 diámetros + 9 longitudes |

Perfil restringido, medida por medida:

- **Básicas (4):** talla, peso, talla sentado, envergadura.
- **Pliegues (8):** tríceps, subescapular, bíceps, cresta ilíaca, supraespinal, abdominal, muslo anterior, pantorrilla medial.
- **Perímetros (6):** brazo relajado, brazo flexionado y en tensión, cintura, cadera, muslo, pantorrilla.
- **Diámetros (3):** húmero, biestiloideo (muñeca), fémur.

**Regla de implementación:** los modelos de 2 y 4 componentes se calculan con el perfil restringido; el modelo de 5 componentes y los índices de proporcionalidad necesitan el perfil completo (los diámetros del tórax y las longitudes solo están ahí). Es decir, **el nivel de evaluación determina qué resultados puede ofrecer la app**. Esa es exactamente la opción "medidas básicas / ISAK 1 / ISAK 2" del folleto.

```ts
const REQUIRED_SITES = {
  durninWomersley: ['triceps', 'biceps', 'subscapular', 'iliacCrest'],
  yuhasz:          ['triceps', 'subscapular', 'supraspinale', 'abdominal', 'frontThigh', 'medialCalf'],
  jacksonPollock7: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
  kerr5:           [/* 6 pliegues + 5 perímetros + 6 diámetros + talla sentado */],
};

/** Qué métodos puedo ofrecer con lo que realmente medí. */
const availableMethods = (measured: Set<string>) =>
  Object.entries(REQUIRED_SITES).filter(([, sites]) => sites.every(s => measured.has(s))).map(([m]) => m);
```

Detalle que sorprende: el pliegue **pectoral** y el **axilar medio** no están en el perfil ISAK, pero sí los pide Jackson & Pollock. Un software que ofrece las dos cosas debe pedir medidas extra o deshabilitar esa ecuación. Con las medidas de Luis, `availableMethods` no devolvería `jacksonPollock7`.

### 2.3 Calidad del dato: repetir, comparar, decidir

Protocolo estándar: cada sitio se mide **dos veces**. Si la segunda difiere de la primera en más de **5 % (pliegues)** o **1 % (el resto)**, se toma una **tercera**. Con dos tomas válidas se usa la **media**; con tres, la **mediana**.

```ts
export function consolidateMeasurement(attempts: number[], kind: 'skinfold' | 'other') {
  const tolerancePct = kind === 'skinfold' ? 5 : 1;
  const [a, b] = attempts;
  const diffPct = (Math.abs(b - a) / a) * 100;
  if (attempts.length === 2) {
    if (diffPct > tolerancePct) return { value: null, needsThird: true, diffPct };
    return { value: (a + b) / 2, needsThird: false, diffPct };
  }
  const sorted = [...attempts].slice(0, 3).sort((x, y) => x - y);
  return { value: sorted[1], needsThird: false, diffPct };  // mediana
}
```

Ejemplo:

```
12,0 y 12,4 mm → diferencia 3,3 %  → válido, valor 12,2 mm
12,0 y 13,0 mm → diferencia 8,3 %  → pide tercera toma
12,0 / 13,0 / 12,6 → mediana 12,6 mm
```

**En la app:** la tabla de mediciones no guarda un valor por sitio, guarda *intentos*. El valor consolidado es derivado.

```sql
CREATE TABLE measurement_attempt (
  id             BIGSERIAL PRIMARY KEY,
  evaluation_id  BIGINT NOT NULL REFERENCES evaluation(id),
  site_code      TEXT   NOT NULL,          -- 'triceps', 'waist', ...
  attempt_no     SMALLINT NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  value          NUMERIC(6,2) NOT NULL,
  unit           TEXT NOT NULL,            -- 'mm' | 'cm' | 'kg'
  UNIQUE (evaluation_id, site_code, attempt_no)
);
```

### 2.4 Error técnico de medida (ETM) y cambio real

Nadie mide dos veces exactamente igual. El **ETM** cuantifica ese ruido:

```
ETM = √( Σd² / 2n )        d = diferencia entre la 1.ª y la 2.ª toma del mismo sitio
%ETM = ETM / media × 100
```

Con los pares de Luis el ETM de los pliegues es **0,37 mm (2,35 %)**.

De ahí sale la pregunta que realmente importa en el seguimiento: **¿el cambio entre dos evaluaciones es real o es ruido?** El cambio mínimo detectable al 95 % es:

```
CMD₉₅ = 1,96 × √2 × error de medida
```

Sobre la suma de 6 pliegues de Luis (95 mm, 2,35 % de ETM → 2,23 mm), el CMD₉₅ es **6,19 mm**: bajar de 95 a 92 mm *no* es evidencia de nada. Traducido a porcentaje de grasa con Yuhasz, son **0,65 puntos**.

**En la app:** guardar el ETM por evaluador y marcar los cambios menores al CMD como "dentro del error de medición". Es una función de tres líneas que evita conclusiones falsas:

```ts
export const minimalDetectableChange95 = (measurementError: number) => 1.96 * Math.SQRT2 * measurementError;
const isRealChange = (delta: number, error: number) => Math.abs(delta) > minimalDetectableChange95(error);
```

### 2.5 Indicadores que no necesitan fórmulas complicadas

| Indicador | Fórmula | Luis | Interpretación |
|---|---|---|---|
| IMC | peso / talla² (kg, m) | **26,1** | OMS: 25–29,9 = sobrepeso |
| Cintura | perímetro de cintura | 86 cm | OMS: riesgo desde 94 cm (hombres) y 80 cm (mujeres); riesgo alto desde 102 / 88 |
| Cintura/talla | cintura / talla | **0,49** | umbral habitual 0,5 |
| Índice cintura-cadera | cintura / cadera | 0,88 | OMS: obesidad abdominal desde 0,90 (h) y 0,85 (m) |

El IMC de Luis dice "sobrepeso" y su grasa corporal dice otra cosa (§3). Ese contraste es justamente el argumento de venta de un software antropométrico: **el IMC no distingue músculo de grasa**.

---

## 3. Composición corporal

### 3.1 La idea de "modelos por componentes"

El peso corporal se puede partir de varias maneras. Cada partición es un **modelo**:

| Modelo | Divide el peso en | Qué hace falta medir |
|---|---|---|
| **2 componentes** | grasa + masa libre de grasa | 4–7 pliegues |
| **4 componentes** (De Rose & Guimarães) | grasa + músculo + hueso + residual | pliegues + 2 diámetros |
| **5 componentes** (Kerr & Ross) | piel + tejido adiposo + músculo + hueso + residual | perfil completo ISAK 2 |

Ninguno "mide" grasa: todos la **estiman** con ecuaciones de regresión construidas sobre una población concreta (universitarios ingleses, deportistas australianos, cadáveres de Bruselas…). De ahí la regla de oro del dominio:

> Una ecuación es válida para la población con la que se construyó. Aplicar a un powerlifter peruano de 22 años una ecuación hecha con sedentarios británicos de los años 70 devuelve un número, no una verdad.

Por eso NutriPlace ofrece varias fórmulas para lo mismo, y por eso la app debe **guardar con qué ecuación se calculó cada resultado**.

### 3.2 Dos componentes: densidad → porcentaje de grasa

Es un rodeo en dos pasos. La grasa es menos densa que el músculo y el hueso: quien tiene más grasa "flota" más. Los pliegues predicen la **densidad corporal**, y una segunda ecuación convierte densidad en % de grasa.

**Paso 1 — Durnin & Womersley (1974).** Suma de 4 pliegues (tríceps, bíceps, subescapular, cresta ilíaca) en escala logarítmica, con coeficientes distintos por sexo y edad:

```
Densidad = c − m × log₁₀(Σ4 pliegues en mm)
```

| Edad | Hombres (c, m) | Mujeres (c, m) |
|---|---|---|
| 20–29 | 1,1631 / 0,0632 | 1,1599 / 0,0717 |
| 30–39 | 1,1422 / 0,0544 | 1,1423 / 0,0632 |
| 40–49 | 1,1620 / 0,0700 | 1,1333 / 0,0612 |
| 50+ | 1,1715 / 0,0779 (el consenso GREC 2009 imprime 0,0799, errata) | 1,1339 / 0,0645 |

**Paso 2 — Siri (1961):** `% grasa = 495 / densidad − 450`.

**Ejemplo (Luis):** Σ4 = 12 + 6 + 16 + 22 = **56 mm**, 28 años, hombre.

```
Densidad = 1,1631 − 0,0632 × log₁₀(56) = 1,05261 g/ml
% grasa  = 495 / 1,05261 − 450 = 20,26 %
Masa grasa = 80 × 0,2026 = 16,21 kg
Masa libre de grasa = 63,79 kg
```

```ts
const DURNIN_WOMERSLEY = {
  M: [{ minAge: 20, maxAge: 29, c: 1.1631, m: 0.0632 }, /* … */],
  F: [{ minAge: 20, maxAge: 29, c: 1.1599, m: 0.0717 }, /* … */],
};

export function densityDurninWomersley(sex: Sex, ageYears: number, s: Skinfolds4DW) {
  const row = DURNIN_WOMERSLEY[sex].find(r => ageYears >= r.minAge && ageYears <= r.maxAge);
  if (!row) throw new Error(`Edad ${ageYears} fuera del rango de la ecuación`);  // ← validar, no extrapolar
  const sum = s.tricepsMm + s.bicepsMm + s.subscapularMm + s.iliacCrestMm;
  return row.c - row.m * Math.log10(sum);
}

export const fatPercentSiri = (density: number) => 495 / density - 450;
```

Fíjate en el `throw`: la tabla no cubre menores de 20 años. Extrapolar en silencio es el error clásico de estas calculadoras.

**Jackson & Pollock** es la otra familia de densidad, con términos cuadráticos y de edad:

```
Hombres (7 pliegues):  D = 1,112 − 0,00043499·Σ + 0,00000055·Σ² − 0,00028826·edad
Mujeres (7 pliegues):  D = 1,097 − 0,00046971·Σ + 0,00000056·Σ² − 0,00012828·edad
```

### 3.3 Fórmulas que dan el % de grasa directamente

Sin pasar por densidad; son sumas ponderadas de pliegues:

| Ecuación | Pliegues | Fórmula |
|---|---|---|
| **Faulkner** | tríceps, subescapular, supraespinal, abdominal | `0,153 × Σ4 + 5,783` |
| **Yuhasz / Carter** | los 4 anteriores + muslo anterior + pantorrilla medial | Hombres `0,1051 × Σ6 + 2,585` · Mujeres `0,1548 × Σ6 + 3,580` |

### 3.4 El problema que esto le crea a tu aplicación

Mismo paciente, mismo día, tres ecuaciones:

| Método | % grasa de Luis | Masa grasa |
|---|---|---|
| Durnin & Womersley + Siri | **20,3 %** | 16,2 kg |
| Faulkner | **16,0 %** | 12,8 kg |
| Yuhasz | **12,6 %** | 10,1 kg |

Casi **8 puntos** de diferencia. No es un bug: cada ecuación mide algo ligeramente distinto en una población distinta. Consecuencias de diseño, todas obligatorias:

1. **Nunca mostrar "% de grasa" a secas.** Siempre "% de grasa (Durnin & Womersley + Siri)".
2. **Nunca comparar evaluaciones calculadas con métodos distintos.** La app debe bloquear o advertir esa comparación en el gráfico de evolución.
3. **Elegir la ecuación por población.** El consenso de cineantropometría sugiere: adultos → Durnin & Womersley; deportistas → Withers o Carter-Yuhasz; niños → Slaughter; obesidad → ecuaciones con perímetros. Eso es una tabla de decisión, no un `if` perdido en un servicio.
4. **Versionar.** "Yuhasz" tiene una versión de 1962 y otra de 1974 con constantes distintas. Guarda `method_code` + `method_version`.

```ts
interface BodyCompMethod {
  code: 'DW1974' | 'JP1978' | 'YUHASZ1974' | 'FAULKNER1968';
  version: string;
  population: 'adults' | 'athletes' | 'children' | 'obesity';
  requiredSites: string[];
  citation: string;
  compute(input: AnthroInput): number;
}
```

### 3.5 Cuatro componentes (De Rose & Guimarães)

Reparte el peso en cuatro masas, cada una con su ecuación, y el músculo sale por descarte:

| Componente | Ecuación | Luis |
|---|---|---|
| Grasa | la que elijas (aquí D&W + Siri) | 16,21 kg |
| **Ósea** | Rocha (1975): `3,02 × (talla² × Ø muñeca × Ø fémur × 400)^0,712`, **todo en metros** | **12,02 kg** (15,0 %) |
| **Residual** (órganos y vísceras) | Würch (1974): 24,1 % del peso en hombres, 20,9 % en mujeres | **19,28 kg** |
| **Muscular** | por diferencia (Matiegka): peso − (grasa + ósea + residual) | **32,49 kg** (40,6 %) |

```ts
export const boneMassRocha = (heightM: number, wristBreadthM: number, femurBreadthM: number) =>
  3.02 * (heightM ** 2 * wristBreadthM * femurBreadthM * 400) ** 0.712;

export const residualMassWurch = (sex: Sex, weightKg: number) => weightKg * (sex === 'M' ? 0.241 : 0.209);
```

⚠️ **Trampa de unidades:** Rocha recibe metros (1,75 / 0,058 / 0,098). Si le pasas centímetros el resultado se va por las nubes sin lanzar ningún error. Tipa las unidades o nómbralas en la variable (`heightM`, `wristBreadthM`), como en el código de arriba.

⚠️ **Efecto dominó:** como el músculo sale por diferencia, cualquier error en grasa, hueso o residual aterriza íntegro en el músculo. Si cambias la ecuación de grasa, "cambia" la masa muscular sin que el paciente haya entrenado.

**Alternativa que no depende de la resta — Lee et al. (2000):**

```
MME (kg) = talla_m × (0,00744·PBC² + 0,00088·PMC² + 0,00441·PGC²) + 2,4·sexo − 0,048·edad + etnia + 7,8
```

donde los perímetros van **corregidos** (se descuenta la grasa que rodea al músculo):

```
perímetro corregido (cm) = perímetro − π × (pliegue_mm / 10)
```

Para Luis: brazo 33 − π × 1,2 = **29,23 cm**; el resultado es **32,58 kg** de masa muscular esquelética, casi idéntico a los 32,49 kg por diferencia. Que dos caminos independientes coincidan es buena señal; cuando no coinciden, hay que sospechar de una medida.

### 3.6 Cinco componentes (Kerr & Ross, 1988): el método "Phantom"

Es el más sofisticado y el que exige perfil completo. Divide el peso en **piel, tejido adiposo, músculo, hueso y residual**, y fue validado contra la disección de 25 cadáveres.

**La idea clave — el Phantom.** En vez de predecir kilos directamente, compara al sujeto con un humano de referencia unisex ("Phantom") de **170,18 cm** y masas conocidas. El procedimiento es siempre el mismo:

1. Escalar la medida del sujeto a la talla del Phantom.
2. Convertirla en puntuación **Z** (cuántas desviaciones se aleja del Phantom).
3. Aplicar esa misma Z a la masa del Phantom.
4. Desescalar a la talla real del sujeto.

```
Z = ( valor × (170,18 / talla)^d − P ) / S            d = 1 para medidas lineales
masa = ( Z × S_masa + P_masa ) / (170,18 / talla)³    las masas escalan al cubo
```

Constantes por componente:

| Componente | Variables que suma | P | S | Masa Phantom | DE |
|---|---|---|---|---|---|
| Adiposo | 6 pliegues (tríceps, subescapular, supraespinal, abdominal, muslo, pantorrilla) | 116,41 | 34,79 | 25,6 kg | 5,85 |
| Muscular | 5 perímetros: brazo (−tríceps), antebrazo (sin corregir), tórax (−subescapular), muslo (−muslo ant.), pantorrilla (−pantorrilla) | 207,21 | 13,74 | 24,5 kg | 5,40 |
| Óseo cabeza | perímetro cefálico (no se escala por talla) | 56,0 | 1,44 | 1,20 kg | 0,18 |
| Óseo cuerpo | biacromial + biiliocrestal + 2× húmero + 2× fémur | 98,88 | 5,33 | 6,70 kg | 1,34 |
| Residual | tórax transverso + tórax anteroposterior + cintura corregida (−abdominal); **escala por talla sentado (89,92)** | 109,35 | 7,08 | 6,10 kg | 1,24 |

La piel va por otro camino: superficie corporal × grosor × densidad.

```
SC (m²) = C × peso^0,425 × talla^0,725 / 10 000     C: 68,308 (h), 73,704 (m), 70,691 (<12 años)
piel (kg) = SC × grosor (2,07 mm h / 1,96 mm m) × 1,05
```

**Ejemplo (Luis):**

```
Superficie corporal  1,8599 m²
Piel                 4,04 kg
Tejido adiposo      23,44 kg   (Z = −0,691)
Músculo             35,92 kg   (Z = +1,580)
Hueso                8,72 kg   (cabeza 1,33 + cuerpo 7,40)
Residual             9,46 kg   (Z = +2,440)
────────────────────────────────
Masa estructurada   81,59 kg   vs peso real 80 kg → +1,98 %
```

Dos lecturas que vale la pena entender:

- **Tejido adiposo (23,4 kg) ≠ masa grasa (16,2 kg).** El tejido adiposo incluye células, agua y vasos; la "grasa" química es una fracción de él. Son magnitudes distintas y no se comparan entre sí. Un usuario que vea 20 % en una pantalla y 29 % en otra va a escribir al soporte: la app debe rotular cada número con su modelo.
- **La suma de los cinco componentes debe parecerse al peso real.** Esa diferencia (aquí +1,98 %) es un **control de calidad gratis**: si sale ±8 %, hay una medida mal tomada o mal tipeada. Implementarlo como validación es más útil que cualquier mensaje de error genérico.

```ts
const k = kerrFiveComponent(input);
if (Math.abs(k.diffPct) > 5) warn('Revisar medidas: la masa estructurada no cuadra con el peso');
```

### 3.7 Proporcionalidad: la forma, no la cantidad

Con longitudes y diámetros se describe la **arquitectura** del cuerpo (lo que el folleto llama "extremidades largas o cortas, tronco corto o largo, anchura de hombros y cadera"):

| Índice | Fórmula | Luis | Lectura |
|---|---|---|---|
| **Córmico** (tronco) | talla sentado / talla × 100 | **52,0** | tronco medio |
| **Manouvrier** (piernas) | (talla − talla sentado) / talla sentado × 100 | **92,3** | piernas largas (≥90) |
| **Acromio-ilíaco** (hombros/cadera) | Ø biiliocrestal / Ø biacromial × 100 | **71,3** | tronco intermedio |

Sirve para orientar el entrenamiento y el deporte (un remero y un maratonista tienen proporciones distintas), no para diagnosticar salud.

⚠️ Los puntos de corte **cambian según la fuente** (para el índice córmico hay tablas con umbral en 51/53, otras en 52/54, algunas separadas por sexo). Nunca los escribas en el código.

### 3.8 Interpretación: rangos de referencia como datos

"Bajo / saludable / alto" no es una fórmula: es una tabla que depende de la fuente, el sexo, la edad y a veces el deporte.

```ts
interface ReferenceRange { indicator: string; sex?: Sex; minAge?: number; maxAge?: number;
                           min?: number; max?: number; label: string; source: string }
```

```sql
CREATE TABLE reference_range (
  indicator TEXT NOT NULL,        -- 'bmi' | 'fat_pct' | 'waist_cm' | 'cormic_index'
  sex       CHAR(1),
  min_value NUMERIC, max_value NUMERIC,
  label     TEXT NOT NULL,        -- 'bajo' | 'saludable' | 'alto'
  source    TEXT NOT NULL,        -- 'OMS 2008' | 'ACE' | 'ISAK'
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE
);
```

Ejemplos de tablas que se cargan como datos (no como código):

| Indicador | Fuente | Cortes |
|---|---|---|
| IMC | OMS | <18,5 bajo peso · 18,5–24,9 normal · 25–29,9 sobrepeso · ≥30 obesidad |
| Cintura | OMS 2008 | riesgo ≥94 cm (h) / ≥80 cm (m); riesgo alto ≥102 / ≥88 |
| % grasa | ACE | Hombres: 2–5 esencial, 6–13 atlético, 14–17 fitness, 18–24 promedio, ≥25 obesidad. Mujeres: 10–13, 14–20, 21–24, 25–31, ≥32 |

Con esto, Luis queda en "sobrepeso" por IMC y en "promedio" por % de grasa (20,3 %). La app muestra ambas cosas y el profesional decide: eso es precisamente lo que el folleto llama *"todos los resultados tienen interpretación"*.

### 3.9 Peso ideal a partir del % de grasa deseado

Se asume que la masa libre de grasa se mantiene y solo baja la grasa:

```
peso objetivo = masa libre de grasa / (1 − % grasa deseado / 100)
```

**Luis:** 63,79 / (1 − 0,15) = **75,05 kg** → tiene que perder **4,95 kg** para llegar a 15 % de grasa.

```ts
export const idealWeightForFatPct = (fatFreeMassKg: number, targetFatPct: number) =>
  fatFreeMassKg / (1 - targetFatPct / 100);
```

El supuesto "la masa magra no cambia" es optimista en un déficit; sirve para fijar la meta, no para prometer resultados. Este número es el que alimenta el "objetivo antropométrico y tiempo estimado" del folleto (§4.6).

---

## 4. Energía

### 4.1 De qué está hecho el gasto de un día

```
GET (gasto energético total)
 ├── TMR / TMB  (60–70 %)   lo que gastas respirando, latiendo, pensando
 ├── ETA        (~10 %)     energía para digerir lo que comes
 ├── NEAT                   movimiento no deportivo: caminar, gesticular, subir escaleras
 └── Ejercicio              lo que se planifica y se registra
```

Nadie mide esto en consulta: se **estima**. Dos estrategias, y conviene no mezclarlas:

- **Factorial:** `GET = TMR × factor de actividad` (el factor cubre todo lo demás, ETA incluida).
- **Aditiva:** `GET = TMR × factor de vida diaria + ejercicio calculado aparte`.

NutriPlace usa la segunda (tiene niveles sedentario/ligero/activo **y** cálculo de calorías por sesión con más de 300 actividades). Esa combinación es cómoda para el profesional y **peligrosa para el desarrollador**: si el factor ya incluía el gimnasio y además sumas la sesión, cuentas el ejercicio dos veces.

### 4.2 Tasa metabólica en reposo

Cuatro familias, todas válidas, todas distintas:

| Ecuación | Entrada | Fórmula (hombres) | Luis |
|---|---|---|---|
| **Mifflin-St Jeor** (1990) | peso, talla, edad | `10·kg + 6,25·cm − 5·edad + 5` (mujeres −161) | **1759 kcal** |
| **Harris-Benedict** (1919) | peso, talla, edad | `66,473 + 13,7516·kg + 5,0033·cm − 6,755·edad` | **1853 kcal** |
| **FAO/OMS/UNU** (Schofield) | peso y franja de edad | 18–30 h: `15,057·kg + 692,2` | **1897 kcal** |
| **Cunningham** (1980) | **masa libre de grasa** | `500 + 22 × MLG` | **1903 kcal** |
| **Katch-McArdle** | masa libre de grasa | `370 + 21,6 × MLG` | **1748 kcal** |

**155 kcal de diferencia entre la más baja y la más alta**, en la misma persona, el mismo día. Otra vez: guarda qué ecuación usaste.

Detalle de dominio interesante: Cunningham y Katch-McArdle necesitan la **masa libre de grasa**, o sea, dependen de la antropometría. Es el punto donde el módulo de medición se conecta con el de energía, y la razón por la que un software que mide pliegues puede ser más preciso que una calculadora web.

```ts
export const rmrMifflin = (sex: Sex, kg: number, cm: number, age: number) =>
  10 * kg + 6.25 * cm - 5 * age + (sex === 'M' ? 5 : -161);

export const rmrCunningham = (fatFreeMassKg: number) => 500 + 22 * fatFreeMassKg;
```

### 4.3 Factor de actividad (PAL)

El PAL es el multiplicador del día completo. FAO/OMS/UNU clasifica así:

| Estilo de vida | PAL |
|---|---|
| Sedentario o actividad ligera | 1,40 – 1,69 |
| Activo o moderadamente activo | 1,70 – 1,99 |
| Vigoroso | 2,00 – 2,40 |

Los tres niveles del folleto (*sedentario, ligero, activo*) son esta escala. Como NutriPlace suma el ejercicio aparte, el factor debe representar **solo la vida diaria**: para Luis, oficina y poco movimiento → 1,4.

```
Gasto sin ejercicio = 1759 × 1,4 = 2462 kcal
```

### 4.4 METs: el gasto del ejercicio

Un **MET** es el gasto en reposo: ≈ 3,5 ml de O₂ por kg y minuto ≈ **1 kcal por kg y por hora**. El *Compendium of Physical Activities* (edición 2024, 22 categorías) asigna un valor MET a cada actividad; es exactamente la base de datos de "+300 actividades" del folleto.

```
kcal = MET × peso_kg × horas
```

**Ejemplo del propio folleto — correr a 10 km/h.** El compendio da **9,3 MET** para correr a 6–6,3 mph (≈10 km/h):

```
Luis, 30 min:  9,3 × 80 × 0,5  = 372 kcal  (bruto)
```

⚠️ **Bruto vs neto.** Esas 372 kcal incluyen la energía que Luis habría gastado igual estando sentado. Si su TMR ya está contada en el GET, hay que restar 1 MET:

```
neto = (9,3 − 1) × 80 × 0,5 = 332 kcal
```

Para un plan de pérdida de grasa esa diferencia (40 kcal por sesión) no es trivial a fin de mes. Es una decisión de producto que debe quedar documentada y ser consistente.

```ts
export const activityKcal = (met: number, kg: number, minutes: number, net = false) =>
  (net ? met - 1 : met) * kg * (minutes / 60);
```

### 4.5 Gasto total y calorías objetivo

```
Ejercicio promedio diario = 332 × 3 sesiones / 7 días = 142 kcal
GET = 2462 + 142 = 2605 kcal/día
```

Para bajar grasa se aplica un **déficit**; para ganar músculo, un **superávit**. La regla clásica: **1 kg de grasa ≈ 7700 kcal**.

```
Meta del folleto: −3 kg de grasa/mes
3 × 7700 = 23 100 kcal/mes ÷ 30 = 770 kcal/día de déficit
Objetivo = 2605 − 770 = 1835 kcal/día
```

```ts
export const KCAL_PER_KG_FAT = 7700;

export function dailyTargetForFatLoss(tdeeKcal: number, kgFatPerMonth: number, daysPerMonth = 30) {
  const deficitKcal = (kgFatPerMonth * KCAL_PER_KG_FAT) / daysPerMonth;
  return { deficitKcal, targetKcal: tdeeKcal - deficitKcal };
}
```

**Dónde falla esta regla.** Es un modelo estático: supone que el cuerpo sigue gastando lo mismo mientras adelgaza, y no es así (menos peso = menos gasto, y el metabolismo se adapta). Hall et al. (*Lancet*, 2011) proponen una regla dinámica: un cambio sostenido de **100 kJ/día (≈24 kcal) lleva a ≈1 kg** de cambio de peso, pero **la mitad tarda ~1 año y el 95 % ~3 años**. Traducción para la app: la proyección lineal sirve para las primeras semanas; después hay que **recalcular con el peso nuevo**. Un plan que no se recalcula miente con precisión creciente.

**¿Y las metas del folleto son razonables?**

| Meta | Cálculo | Referencia |
|---|---|---|
| −3 kg de grasa/mes | 0,86 %/semana del peso de Luis | Helms et al. (2014) recomiendan 0,5–1 %/semana → está en el borde alto |
| +1 kg de músculo/mes | 0,23 kg/semana de músculo **puro** | Iraki et al. (2019) recomiendan subir 0,25–0,5 % del peso por semana (para Luis: 0,2–0,4 kg/semana ≈ 0,9–1,7 kg/mes de peso **total**, del que solo una parte es músculo) con superávit de 10–20 % → 1 kg de músculo al mes es optimista salvo en principiantes |

Conclusión de producto: son metas **configurables**, no constantes de código, y conviene mostrar el ritmo semanal resultante para que el profesional lo juzgue.

### 4.6 Objetivo antropométrico y tiempo estimado

Une §3.9 con el déficit:

```
Grasa por perder = peso actual − peso para el % objetivo = 80 − 75,05 = 4,95 kg
Tiempo = 4,95 / 3 kg por mes = 1,65 meses ≈ 7 semanas
```

En la app esto es una proyección con fecha estimada, y debe recalcularse en cada evaluación: es lo que hace que la pantalla de evolución tenga sentido.

---

## 5. Dieta

### 5.1 De calorías a gramos

Los macronutrientes aportan energía con factores fijos (Atwater):

```
carbohidratos 4 kcal/g · proteínas 4 kcal/g · grasas 9 kcal/g · alcohol 7 kcal/g
```

El reparto se hace en un orden que no es arbitrario:

1. **Proteína primero**, por kilo de peso (es el nutriente con función estructural). Rangos habituales: 1,4–2,0 g/kg en personas activas; 1,6–2,2 g/kg en fase de ganancia; hasta 2,3–3,1 g/kg de masa magra en déficits agresivos de competidores.
2. **Grasa después**, como porcentaje de las calorías (20–35 % es el rango aceptado) o por kg.
3. **Carbohidratos al final**: lo que sobra.

**Ejemplo (Luis, 1835 kcal, 2 g/kg de proteína, 25 % de grasa):**

```
Proteína = 2,0 × 80 = 160 g   → 640 kcal
Grasa    = 1835 × 0,25 / 9 = 51 g → 459 kcal
CHO      = (1835 − 640 − 459) / 4 = 184 g
```

```ts
export function macroTargets(kcal: number, kg: number, proteinGPerKg: number, fatPctKcal: number): Macros {
  const protein = proteinGPerKg * kg;
  const fat = (kcal * fatPctKcal) / 100 / 9;
  const cho = (kcal - protein * 4 - fat * 9) / 4;
  return { cho, protein, fat };
}
```

### 5.2 Las tres formas de prescribir una dieta

NutriPlace ofrece las tres, y son tres modelos de datos distintos:

| Método | Cómo funciona | Libertad del paciente | Qué necesita la app |
|---|---|---|---|
| **Por composición nutricional** | Se eligen alimentos y gramos exactos, y el software suma nutrientes desde una tabla de composición | Baja (lista cerrada) | Tabla de alimentos con nutrientes por 100 g |
| **Por intercambios** | Se calcula cuántas porciones de cada grupo, y el paciente elige dentro del grupo | Alta | Lista de intercambios + alimentos con su tamaño de porción |
| **Menú semanal** | Se arma comida por comida (con recetas) | Ninguna, pero es lo más concreto | Tabla de composición + recetario |

### 5.3 Tablas de composición de alimentos (TPCA)

Una tabla de composición dice, para cada alimento, cuánta energía y cuántos nutrientes hay **por 100 g de parte comestible**. La referencia oficial peruana es la **TPCA** (Tablas Peruanas de Composición de Alimentos), del CENAN–Instituto Nacional de Salud. Usar la tabla local no es un detalle: la quinua, la papa nativa o el pan de yema no están en las tablas estadounidenses, y ahí se juega buena parte del valor de un software hecho para Perú.

Modelo mínimo:

```sql
CREATE TABLE food (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,              -- 'TPCA 2017'
  source_code  TEXT,                       -- código del alimento en la tabla
  name         TEXT NOT NULL,
  group_code   TEXT NOT NULL,
  edible_pct   NUMERIC(5,2),               -- parte comestible (cáscaras, huesos)
  kcal_100g    NUMERIC(7,2) NOT NULL,
  protein_100g NUMERIC(7,2) NOT NULL,
  fat_100g     NUMERIC(7,2) NOT NULL,
  cho_100g     NUMERIC(7,2) NOT NULL,
  fiber_100g   NUMERIC(7,2),
  UNIQUE (source, source_code)
);
```

Dos detalles que muerden:

- **Parte comestible.** 200 g de plátano con cáscara no son 200 g de alimento. La tabla trae el factor.
- **Crudo vs cocido.** El arroz cambia de peso al cocinarse; si mezclas estados sin factor de conversión, los cálculos se van.

Cálculo de una receta = suma ponderada, nada más:

```ts
const recipeNutrients = (items: Array<{ food: Food; grams: number }>) =>
  items.reduce((acc, { food, grams }) => ({
    kcal:    acc.kcal    + (food.kcal_100g    * grams) / 100,
    protein: acc.protein + (food.protein_100g * grams) / 100,
    fat:     acc.fat     + (food.fat_100g     * grams) / 100,
    cho:     acc.cho     + (food.cho_100g     * grams) / 100,
  }), { kcal: 0, protein: 0, fat: 0, cho: 0 });
```

### 5.4 El sistema de intercambios

**La idea.** Agrupar alimentos que aportan aproximadamente los mismos macronutrientes por porción. Dentro de un grupo, todo es intercambiable: una porción de arroz ≈ una de papa ≈ una de pan. El paciente no cuenta calorías, cuenta porciones.

Dos listas conviven en NutriPlace:

- **ADA**: las listas estadounidenses clásicas (*Exchange Lists for Meal Planning*), muy usadas en enseñanza.
- **Dextre**: la **Lista de Intercambio de Alimentos peruanos** (Dextre et al., 2022): 273 alimentos en 7 grupos, construida sobre la TPCA 2017 y validada con 12 nutricionistas comparando planes hechos con tabla de composición vs. con la lista, sin diferencias significativas en energía ni macronutrientes.

Valores por intercambio (ejemplo con la estructura tipo ADA; los valores reales se cargan desde la lista oficial):

| Grupo | CHO (g) | Proteína (g) | Grasa (g) | kcal |
|---|---|---|---|---|
| Verduras | 5 | 2 | 0 | 25 |
| Frutas | 15 | 0 | 0 | 60 |
| Lácteos descremados | 12 | 8 | 0–3 | 90–120 |
| Cereales / almidones | 15 | 3 | 1 | 80 |
| Carnes magras | 0 | 7 | 2 | 45 |
| Grasas | 0 | 0 | 5 | 45 |

**El algoritmo clásico** (el que replica lo que un nutricionista hace a mano):

1. Fijar por criterio clínico verduras, frutas y lácteos.
2. Despejar **almidones** con el carbohidrato que falta.
3. Despejar **carnes** con la proteína que falta.
4. Despejar **grasas** con la grasa que falta.
5. Sumar todo y calcular el **% de adecuación** contra el objetivo.

```ts
export function computeExchanges(target: Macros, fixed: { VEG: number; FRU: number; MILK: number }, list = DEMO_EXCHANGE_LIST) {
  const g = Object.fromEntries(list.map(x => [x.code, x]));
  const plan = { ...fixed, STA: 0, MEAT: 0, FAT: 0 };
  const total = () => /* suma de plan[code] × g[code] por macro */;

  plan.STA  = Math.round((target.cho     - total().cho)     / g.STA.cho);
  plan.MEAT = Math.round((target.protein - total().protein) / g.MEAT.protein);
  plan.FAT  = Math.round((target.fat     - total().fat)     / g.FAT.fat);
  return { plan, totals: total(), adequacy: /* consumido/objetivo × 100 */ };
}
```

**Ejemplo (Luis: 184 g CHO, 160 g proteína, 51 g grasa), fijando 4 verduras, 3 frutas y 3 lácteos:**

```
Verduras 4 · Frutas 3 · Lácteos 3 · Almidones 6 · Carnes magras 16 · Grasas 3
Totales: CHO 191 g · Proteína 162 g · Grasa 53 g = 1889 kcal
Adecuación: 103,0 % kcal · 103,8 % CHO · 101,3 % proteína · 104,0 % grasa
```

Tres cosas que enseña este resultado:

1. **El redondeo importa.** Los intercambios son enteros: nadie come 6,33 panes. El plan siempre queda un poco por encima o por debajo; por eso el % de adecuación es parte del cálculo, no un adorno.
2. **Los números no tienen sentido común.** 16 intercambios de carne magra son casi medio kilo de carne al día. El algoritmo reparte aritmética; el profesional reparte esa proteína entre carnes, huevos y lácteos. La app debe permitir ajustar a mano y recalcular la adecuación.
3. **Las listas son datos, no código.** ADA y Dextre tienen grupos y valores distintos. Se modelan como tablas versionadas:

```sql
CREATE TABLE exchange_list  (id BIGSERIAL PRIMARY KEY, code TEXT, name TEXT, source TEXT, version TEXT);
CREATE TABLE exchange_group (id BIGSERIAL PRIMARY KEY, list_id BIGINT REFERENCES exchange_list(id),
                             code TEXT, name TEXT, cho NUMERIC, protein NUMERIC, fat NUMERIC, kcal NUMERIC);
CREATE TABLE exchange_food  (group_id BIGINT REFERENCES exchange_group(id), food_id BIGINT REFERENCES food(id),
                             portion_grams NUMERIC, household_measure TEXT);  -- "1 taza", "1 unidad mediana"
```

### 5.5 Repartir por tiempos de comida

Esto es la "dieta por intercambios **por tiempos**" de NutriPlace: cada grupo se distribuye entre desayuno, media mañana, almuerzo, media tarde y cena.

```ts
/** Reparte N intercambios por porcentajes y ajusta el redondeo por "mayor residuo" para que la suma no cambie. */
export function distributeByMeals(total: number, sharesPct: Record<string, number>) { /* … */ }
```

```
6 almidones (25/10/35/10/20 %) → Desayuno 1 · Media mañana 1 · Almuerzo 2 · Media tarde 1 · Cena 1
16 carnes                      → Desayuno 4 · Media mañana 2 · Almuerzo 5 · Media tarde 2 · Cena 3
```

Usar `Math.round` en cada tiempo haría que la suma no cuadre (5 o 7 en vez de 6). El método del mayor residuo reparte los enteros y asigna los sobrantes a los tiempos con mayor fracción pendiente. Es el mismo problema que repartir escaños; aquí evita que el plan "pierda" comida.

Con esto ya se puede construir la pantalla del paciente: **tiempo de comida → grupo → lista de alimentos permitidos con su porción**. Y es la razón por la que en la Web App el paciente solo ve los alimentos que el profesional eligió: el registro está acotado al plan.

```
Desayuno
 ├── Almidones  ×1  → pan integral 1 rebanada | avena 3 cdas | papa 1 unidad chica
 ├── Carnes     ×4  → huevo 1 unidad | pollo 30 g | atún 30 g
 └── Frutas     ×1  → plátano ½ | manzana 1 chica
```

### 5.6 Porcentaje de adecuación

```
% adecuación = consumido / prescrito × 100
```

Los puntos de corte cambian según la fuente: 90–110 % en muchas guías clínicas, 85–115 % en estudios poblacionales. Otra tabla de referencia configurable.

**Ejemplo con la semana de Luis (objetivo 1835 kcal):**

```
1790, 1950, 1600, 2100, 1830, 2400, 1700 kcal
Promedio 1910 kcal → adecuación 104,1 %
Días dentro de 90–110 %: 4 de 7
```

Dos métricas distintas y complementarias: el **promedio** dice si el plan se cumple en balance; el **conteo de días en rango** dice si se cumple con consistencia. El primero puede verse perfecto compensando un día de 1600 con otro de 2400. Un buen gráfico de seguimiento muestra ambos: es justo lo que hace la pantalla de NutriPlace con la línea verde del objetivo y la línea azul del consumo real.

### 5.7 Hidratación

El "plan de hidratación" es una meta diaria de líquido que el paciente marca en la app. Valores de referencia para agua total (bebidas + alimentos):

| Fuente | Hombres | Mujeres |
|---|---|---|
| EFSA (2010) | 2,5 L/día | 2,0 L/día |
| IOM / National Academies (EE. UU.) | 3,7 L/día | 2,7 L/día |

Se ajusta por peso, clima y sudoración del entrenamiento. Como son valores de referencia poblacionales, **el objetivo que fija el profesional manda**; la app solo compara registro vs. meta y calcula adherencia, igual que con las calorías.

---

## 6. Entrenamiento

NutriPlace no es solo nutrición: diseña rutinas de gimnasio y calcula estadísticas por ejercicio (cargas, tonelaje, estímulo, fatiga, RM). Ese módulo tiene su propio cuerpo de conocimiento.

### 6.1 Estructura de una rutina

```
Mesociclo (4–6 semanas, un objetivo)
 └── Microciclo (1 semana)
      └── Sesión (día de entrenamiento)
           └── Ejercicio  (sentadilla, press banca…)
                └── Serie (peso × repeticiones, con RIR y descanso)
```

Y en paralelo, la anatomía: cada ejercicio trabaja **grupos musculares** con un rol (principal o secundario). Esa relación es lo que permite responder "¿cuánto entrenó el pecho esta semana?".

```sql
CREATE TABLE exercise        (id BIGSERIAL PRIMARY KEY, name TEXT, equipment TEXT);
CREATE TABLE muscle_group    (code TEXT PRIMARY KEY, name TEXT);
CREATE TABLE exercise_muscle (exercise_id BIGINT, muscle_code TEXT,
                              role TEXT CHECK (role IN ('primary','secondary')));

CREATE TABLE prescribed_set  (session_id BIGINT, exercise_id BIGINT, set_no SMALLINT,
                              target_reps INT, target_load_kg NUMERIC, target_rir SMALLINT);
CREATE TABLE logged_set      (session_id BIGINT, exercise_id BIGINT, set_no SMALLINT,
                              reps INT, load_kg NUMERIC, rir SMALLINT, logged_at TIMESTAMPTZ);
```

Prescripción y registro son **tablas distintas**. Comparar una con otra es el cumplimiento; mezclarlas hace imposible saber qué se planificó.

### 6.2 Volumen: las dos formas de contarlo

**Tonelaje (volume load)** = kilos totales movidos.

```
tonelaje = Σ (peso × repeticiones)
```

Sesión de Luis: 3 series de sentadilla (100×8, 100×8, 100×7) + 2 de press banca (70×10, 70×9) = **3630 kg**.

Es intuitivo y motivador, pero mezcla peras con manzanas: 100 kg en sentadilla y 100 kg en press no significan lo mismo.

**Series semanales por grupo muscular** es la métrica que usa la literatura de hipertrofia. Schoenfeld et al. (2017) encontraron una relación dosis-respuesta: <5 series/semana → 5,4 % de ganancia; 5–9 → 6,6 %; 10 o más → 9,8 %; cada serie extra aportó ~0,37 %.

El detalle fino: ¿el press banca cuenta como serie de tríceps? Los meta-análisis recientes (2025) muestran que lo que mejor predice la adaptación es el **conteo fraccional**: serie directa = 1, indirecta = 0,5.

```ts
export function weeklySetsByMuscle(sets: SetLog[], map: MuscleMap) {
  const out: Record<string, number> = {};
  for (const s of sets)
    for (const m of map[s.exercise] ?? [])
      out[m.muscle] = (out[m.muscle] ?? 0) + (m.role === 'primary' ? 1 : 0.5);
  return out;
}
```

Con la sesión de ejemplo:

```
Cuádriceps 3 · Glúteo 3 · Isquiosurales 1,5 · Pectoral 2 · Tríceps 1 · Deltoides anterior 1
```

Ese objeto, agregado por semana y comparado con lo programado, **es** el "análisis semanal de rutina" de NutriPlace: qué grupos musculares recibieron el volumen previsto y cuáles se quedaron cortos.

### 6.3 Intensidad: 1RM estimado

El **1RM** es el peso máximo para una repetición. Medirlo de verdad es arriesgado y cansa, así que se estima desde una serie submáxima:

| Fórmula | Ecuación | Luis (100 kg × 8) |
|---|---|---|
| **Epley** (1985) | `peso × (1 + reps/30)` | **126,7 kg** |
| **Brzycki** (1993) | `peso × 36 / (37 − reps)` | **124,1 kg** |

Coinciden en 10 repeticiones y divergen fuera de ahí; el error frente a un test real puede pasar del 10 %, y crece con las repeticiones (por encima de 10–12 son poco fiables).

```ts
export const oneRmEpley   = (loadKg: number, reps: number) => reps <= 1 ? loadKg : loadKg * (1 + reps / 30);
export const oneRmBrzycki = (loadKg: number, reps: number) => loadKg * (36 / (37 - reps));
```

**En la app:** el 1RM estimado es la serie temporal más motivadora del módulo ("cómo le va en su RM en el tiempo", dice el tutorial). Dos reglas: usar **siempre la misma fórmula** para un paciente, y marcar el valor como estimado. Si un día cambias de Epley a Brzycki, el gráfico muestra una caída que nadie vivió.

Con el 1RM se prescribe por porcentaje (`3×5 al 80 %`), que es la otra forma de programar además de repeticiones fijas.

### 6.4 Esfuerzo: RIR y RPE

- **RIR** (*repeticiones en reserva*): cuántas repeticiones más habrían salido. 0 RIR = fallo muscular.
- **RPE** en su versión para fuerza (Zourdos et al., 2016): `RPE ≈ 10 − RIR`. Una serie con 2 repeticiones en reserva es RPE 8.

Es la forma práctica de autorregular: el peso del día se ajusta a cómo viene el paciente, y el dato queda registrado como percepción, no como medición objetiva.

### 6.5 Estímulo y fatiga

Las pantallas de NutriPlace muestran análisis "por estímulo" y "por fatiga". Detrás está el concepto **Stimulus-to-Fatigue Ratio** (SFR), popularizado por Mike Israetel (Renaissance Periodization): un ejercicio es bueno si da mucho estímulo (tensión en el músculo objetivo, bombeo, algo de daño) con poca fatiga (articulaciones, sistema nervioso, tiempo de recuperación).

Importante para el desarrollador: **no es una métrica validada con una fórmula estándar**, es una heurística de entrenadores. Se implementa como valoraciones subjetivas del paciente tras la serie o la sesión (escalas de 1 a 5, por ejemplo), agregadas por ejercicio:

```ts
interface SetFeedback { stimulus: 1|2|3|4|5; fatigue: 1|2|3|4|5 }
const sfr = (f: SetFeedback[]) =>
  avg(f.map(x => x.stimulus)) / avg(f.map(x => x.fatigue));   // > 1 ≈ buen intercambio
```

Como cualquier dato subjetivo: guardar la escala usada y no presentarlo con dos decimales de falsa precisión.

### 6.6 Periodización

- **Microciclo:** la semana.
- **Mesociclo:** 4–6 semanas con un énfasis (acumulación de volumen, intensificación) y normalmente una semana de descarga al final.
- **Macrociclo:** la temporada completa.

Para la app significa que las estadísticas se agrupan **por mesociclo**, no por rango de fechas arbitrario: comparar la semana 1 de acumulación con la semana de descarga sin marcar el contexto produce gráficos que parecen retrocesos.

### 6.7 Cardio y cumplimiento

El cardio se programa en minutos e intensidad y se convierte a calorías con METs (§4.4). Las guías de la OMS (2020) fijan 150–300 min/semana de actividad moderada o 75–150 de vigorosa, más 2 días de fuerza: sirve como línea base de referencia.

El cumplimiento es una división y un umbral:

```ts
export const compliancePct = (done: number, planned: number) => planned === 0 ? 0 : (done / planned) * 100;
// 12 de 16 series de pecho → 75 %
```

El mismo patrón se aplica a sesiones asistidas, series completadas y minutos de cardio. Con eso se arma el "% de cumplimiento" que ve el entrenador.

---

## 7. Seguimiento

Aquí es donde la Web App del paciente cierra el círculo: lo que él registra alimenta las métricas que ve el profesional.

### 7.1 Qué registra el paciente

| Registro | Datos | Métrica que habilita |
|---|---|---|
| Comidas | tiempo de comida, grupo, alimento elegido, porciones | kcal y macros del día, % de adecuación |
| Agua | vasos o mililitros | cumplimiento del plan de hidratación |
| Entrenamiento | series, repeticiones, peso, RIR | tonelaje, series por grupo, 1RM estimado |
| Notas | texto libre | contexto clínico (el tutorial insiste en leerlas) |
| Peso / medidas | según lo permita el profesional | evolución antropométrica |

Como el registro está acotado a los alimentos que el profesional eligió, cada comida registrada es un **identificador de intercambio**, no texto libre. Eso hace el cálculo trivial y exacto:

```ts
const dayTotals = (entries: Array<{ exchangeGroupId: number; count: number }>, groups: Map<number, ExchangeGroup>) =>
  entries.reduce((acc, e) => {
    const g = groups.get(e.exchangeGroupId)!;
    return { cho: acc.cho + g.cho * e.count, protein: acc.protein + g.protein * e.count, fat: acc.fat + g.fat * e.count };
  }, { cho: 0, protein: 0, fat: 0 });
```

Es la diferencia con apps tipo MyFitnessPal: allí el usuario busca en una base gigante y el error de porción es enorme; aquí el universo es el plan.

### 7.2 Las tres agregaciones que hay que tener

1. **Día:** total consumido vs. objetivo → diferencia y % de adecuación.
2. **Semana:** promedio, días en rango, y la serie para el gráfico (línea de objetivo vs. línea de consumo, que es literalmente lo que muestra NutriPlace).
3. **Mes o mesociclo:** tendencia y relación con los cambios antropométricos.

```sql
-- Vista materializada por día; se refresca al registrar
CREATE MATERIALIZED VIEW daily_intake AS
SELECT patient_id, log_date,
       SUM(cho) AS cho, SUM(protein) AS protein, SUM(fat) AS fat,
       SUM(cho)*4 + SUM(protein)*4 + SUM(fat)*9 AS kcal
FROM food_log_expanded GROUP BY patient_id, log_date;
```

Regla de diseño: **el objetivo del día se guarda con el día**. Si el plan cambia el 15 del mes, los días previos deben seguir comparándose contra el objetivo que estaba vigente, no contra el nuevo. Sin eso, el historial se reescribe solo.

### 7.3 Evolución antropométrica

El gráfico de evolución compara evaluaciones sucesivas. Tres cuidados que separan un gráfico útil de uno engañoso:

1. **Mismo método.** No graficar en la misma serie un % de grasa de Durnin & Womersley y otro de Yuhasz (§3.4).
2. **Mismo evaluador, misma hora, mismas condiciones.** La hidratación y el momento del día mueven pliegues y perímetros.
3. **Cambio real vs. ruido.** Aplicar el cambio mínimo detectable (§2.4): si el delta es menor que el CMD, se rotula "sin cambio significativo".

```ts
function evolution(prev: Result, curr: Result, tem: number) {
  if (prev.methodCode !== curr.methodCode) return { comparable: false };
  const delta = curr.value - prev.value;
  return { comparable: true, delta, significant: Math.abs(delta) > minimalDetectableChange95(tem) };
}
```

### 7.4 Progreso vs. previsión

La app prometió "−3 kg de grasa al mes, 7 semanas para llegar a 15 %". El seguimiento contrasta previsión y realidad, y esa comparación es la conversación de la consulta:

| Señal | Lectura probable |
|---|---|
| Adherencia alta + peso estancado | El GET estaba sobreestimado, o el registro subestima lo que come |
| Adherencia baja + peso bajando | Suerte o mal registro; revisar |
| Peso bajando + masa muscular bajando | Déficit demasiado agresivo o proteína insuficiente |
| Peso estable + grasa baja y músculo sube | Recomposición: el peso solo no sirve para juzgar |

Esa última fila es el argumento central del producto: **sin composición corporal, la balanza miente**.

### 7.5 El modo solo lectura

El profesional ve los registros del paciente sin poder editarlos ("me encuentro en modo lectura, no puedo alterar nada"). Es una decisión correcta y vale la pena entender por qué: el registro es **evidencia clínica**. Si el profesional pudiera corregirlo, se perdería la trazabilidad de lo que el paciente declaró.

Si hiciera falta corregir un registro, lo correcto es un ajuste con autoría y motivo, no una sobreescritura:

```sql
CREATE TABLE food_log_adjustment (
  log_id     BIGINT REFERENCES food_log(id),
  adjusted_by BIGINT REFERENCES professional(id),
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. Arquitectura

### 8.1 Modelo de dominio

```
Cuenta (empresa)
 └── Profesional (permisos, marca propia)
      └── Paciente  (historia clínica independiente)
           ├── Evaluación ──┬── IntentoDeMedición (sitio, intento, valor, unidad)
           │                └── ResultadoCalculado (método, versión, valor, insumos)
           ├── PlanEnergético (TMR usada, PAL, ejercicio, GET, objetivo kcal)
           ├── PlanDietético ─┬── por intercambios → grupos × tiempos de comida
           │                  └── por composición / menú → recetas → alimentos (TPCA)
           ├── Rutina ──── Mesociclo → Sesión → SeriePrescrita
           ├── AccesoWebApp (credenciales, servicios activos, complementos, mensajes, color)
           └── Registros ─┬── comida · agua · nota
                          └── serie ejecutada
```

```sql
CREATE TABLE calculated_result (
  id             BIGSERIAL PRIMARY KEY,
  evaluation_id  BIGINT NOT NULL REFERENCES evaluation(id),
  indicator      TEXT   NOT NULL,        -- 'fat_pct' | 'muscle_kg' | 'rmr_kcal'
  value          NUMERIC(10,4) NOT NULL,
  method_code    TEXT   NOT NULL,        -- 'DW1974+SIRI'
  method_version TEXT   NOT NULL,        -- '1.0.0'
  inputs         JSONB  NOT NULL,        -- copia de las medidas usadas
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, indicator, method_code)
);
```

`inputs` en JSONB no es redundancia: es lo que permite reproducir el número dentro de dos años aunque el motor haya cambiado.

### 8.2 El motor de cálculo

Todo lo de esta guía cabe en un paquete sin dependencias, con funciones puras. Recomendaciones:

1. **Funciones puras, sin acceso a base de datos.** Entra un objeto, sale un número. Así se puede testear con los ejemplos publicados.
2. **Registro de métodos (patrón estrategia)** con metadatos: código, versión, población, sitios requeridos, cita bibliográfica.
3. **Unidades en el nombre del parámetro** (`heightM`, `waistCm`, `tricepsMm`) o tipos *branded*. La mitad de los bugs de este dominio son metros vs. centímetros.

```ts
type Millimeters = number & { readonly __unit: 'mm' };
type Centimeters = number & { readonly __unit: 'cm' };
const mm = (n: number) => n as Millimeters;
```

4. **Validación fisiológica antes de calcular**: pliegue 0–80 mm, talla 100–230 cm, peso 20–300 kg. Un 220 tecleado en lugar de 22 pasa sin chistar por cualquier ecuación.
5. **Sin recálculo silencioso.** Si el profesional cambia la ecuación por defecto, los planes ya entregados no se tocan: se genera una versión nueva.

### 8.3 Selección de método por población

El consenso de cineantropometría recomienda distintas ecuaciones según el paciente. Eso es una tabla, y conviene que el profesional pueda verla y cambiarla:

| Población | % grasa sugerido | Masa muscular | Masa ósea |
|---|---|---|---|
| Adultos sanos | Durnin & Womersley + Siri | Lee o por diferencia | Rocha |
| Deportistas | Withers o Carter-Yuhasz | Kerr (5 componentes) | Rocha |
| Niños y adolescentes | Slaughter | — | — |
| Obesidad | ecuaciones con perímetros | — | — |

### 8.4 Pruebas

Dos capas:

- **Casos dorados:** valores publicados en los artículos → resultado esperado. Cualquier refactor que mueva un decimal se detecta.
- **Propiedades:** más pliegues ⇒ más grasa; la suma de los 5 componentes ≈ peso ±5 %; subir la proteína del objetivo nunca baja los intercambios de carne.

```ts
test('Durnin & Womersley + Siri, hombre 28 años, Σ4 = 56 mm', () => {
  const d = densityDurninWomersley('M', 28, { tricepsMm: 12, bicepsMm: 6, subscapularMm: 16, iliacCrestMm: 22 });
  expect(fatPercentSiri(d)).toBeCloseTo(20.26, 2);
});
```

### 8.5 Entrega: fichas PDF y Web App

- Las **fichas** (dieta por intercambios, menú semanal, resultados antropométricos, evolución, rutina) se renderizan desde el *snapshot*, no desde un recálculo al vuelo. Un PDF entregado en marzo debe seguir mostrando lo mismo en agosto.
- La **Web App del paciente** es un *read model*: recibe el plan ya resuelto (tiempos → grupos → alimentos permitidos) y solo escribe registros. No necesita el motor de cálculo.
- La **marca** (logo, colores, avatar) es configuración por cuenta y por profesional, y entra tanto en el PDF como en el tema de la app.

### 8.6 Privacidad

Todo esto son **datos de salud**. En Perú la Ley 29733 de Protección de Datos Personales los trata como datos sensibles, lo que en la práctica implica:

- Consentimiento informado explícito y finalidad declarada.
- Acceso por rol y aislamiento entre profesionales de una misma cuenta (la opción "pacientes independientes" del producto es justamente eso).
- Cifrado en tránsito y en reposo, y auditoría de accesos.
- Credenciales del paciente que el profesional no debería conocer: lo correcto es invitación por enlace de un solo uso y contraseña que fije el propio paciente, en vez de generarla y compartirla por WhatsApp.
- Derecho de acceso y portabilidad: exportar los datos de un paciente debe ser una función, no un pedido a soporte.

### 8.7 Errores típicos en este dominio

| Error | Consecuencia |
|---|---|
| Mezclar mm, cm y m | Resultados absurdos sin excepción lanzada |
| Guardar el resultado sin el método | Series históricas incomparables |
| Recalcular planes ya entregados | El paciente ve otro número que en su PDF |
| Extrapolar una ecuación fuera de su población o rango de edad | Diagnóstico inválido con apariencia de precisión |
| Redondear cada tiempo de comida por separado | El plan no suma los intercambios prescritos |
| Sumar el ejercicio y usar un PAL que ya lo incluía | Doble conteo: cientos de kcal de más |
| Comparar tejido adiposo (Kerr) con % de grasa (2 componentes) | "La grasa subió" cuando solo cambió el modelo |
| Tratar los puntos de corte como constantes | Imposible adaptarlos a otra guía o país |

---

## 9. Mapa NutriPlace ↔ concepto ↔ cálculo

| Pantalla o función | Concepto | Cálculo detrás | Sección |
|---|---|---|---|
| Elegir nivel de evaluación (básico / ISAK 1 / ISAK 2) | Protocolos de medición ISAK | Determina qué ecuaciones están disponibles | §2.2 |
| Mediciones antropométricas | Pliegues, perímetros, diámetros, longitudes | Consolidación de tomas, ETM | §2.3–2.4 |
| Resultados de 2 componentes | Grasa + masa magra | Durnin & Womersley → Siri | §3.2 |
| Resultados de 4 componentes | Grasa, músculo, hueso, piel/residual | Rocha, Würch, diferencia, Lee | §3.5 |
| Resultados de 5 componentes | Piel, adiposo, muscular, óseo, residual | Kerr & Ross con Phantom | §3.6 |
| Extremidades, tronco, hombros/cadera | Proporcionalidad | Córmico, Manouvrier, acromio-ilíaco | §3.7 |
| Interpretación bajo / saludable / alto | Rangos de referencia | Tabla configurable por fuente y sexo | §3.8 |
| Peso ideal según % de grasa deseado | Meta antropométrica | MLG / (1 − % objetivo) | §3.9 |
| Tasa metabólica, gasto total, balance | Gasto energético | Mifflin, Harris-Benedict, FAO/OMS, Cunningham | §4.2 |
| Sedentario / ligero / activo | Nivel de actividad física (PAL) | FAO/OMS/UNU 1,40–2,40 | §4.3 |
| Calorías quemadas por sesión, +300 actividades | METs | MET × kg × horas (bruto o neto) | §4.4 |
| Calorías automatizadas según objetivo | Déficit o superávit energético | 7700 kcal/kg; revisar con modelo dinámico | §4.5 |
| Objetivo y tiempo estimado | Proyección | kg por perder ÷ ritmo mensual | §4.6 |
| Dieta por intercambios por tiempos | Sistema de equivalentes (ADA / Dextre) | Despeje por grupos + reparto por comidas | §5.4–5.5 |
| Dieta por composición nutricional | Cálculo alimento a alimento | Tabla de composición por 100 g | §5.3 |
| Menú semanal TPCA + recetario | Composición de recetas | Suma ponderada de ingredientes | §5.3 |
| Plan de hidratación | Requerimiento de agua | Meta vs. registro | §5.7 |
| Registro del paciente y % de adecuación | Adherencia | consumido / prescrito × 100 | §5.6 |
| Línea verde vs. línea azul | Tendencia de cumplimiento | Serie diaria vs. objetivo del día | §7.2 |
| Análisis semanal de rutina | Volumen por grupo muscular | Series fraccionadas (1 y 0,5) | §6.2 |
| Estadística de ejercicio: cargas, tonelaje, RM | Volumen e intensidad | Tonelaje y 1RM estimado | §6.2–6.3 |
| Estadística por estímulo y fatiga | SFR | Valoraciones subjetivas agregadas | §6.5 |
| Evolución antropométrica | Cambio real vs. ruido | Delta vs. cambio mínimo detectable | §7.3 |
| Seguimiento en solo lectura | Integridad del registro clínico | Sin edición; ajustes con autoría | §7.5 |

---

## Lo que no se puede deducir desde fuera

Preguntas para hacerle a NutriPlace en una demo, ahora con vocabulario del dominio:

1. ¿Qué ecuación de TMR usa por defecto y se puede cambiar por paciente?
2. ¿Qué fórmula de % de grasa aparece en la ficha y se imprime junto al resultado?
3. Los niveles sedentario / ligero / activo, ¿con qué valores de PAL están implementados y **ya incluyen** el ejercicio que se calcula aparte?
4. El gasto por actividad, ¿es bruto o neto?
5. ¿Ofrece somatotipo (Heath-Carter)? Es estándar en ISAK y no aparece en el folleto.
6. En el modelo de 4 componentes, ¿"piel" sustituye a la masa residual del modelo clásico de De Rose y Guimarães, o es una variante propia?
7. ¿La dieta por composición nutricional calcula micronutrientes (hierro, calcio, vitaminas) o solo energía y macros?
8. ¿Qué versión de la TPCA y de las listas de intercambio tiene cargadas, y cómo se actualizan?
9. ¿Se puede exportar la información de un paciente (portabilidad de datos)?
10. ¿Cómo se maneja el consentimiento y el acceso a datos de salud entre profesionales de una misma cuenta?

---

## 10. Fuentes

**Medición y composición corporal**

- Alvero Cruz, J. R. et al. *Protocolo de valoración de la composición corporal. Documento de consenso del GREC-FEMEDE* (2009) — Durnin & Womersley, Jackson & Pollock, Withers, Faulkner, Carter, Siri, Rocha, Lee. <https://femede.es/documentos/ConsensoCine131.pdf>
- Instituto de Investigación Nutricional (Perú), programas de certificación ISAK nivel 1 (21 medidas) y nivel 2 (43 medidas). <https://www.iin.sld.pe/wp-content/uploads/2024/12/CERTIFICACION-ISAK-L1-Tecnico-%E2%80%93-Perfil-restringido.pdf> · <https://www.iin.sld.pe/wp-content/uploads/2024/12/CERTIFICACION-ISAK-L2-Tecnico-%E2%80%93-Perfil-completo-.pdf>
- Protocolo de repetición de medidas y perfil restringido: <https://paulstokes.com.au/isak-restricted-profile/>
- Jackson & Pollock, ecuaciones por número de pliegues: <https://www.topendsports.com/testing/density-jackson-pollock.htm>
- Yuhasz (hombres y mujeres): <https://nutriactiva.com/blogs/body-fat/formulas-for-calculating-body-fat>
- Ross, W. D. y Kerr, D. A. *Fraccionamiento de la masa corporal: un nuevo método* — método de 5 componentes y validación con cadáveres. <https://g-se.com/es/fraccionamiento-de-la-masa-corporal-un-nuevo-metodo-para-utilizar-en-nutricion-clinica-y-medicina-deportiva-261-sa-q57cfb27120415>
- Constantes Phantom del protocolo de Kerr: <https://pfmnavarro.blogspot.com/2010/04/antropometria-protocolo-de-la-dr.html>
- Modelo de 4 componentes (De Rose y Guimarães; Rocha; Würch; Matiegka): <https://www.efdeportes.com/efd161/caracterizacion-antropometrica-en-estudiantes.htm> · <https://s205bff5513059557.jimcontent.com/download/version/1463521931/module/8932978668/name/F%C3%B3rmulas%20para%20Predi%C3%A7%C3%A3o%20da%20Composi%C3%A7%C3%A3o%20Corporal.pdf>
- Índices de proporcionalidad: <https://archivosdemedicinadeldeporte.com/articulos/upload/MEDEP_0522005_Proporcionalidad_Rugby.pdf> · <https://antropometriabiomedica.wordpress.com/calculos-de-proporcionalidad/>
- Selección de ecuaciones por población: *Protocolo de valoración de la composición corporal* (Cuba). <https://revmedep.sld.cu/index.php/medep/article/download/331/347>
- Cintura y perímetros, cortes de riesgo (OMS 2008): <https://www.physio-pedia.com/Waist_Measurement>

**Energía**

- FAO/OMS/UNU, *Human energy requirements* — ecuaciones de Schofield y categorías de PAL. <https://www.fao.org/4/y5686e/y5686e07.htm>
- Harris-Benedict, coeficientes originales: <https://pacompendium.com/corrected-mets/>
- Compendium of Physical Activities 2024 — valores MET (correr 6–6,3 mph = 9,3 MET). <https://pacompendium.com/running/> · <https://pacompendium.com/adult-compendium/>
- Hall, K. et al. *Quantification of the effect of energy imbalance on bodyweight*, Lancet 2011 — límites de la regla de las 7700 kcal. <https://stacks.cdc.gov/view/cdc/33652/cdc_33652_DS1.pdf>
- Helms, E. et al. (2014) — ritmo de pérdida de 0,5–1 %/semana y proteína en déficit. <https://link.springer.com/article/10.1186/1550-2783-11-20>
- Iraki, J. et al. (2019) — superávit de 10–20 % y ganancia de 0,25–0,5 %/semana. <https://www.mdpi.com/2075-4663/7/7/154>

**Dieta**

- Tablas Peruanas de Composición de Alimentos (INS-CENAN). <https://web.ins.gob.pe/es/node/1434>
- Dextre, M. L. et al. *Diseño y validación de una lista de intercambio de alimentos peruanos*, Nutr Clín Diet Hosp 42(2), 2022 — 273 alimentos, 7 grupos, base TPCA 2017. <https://revistaold.nutricion.org/index.php/ncdh/article/view/237>
- Listas de intercambio tipo ADA: <https://mtsu.pressbooks.pub/nutrition/back-matter/appendix-b-the-exchange-lists-for-meal-planning/>
- Criterios de % de adecuación: <https://ve.scielo.org/scielo.php?script=sci_arttext&pid=S0798-07522014000200003>
- Agua, valores de referencia EFSA e IOM: <https://www.efsa.europa.eu/en/press/news/nda100326> · <https://www.gssiweb.org/sports-science-exchange/article/hydration-for-health-and-wellness>

**Entrenamiento**

- Schoenfeld, B. et al. (2017), dosis-respuesta del volumen semanal. <https://www.ageingmuscle.be/sites/bams/files/publications/Dose%20response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases.pdf>
- Meta-regresión de volumen y frecuencia con conteo fraccional de series (2025). <https://sportrxiv.org/index.php/server/preprint/view/460>
- Fórmulas de 1RM (Epley, Brzycki) y su margen de error: <https://en.wikipedia.org/wiki/One-repetition_maximum>
- Escala RPE basada en RIR, Zourdos et al. (2016). <https://journals.lww.com/nsca-scj/fulltext/2016/08000/application_of_the_repetitions_in_reserve_based.10.aspx>
- Stimulus-to-Fatigue Ratio, origen y estatus de heurística: <https://outlift.com/stimulus-to-fatigue-ratio-sfr/>

**Producto**

- NutriPlace — WebApp (tutorial): <https://www.youtube.com/watch?v=CF_Ku8t_PjE>
- NutriPlace — Personaliza tu plataforma (tutorial): <https://www.youtube.com/watch?v=SwsmCjbPwCM>
- Folleto "Info Software – NutriPlace" (características, fichas, perfiles de medición).

---

*Los ejemplos numéricos de esta guía se generaron ejecutando el código incluido sobre el mismo paciente ficticio. Antes de usar cualquier fórmula en producción, verifica sus coeficientes en la fuente original y valida los resultados con un profesional de nutrición o del deporte.*

---

## Apéndice: motor de cálculo completo

Archivo `engine.ts` con todas las funciones usadas en la guía. Se ejecuta con `tsx examples.ts` (o `npx tsx`) y reproduce cada número de los ejemplos.

```ts
// Motor de cálculo de ejemplo para la guía "Conocimiento de dominio NutriPlace".
// Funciones puras, unidades explícitas en los nombres. No usar en producción sin validar
// cada coeficiente contra la fuente original.

export type Sex = 'M' | 'F';

// ─────────────────────────────────────────────────────────────
// 1. Calidad del dato antropométrico
// ─────────────────────────────────────────────────────────────

/** Protocolo ISAK: 2 tomas; si la 2.ª difiere >5 % (pliegues) o >1 % (resto) de la 1.ª, se toma una 3.ª.
 *  Con 2 tomas válidas → media; con 3 → mediana. */
export function consolidateMeasurement(attempts: number[], kind: 'skinfold' | 'other') {
  const tolerancePct = kind === 'skinfold' ? 5 : 1;
  if (attempts.length < 2) throw new Error('Se requieren al menos 2 tomas');
  const [a, b] = attempts;
  const diffPct = (Math.abs(b - a) / a) * 100;
  if (attempts.length === 2) {
    if (diffPct > tolerancePct) return { value: null, needsThird: true, diffPct };
    return { value: (a + b) / 2, needsThird: false, diffPct };
  }
  const sorted = [...attempts].slice(0, 3).sort((x, y) => x - y);
  return { value: sorted[1], needsThird: false, diffPct };
}

/** Error técnico de medida (ETM) con pares de mediciones repetidas. */
export function technicalErrorOfMeasurement(pairs: Array<[number, number]>) {
  const n = pairs.length;
  const sumD2 = pairs.reduce((s, [a, b]) => s + (a - b) ** 2, 0);
  const tem = Math.sqrt(sumD2 / (2 * n));
  const mean = pairs.reduce((s, [a, b]) => s + a + b, 0) / (2 * n);
  return { tem, temPct: (tem / mean) * 100 };
}

/** Cambio mínimo detectable al 95 % a partir del error de medida. */
export const minimalDetectableChange95 = (measurementError: number) =>
  1.96 * Math.SQRT2 * measurementError;

// ─────────────────────────────────────────────────────────────
// 2. Indicadores simples
// ─────────────────────────────────────────────────────────────

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;
export const waistToHeightRatio = (waistCm: number, heightCm: number) => waistCm / heightCm;

// ─────────────────────────────────────────────────────────────
// 3. Composición corporal: 2 componentes
// ─────────────────────────────────────────────────────────────

type DWRow = { minAge: number; maxAge: number; c: number; m: number };
// Durnin & Womersley (1974), filas adultas según consenso GREC-FEMEDE (2009).
const DURNIN_WOMERSLEY: Record<Sex, DWRow[]> = {
  M: [
    { minAge: 20, maxAge: 29, c: 1.1631, m: 0.0632 },
    { minAge: 30, maxAge: 39, c: 1.1422, m: 0.0544 },
    { minAge: 40, maxAge: 49, c: 1.162, m: 0.07 },
    { minAge: 50, maxAge: 72, c: 1.1715, m: 0.0779 }, // artículo original; GREC 2009 imprime 0.0799 (errata)
  ],
  F: [
    { minAge: 20, maxAge: 29, c: 1.1599, m: 0.0717 },
    { minAge: 30, maxAge: 39, c: 1.1423, m: 0.0632 },
    { minAge: 40, maxAge: 49, c: 1.1333, m: 0.0612 },
    { minAge: 50, maxAge: 68, c: 1.1339, m: 0.0645 },
  ],
};

export interface Skinfolds4DW { tricepsMm: number; bicepsMm: number; subscapularMm: number; iliacCrestMm: number }

export function densityDurninWomersley(sex: Sex, ageYears: number, s: Skinfolds4DW) {
  const row = DURNIN_WOMERSLEY[sex].find(r => ageYears >= r.minAge && ageYears <= r.maxAge);
  if (!row) throw new Error(`Edad ${ageYears} fuera del rango de la ecuación`);
  const sum = s.tricepsMm + s.bicepsMm + s.subscapularMm + s.iliacCrestMm;
  return row.c - row.m * Math.log10(sum);
}

/** Siri (1961): densidad → % de grasa. */
export const fatPercentSiri = (density: number) => 495 / density - 450;

/** Jackson & Pollock 7 pliegues (hombres 1978 / mujeres 1980). */
export function densityJacksonPollock7(sex: Sex, ageYears: number, sum7Mm: number) {
  return sex === 'M'
    ? 1.112 - 0.00043499 * sum7Mm + 0.00000055 * sum7Mm ** 2 - 0.00028826 * ageYears
    : 1.097 - 0.00046971 * sum7Mm + 0.00000056 * sum7Mm ** 2 - 0.00012828 * ageYears;
}

/** Faulkner: tríceps + subescapular + supraespinal + abdominal. */
export const fatPercentFaulkner = (sum4Mm: number) => 0.153 * sum4Mm + 5.783;

/** Yuhasz (1974): tríceps, subescapular, supraespinal, abdominal, muslo anterior, pierna medial. */
export const fatPercentYuhasz = (sex: Sex, sum6Mm: number) =>
  sex === 'M' ? 0.1051 * sum6Mm + 2.585 : 0.1548 * sum6Mm + 3.58;

export function twoComponent(weightKg: number, fatPct: number) {
  const fatMassKg = (weightKg * fatPct) / 100;
  return { fatPct, fatMassKg, fatFreeMassKg: weightKg - fatMassKg };
}

// ─────────────────────────────────────────────────────────────
// 4. Composición corporal: 4 componentes (De Rose & Guimarães)
// ─────────────────────────────────────────────────────────────

/** Rocha (1975): talla, diámetro biestiloideo (muñeca) y bicondíleo de fémur, TODO en metros. */
export const boneMassRocha = (heightM: number, wristBreadthM: number, femurBreadthM: number) =>
  3.02 * (heightM ** 2 * wristBreadthM * femurBreadthM * 400) ** 0.712;

/** Würch (1974): % fijo del peso según sexo. */
export const residualMassWurch = (sex: Sex, weightKg: number) => weightKg * (sex === 'M' ? 0.241 : 0.209);

export function fourComponent(sex: Sex, weightKg: number, fatMassKg: number, heightM: number, wristM: number, femurM: number) {
  const boneKg = boneMassRocha(heightM, wristM, femurM);
  const residualKg = residualMassWurch(sex, weightKg);
  const muscleKg = weightKg - (fatMassKg + boneKg + residualKg); // Matiegka: por diferencia
  return { fatMassKg, boneKg, residualKg, muscleKg };
}

/** Perímetro corregido: perímetro (cm) − π × pliegue (convertido a cm). */
export const correctedGirthCm = (girthCm: number, skinfoldMm: number) => girthCm - Math.PI * (skinfoldMm / 10);

/** Lee et al. (2000): masa muscular esquelética. ethnicity: 0 caucásico/hispano, −2 asiático, 1.1 afroamericano. */
export function skeletalMuscleLee(p: {
  sex: Sex; ageYears: number; heightM: number; ethnicity: number;
  armGirthCm: number; tricepsMm: number; thighGirthCm: number; frontThighMm: number; calfGirthCm: number; medialCalfMm: number;
}) {
  const cag = correctedGirthCm(p.armGirthCm, p.tricepsMm);
  const ctg = correctedGirthCm(p.thighGirthCm, p.frontThighMm);
  const ccg = correctedGirthCm(p.calfGirthCm, p.medialCalfMm);
  return p.heightM * (0.00744 * cag ** 2 + 0.00088 * ctg ** 2 + 0.00441 * ccg ** 2)
    + 2.4 * (p.sex === 'M' ? 1 : 0) - 0.048 * p.ageYears + p.ethnicity + 7.8;
}

// ─────────────────────────────────────────────────────────────
// 5. Composición corporal: 5 componentes (Kerr & Ross, 1988)
// ─────────────────────────────────────────────────────────────

export const PHANTOM_HEIGHT_CM = 170.18;
export const PHANTOM_SITTING_HEIGHT_CM = 89.92;

/** Estrategia Phantom: escala la medida a la talla del Phantom y la convierte en puntuación Z. */
export const phantomZ = (value: number, heightCm: number, p: number, s: number, d = 1, refHeight = PHANTOM_HEIGHT_CM) =>
  (value * (refHeight / heightCm) ** d - p) / s;

/** Convierte la Z de vuelta a una masa real para la talla del sujeto. */
export const massFromZ = (z: number, massP: number, massS: number, heightCm: number, refHeight = PHANTOM_HEIGHT_CM) =>
  (z * massS + massP) / (refHeight / heightCm) ** 3;

export interface KerrInput {
  sex: Sex; weightKg: number; heightCm: number; sittingHeightCm: number; adult: boolean;
  skinfoldsMm: { triceps: number; subscapular: number; supraspinale: number; abdominal: number; frontThigh: number; medialCalf: number };
  girthsCm: { headGirth: number; armRelaxed: number; forearm: number; chest: number; waist: number; thigh: number; calf: number };
  breadthsCm: { biacromial: number; biiliocristal: number; humerus: number; femur: number; transverseChest: number; apChestDepth: number };
}

export function kerrFiveComponent(k: KerrInput) {
  const sf = k.skinfoldsMm, g = k.girthsCm, b = k.breadthsCm;

  // Piel: superficie corporal (m²) × grosor (mm) × densidad 1.05
  const csa = !k.adult ? 70.691 : k.sex === 'M' ? 68.308 : 73.704;
  const bsaM2 = (csa * k.weightKg ** 0.425 * k.heightCm ** 0.725) / 10000;
  const skinKg = bsaM2 * (k.sex === 'M' ? 2.07 : 1.96) * 1.05;

  // Tejido adiposo: suma de 6 pliegues
  const sum6 = sf.triceps + sf.subscapular + sf.supraspinale + sf.abdominal + sf.frontThigh + sf.medialCalf;
  const zAdipose = phantomZ(sum6, k.heightCm, 116.41, 34.79);
  const adiposeKg = massFromZ(zAdipose, 25.6, 5.85, k.heightCm);

  // Músculo: 5 perímetros (4 corregidos por su pliegue)
  const sumMuscle =
    correctedGirthCm(g.armRelaxed, sf.triceps) + g.forearm + correctedGirthCm(g.chest, sf.subscapular)
    + correctedGirthCm(g.thigh, sf.frontThigh) + correctedGirthCm(g.calf, sf.medialCalf);
  const zMuscle = phantomZ(sumMuscle, k.heightCm, 207.21, 13.74);
  const muscleKg = massFromZ(zMuscle, 24.5, 5.4, k.heightCm);

  // Hueso: cabeza (sin escalar por talla) + cuerpo
  const headBoneKg = ((g.headGirth - 56.0) / 1.44) * 0.18 + 1.2;
  const sumBone = b.biacromial + b.biiliocristal + 2 * b.humerus + 2 * b.femur;
  const zBone = phantomZ(sumBone, k.heightCm, 98.88, 5.33);
  const bodyBoneKg = massFromZ(zBone, 6.7, 1.34, k.heightCm);
  const boneKg = headBoneKg + bodyBoneKg;

  // Residual: tórax y cintura corregida, escalado por TALLA SENTADO
  const sumResidual = b.transverseChest + b.apChestDepth + correctedGirthCm(g.waist, sf.abdominal);
  const zResidual = phantomZ(sumResidual, k.sittingHeightCm, 109.35, 7.08, 1, PHANTOM_SITTING_HEIGHT_CM);
  const residualKg = massFromZ(zResidual, 6.1, 1.24, k.sittingHeightCm, PHANTOM_SITTING_HEIGHT_CM);

  const structuredKg = skinKg + adiposeKg + muscleKg + boneKg + residualKg;
  return {
    bsaM2, skinKg, adiposeKg, muscleKg, headBoneKg, bodyBoneKg, boneKg, residualKg,
    zAdipose, zMuscle, zBone, zResidual,
    structuredKg, diffPct: ((structuredKg - k.weightKg) / k.weightKg) * 100,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. Proporcionalidad e interpretación
// ─────────────────────────────────────────────────────────────

export const cormicIndex = (sittingHeightCm: number, heightCm: number) => (sittingHeightCm / heightCm) * 100;
export const manouvrierIndex = (heightCm: number, sittingHeightCm: number) => ((heightCm - sittingHeightCm) / sittingHeightCm) * 100;
export const acromioIliacIndex = (biiliocristalCm: number, biacromialCm: number) => (biiliocristalCm / biacromialCm) * 100;

export interface ReferenceRange { indicator: string; sex?: Sex; min?: number; max?: number; label: string; source: string }

export function classify(value: number, ranges: ReferenceRange[], indicator: string, sex?: Sex) {
  const r = ranges.find(x => x.indicator === indicator && (!x.sex || x.sex === sex)
    && (x.min === undefined || value >= x.min) && (x.max === undefined || value < x.max));
  return r?.label ?? 'sin clasificar';
}

/** Peso ideal manteniendo la masa libre de grasa y cambiando solo el % de grasa. */
export const idealWeightForFatPct = (fatFreeMassKg: number, targetFatPct: number) => fatFreeMassKg / (1 - targetFatPct / 100);

// ─────────────────────────────────────────────────────────────
// 7. Energía
// ─────────────────────────────────────────────────────────────

export const rmrMifflin = (sex: Sex, kg: number, cm: number, age: number) => 10 * kg + 6.25 * cm - 5 * age + (sex === 'M' ? 5 : -161);

export const rmrHarrisBenedict1919 = (sex: Sex, kg: number, cm: number, age: number) =>
  sex === 'M' ? 66.473 + 13.7516 * kg + 5.0033 * cm - 6.755 * age : 655.0955 + 9.5634 * kg + 1.8496 * cm - 4.6756 * age;

/** FAO/OMS/UNU (2004, ecuaciones de Schofield) — solo adultos. */
export function bmrFaoWho(sex: Sex, kg: number, age: number) {
  if (age < 18) throw new Error('Usar tabla pediátrica');
  const t = sex === 'M'
    ? age < 30 ? [15.057, 692.2] : age < 60 ? [11.472, 873.1] : [11.711, 587.7]
    : age < 30 ? [14.818, 486.6] : age < 60 ? [8.126, 845.6] : [9.082, 658.5];
  return t[0] * kg + t[1];
}

export const rmrCunningham = (fatFreeMassKg: number) => 500 + 22 * fatFreeMassKg;
export const rmrKatchMcArdle = (fatFreeMassKg: number) => 370 + 21.6 * fatFreeMassKg;

/** Gasto de una actividad por METs. net=true descuenta el reposo (1 MET) para no contarlo dos veces. */
export const activityKcal = (met: number, kg: number, minutes: number, net = false) => (net ? met - 1 : met) * kg * (minutes / 60);

export const KCAL_PER_KG_FAT = 7700; // regla estática: útil para planificar, sobreestima a largo plazo (Hall 2011)

export function dailyTargetForFatLoss(tdeeKcal: number, kgFatPerMonth: number, daysPerMonth = 30) {
  const deficit = (kgFatPerMonth * KCAL_PER_KG_FAT) / daysPerMonth;
  return { deficitKcal: deficit, targetKcal: tdeeKcal - deficit };
}

// ─────────────────────────────────────────────────────────────
// 8. Macronutrientes e intercambios
// ─────────────────────────────────────────────────────────────

export const ATWATER = { cho: 4, protein: 4, fat: 9 } as const;
export interface Macros { cho: number; protein: number; fat: number }
export const kcalOf = (m: Macros) => m.cho * ATWATER.cho + m.protein * ATWATER.protein + m.fat * ATWATER.fat;

export function macroTargets(kcal: number, kg: number, proteinGPerKg: number, fatPctKcal: number): Macros {
  const protein = proteinGPerKg * kg;
  const fat = (kcal * fatPctKcal) / 100 / ATWATER.fat;
  const cho = (kcal - protein * ATWATER.protein - fat * ATWATER.fat) / ATWATER.cho;
  return { cho, protein, fat };
}

export interface ExchangeGroup { code: string; name: string; cho: number; protein: number; fat: number }

/** Lista de EJEMPLO con valores tipo ADA; en producción se carga la lista oficial (ADA o Dextre) como datos. */
export const DEMO_EXCHANGE_LIST: ExchangeGroup[] = [
  { code: 'VEG', name: 'Verduras', cho: 5, protein: 2, fat: 0 },
  { code: 'FRU', name: 'Frutas', cho: 15, protein: 0, fat: 0 },
  { code: 'MILK', name: 'Lácteos descremados', cho: 12, protein: 8, fat: 0 },
  { code: 'STA', name: 'Cereales/almidones', cho: 15, protein: 3, fat: 1 },
  { code: 'MEAT', name: 'Carnes magras', cho: 0, protein: 7, fat: 2 },
  { code: 'FAT', name: 'Grasas', cho: 0, protein: 0, fat: 5 },
];

/** Cálculo clásico: se fijan verduras/frutas/lácteos y se despejan almidones (CHO), carnes (proteína) y grasas (lípidos). */
export function computeExchanges(target: Macros, fixed: { VEG: number; FRU: number; MILK: number }, list = DEMO_EXCHANGE_LIST) {
  const g = Object.fromEntries(list.map(x => [x.code, x])) as Record<string, ExchangeGroup>;
  const plan: Record<string, number> = { VEG: fixed.VEG, FRU: fixed.FRU, MILK: fixed.MILK, STA: 0, MEAT: 0, FAT: 0 };
  const total = () => Object.entries(plan).reduce<Macros>((acc, [code, n]) => ({
    cho: acc.cho + n * g[code].cho, protein: acc.protein + n * g[code].protein, fat: acc.fat + n * g[code].fat,
  }), { cho: 0, protein: 0, fat: 0 });

  plan.STA = Math.round((target.cho - total().cho) / g.STA.cho);
  plan.MEAT = Math.round((target.protein - total().protein) / g.MEAT.protein);
  plan.FAT = Math.round((target.fat - total().fat) / g.FAT.fat);

  const t = total();
  const adequacy = {
    kcal: (kcalOf(t) / kcalOf(target)) * 100,
    cho: (t.cho / target.cho) * 100,
    protein: (t.protein / target.protein) * 100,
    fat: (t.fat / target.fat) * 100,
  };
  return { plan, totals: t, kcal: kcalOf(t), adequacy };
}

/** Reparte N intercambios entre tiempos de comida según % y redondea por "mayor residuo" para que la suma no cambie. */
export function distributeByMeals(total: number, sharesPct: Record<string, number>) {
  const raw = Object.entries(sharesPct).map(([meal, pct]) => ({ meal, exact: (total * pct) / 100 }));
  const base = raw.map(r => ({ ...r, n: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let missing = total - base.reduce((s, r) => s + r.n, 0);
  [...base].sort((a, b) => b.rest - a.rest).forEach(r => { if (missing > 0) { r.n += 1; missing -= 1; } });
  return Object.fromEntries(base.map(r => [r.meal, r.n]));
}

export const adequacyPct = (consumed: number, target: number) => (consumed / target) * 100;

// ─────────────────────────────────────────────────────────────
// 9. Entrenamiento
// ─────────────────────────────────────────────────────────────

export interface SetLog { exercise: string; loadKg: number; reps: number; rir?: number }

export const tonnageKg = (sets: SetLog[]) => sets.reduce((s, x) => s + x.loadKg * x.reps, 0);
export const oneRmEpley = (loadKg: number, reps: number) => (reps <= 1 ? loadKg : loadKg * (1 + reps / 30));
export const oneRmBrzycki = (loadKg: number, reps: number) => loadKg * (36 / (37 - reps));
export const rpeFromRir = (rir: number) => 10 - rir;

export type MuscleMap = Record<string, Array<{ muscle: string; role: 'primary' | 'secondary' }>>;

/** Series semanales por grupo muscular con conteo fraccional (directa = 1, indirecta = 0,5). */
export function weeklySetsByMuscle(sets: SetLog[], map: MuscleMap) {
  const out: Record<string, number> = {};
  for (const s of sets) for (const m of map[s.exercise] ?? []) out[m.muscle] = (out[m.muscle] ?? 0) + (m.role === 'primary' ? 1 : 0.5);
  return out;
}

export const compliancePct = (done: number, planned: number) => (planned === 0 ? 0 : (done / planned) * 100);
```
