# Demo 3 · Entrenamiento y app del paciente — guion

- **Para:** Jeremy. Unos 40 minutos, más preguntas.
- **Qué se acepta:** RF-24 (la ficha de evolución; la de rutina, desde P12), RF-25 a RF-35, RF-38 con ejercicios y
  actividades, y RF-41 a RF-43 (Notion 04, «Aceptación por demo»). RF-31, el registro sin conexión, es deseable y quedó
  fuera (ADR-085).
- **Evidencia:** un paciente real de prueba registra una semana desde su celular, y el profesional ve la analítica y
  decide el control semanal.

> **Aviso:** la demo se hace en una computadora local, con datos de demostración y la versión v0.3.0. El servidor de
> pruebas (staging) sigue pendiente de la cuenta de Hetzner a nombre de Jeremy (P4).

## Cómo leer las cifras

- Cada número aparece con el método que lo calculó. Por ejemplo: el tonelaje, las series fraccionadas, el 1RM con su
  fórmula, la recuperación del día (`READINESS_JV`) y el control de la semana (`WEEKLY_REVIEW_JV`).
- La pantalla redondea solo al mostrar (RN-D09). Un promedio sin datos queda «sin dato» y no enciende el semáforo.
- La biblioteca de ejercicios lleva rotulados como «Provisional» los 146 ejercicios que Jeremy todavía no confirma.
- Luis y Mateo Prueba son inventados: ningún dato es de una persona real.
- Mateo es el alumno ficticio de la hoja piloto de Jeremy, «JV Fitness · Mi plan», de octubre de 2026:
  - sus números son los de esa hoja;
  - la hoja da un valor por semana, y su registro diario lo repite cada día para que el promedio sea el de la hoja;
  - la fecha de nacimiento, la talla y la marca de la bioimpedancia son datos de la demo.

## Preparación

1. Base y datos, en este orden:
   - `pnpm db:seed`
   - `pnpm --filter api build`
   - `pnpm catalog:load plataforma@demo.example.com`
   - `pnpm demo:2`
   - `pnpm build`
   - con `pnpm dev` corriendo (API y worker): `pnpm demo:3`

   `pnpm demo:3` termina con los controles de Luis y de Mateo: Luis en ámbar y Mateo en rojo, rojo, verde y verde.

2. La semana anterior, una persona del equipo usa la app en su celular como paciente de prueba. Esa es la evidencia de 04. Se le crea la ficha con datos sintéticos y se la invita desde el panel. Para el celular, la app local sale por el
   túnel. Durante la semana registra comidas, agua, el registro diario y sus entrenos; al cerrar la semana, su control
   se calcula solo.
3. El p95 ya está medido en `docs/demos/demo-3-p95.md` con `pnpm seed:load` y `pnpm analytics:p95` (criterio 4 de
   P14). No hace falta repetirlo en vivo.

## Qué trae la demo

| Quién              | Qué tiene                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consultorio Demo   | La organización de las demos 1 y 2. Toma los umbrales de la V3 (07 §11) desde el 05/10, para que el mes de Mateo tenga control                                                                                                                                                                                                                                                                                                                            |
| Dueña Demo         | Dueña, nutricionista y coach: atiende a Luis y a Mateo                                                                                                                                                                                                                                                                                                                                                                                                    |
| Luis               | Lo de la Demo 2, más: su perfil de entrenamiento, «Fuerza base» (4 semanas desde el lunes de la semana pasada), su semana G-20 registrada y su control                                                                                                                                                                                                                                                                                                    |
| Mateo Prueba       | Dos evaluaciones básicas con bioimpedancia (05/10 y 31/10). Su plan por composición con dos perfiles de día: Entrenamiento, 2,510 kcal (160/310/70 g, su prescripción), y Descanso, 2,230 kcal (160/240/70 g), con menos pan en la media tarde y menos papa en la cena. «Full Body» con las fases de pérdida de grasa de la V3, semanas 1 a 8 desde el 06/10. 12 entrenos (el 22/10 asistió, P-33), 28 registros diarios y los controles de sus 4 semanas |
| Paciente de prueba | Su semana registrada desde el celular                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Catálogos          | 169 ejercicios base, la tabla patrón × nivel de la V3 y 560 actividades del Compendium 2024                                                                                                                                                                                                                                                                                                                                                               |

## 1 · Biblioteca de ejercicios y actividades (RF-25, RF-38) · 3 min

**Qué se hace**

1. Biblioteca › Ejercicios: buscar «jalón» y abrir «Jalón al pecho».
2. Crear un ejercicio propio con su patrón, su nivel y sus músculos.

**Qué decir**

- Cada ejercicio trae su patrón, nivel, equipo, músculos principal y secundario, precaución, alternativa, regresión y
  progresión (N13).
- Los ejercicios base se cargan por lote con su hash. Los propios son del consultorio.

## 2 · Seguridad, anamnesis y propuesta de rutina (RF-41, RF-43, RF-26) · 6 min

Con el paciente de prueba:

1. **Anamnesis V2 de JV Fitness:** el perfil de rendimiento con su puntaje por dominio y el PRI (RF-43, 07 §12).
2. **Las llaves:** el cribado y su revisión, el alta médica y la evaluación de postura y pruebas físicas. Mientras falte una
   llave, la propuesta queda bloqueada (RF-41).
3. **La propuesta automática:** sale del objetivo, el nivel y los días. Trae el macrociclo de 8 a 12 semanas con su fase,
   su factor de volumen y su RIR. El coach aprueba o sustituye cada bloque y publica (RN-F13, RN-F14).

**Qué decir**

- Nada se publica sin aprobación. Un programa publicado no se edita: se revisa en una versión nueva (RN-F12).
- La ficha PDF de la rutina sale del programa vigente (RF-24).

## 3 · App del paciente (RF-27 a RF-30) · 6 min

En el celular del paciente de prueba:

1. **Hoy:** el resumen del día, la indicación del día y las comidas del plan, que se registran en tres toques.
2. **Registro diario:** sueño, fatiga, dolor, estrés y motivación, en menos de 2 minutos (07 §9).
3. **Check-in de la semana** (P14.5, PR 5b), si la demo cae entre domingo y martes: en Hoy, la alimentación de la semana, el
   peso y un comentario. El coach lo ve como nota en Seguimiento, y la alimentación en el control semanal (P-21, P-22).
4. **Entreno:** la sesión del día, serie por serie, con su tonelaje.
5. **Más:**
   - Material: el recurso que el coach le asignó, que queda leído al abrirlo;
   - Fichas en PDF: las vigentes;
   - Progreso: su evolución.

## 4 · Analítica de dieta (RF-32) · Luis · 3 min

**Qué se hace:** ficha de Luis, pestaña Analítica, la semana pasada.

**Qué debe aparecer**

| En pantalla                                                                  | Regla        |
| ---------------------------------------------------------------------------- | ------------ |
| Promedio de la semana: 1,910 kcal frente a 1,835 kcal; adecuación de 104.1 % | G-20, RN-G09 |
| 4 de 7 días en rango (90 a 110 %)                                            | RN-E10       |
| Adherencia por tiempo de comida                                              | RF-32        |

## 5 · Analítica de rutina (RF-33) · Mateo · 4 min

**Qué se hace:** ficha de Mateo, pestaña Analítica, rutina.

**Qué debe aparecer**

| En pantalla                                                             | Hoja de Jeremy                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Fases de las semanas 1 a 4: Adaptación, Base, Acumulación y Acumulación | Macrociclo, mesociclo 1                                          |
| Sesiones hechas por semana: 3, 3, 3 y 3                                 | Registro de cargas: 12 sesiones. Ver la semana 3 en la sección 9 |
| Tonelaje por semana: 5,220, 5,490, 5,760 y 3,750 kg                     | Volumen del registro de cargas                                   |
| 1RM estimado de «Press banca» con Epley: 56.0, 59.5, 63.0 y 46.7 kg     | Registro de cargas: «1RM estimado»                               |

**Panel de fatiga y recuperación (P14.5, PR 3):** en la misma pestaña, debajo de las semanas.

| Semana de Mateo | Estrés · sueño · fatiga | Volumen ajustado | Prom. 3 sem. | Carga         | Recuperación | Estado general |
| --------------- | ----------------------- | ---------------- | ------------ | ------------- | ------------ | -------------- |
| 1               | 3 · 6.4 h · 3           | 5,220            | —            | Sin base      | Ámbar        | Ámbar          |
| 2               | 4 · 6.8 h · 4           | 5,490            | 5,220        | Verde (+5 %)  | Rojo         | Rojo           |
| 3               | 3 · 7.1 h · 3           | 6,336            | 5,355        | Ámbar (+18 %) | Ámbar        | Ámbar          |
| 4               | 2 · 7.4 h · 2           | 3,375            | 5,682        | Verde (−41 %) | Verde        | Verde          |
| 5               | Sin registros           | —                | 5,067        | Faltan datos  | Faltan datos | Faltan datos   |

**Qué decir:** son las semanas de la hoja (P-23 y P-24). El panel solo informa: en la semana 3 sale ámbar y el control dice
«Continuar plan», porque decide el control semanal (P-25). Los promedios se comparan sin redondear: un estrés de 2.6 es verde.

## 6 · Control semanal (RF-42) · Mateo y Luis · 6 min

**Qué se hace**

1. Ficha de Mateo › Entrenamiento › Control semanal.
2. Ficha de Luis › Entrenamiento › Control semanal: decidir en vivo.

**Qué debe aparecer**

| Semana de Mateo | Promedios                                | Control                                                                                           | Hoja de Jeremy             |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| 1               | Sueño 6.4 h, rendimiento 80 %, estrés 3  | Rojo: «Rendimiento bajo el mínimo» y «Sueño bajo el mínimo semanal». «Descarga 20–30 % y revisar» | DESCARGA 20–30 % Y REVISAR |
| 2               | Sueño 6.8 h, rendimiento 80 %, estrés 4  | Rojo: «Rendimiento bajo el mínimo». «Descarga 20–30 % y revisar»                                  | DESCARGA 20–30 % Y REVISAR |
| 3               | Sueño 7.1 h, rendimiento 100 %, estrés 3 | Verde: «Continuar plan»                                                                           | CONTINUAR PLAN             |
| 4               | Sueño 7.4 h, rendimiento 100 %, estrés 2 | Verde: «Continuar plan»                                                                           | CONTINUAR PLAN             |

**En vivo, con Luis:** su semana sale en ámbar, porque la fatiga promedio supera el umbral, y sugiere «Ajustar 5–15 %».
El coach decide Mantener, Ajustar o Descargar y escribe una nota. Si ajusta o descarga, queda la versión siguiente del
programa en borrador, y la publica el coach (RN-F17, RN-F12).

**Qué decir:** el semáforo es una sugerencia y decide el coach. La alimentación de Mateo sale del check-in de cada domingo, que
el paciente completa del domingo al martes (P-21, P-22). El estrés promedio está en el resumen, pero no cambia el semáforo:
decide el control semanal (P-25). Los umbrales son de la organización y se cambian en
Ajustes › Umbrales del entrenamiento (07 §11).

## 7 · Panel con alertas (RF-34) · 2 min

**Qué se hace:** Inicio.

**Qué debe aparecer:**

- los pacientes sin registros en 3 días;
- la adherencia baja;
- el semáforo del día y de la semana;
- el panel de fatiga en ámbar o en rojo de la última semana cerrada (P14.5, PR 3);
- los controles sin decidir, con Luis y Mateo;
- las notas sin leer.

## 8 · Evolución (RF-35, RF-24, RF-30) · Mateo · 4 min

**Qué se hace:**

1. Ficha de Mateo › Evaluaciones › Evolución: arriba, la «Comparativa física».
2. La ficha PDF de evolución.
3. En la app, Progreso: el peso, la cintura y la cadera.

**Qué debe aparecer**

| En pantalla                                                         | Hoja de Jeremy     |
| ------------------------------------------------------------------- | ------------------ |
| Peso 80 → 79 kg (−1)                                                | Comparativa física |
| Cintura 88 → 85 cm (−3) y cadera 100 → 99 cm (−1)                   | Comparativa física |
| Grasa corporal por bioimpedancia, en su propia serie: 22.0 → 20.8 % | Comparativa física |

**Qué decir:** la bioimpedancia nunca comparte serie con la antropometría (RN-C08). Cada cambio se compara con el CMD95
del evaluador (RN-C06).

## 9 · La hoja de Jeremy frente a la app · Mateo · 5 min

| Coincide                                                                                                                                                                                                                                                                          | Difiere o falta (P14.5)                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Las metas por tipo de día, con las respuestas de Jeremy a P-20: mandan los gramos, así que son 2,510 y 2,230 kcal. Cada día de octubre lleva la de su perfil: Entrenamiento si tiene sesión y Descanso si no. Las comidas de Descanso: el mismo plan con menos almidones (P-20.5) | Las porciones exactas de Descanso de Mateo: las de la demo son de ejemplo |
| El macrociclo V3 de las semanas 1 a 8                                                                                                                                                                                                                                             | «No entreno hoy» y «mover a mañana» (PR 1e)                               |
| El control de las 4 semanas, el volumen ajustado por RIR y descanso, y el panel de fatiga y recuperación                                                                                                                                                                          | La fatiga por grupo muscular (PR 4)                                       |
| El 1RM de Epley y el porcentaje                                                                                                                                                                                                                                                   | La prescripción de la hoja (PR 9)                                         |
| Las sesiones (12), el sueño, el rendimiento y la alimentación por semana                                                                                                                                                                                                          | El informe mensual y las fotos                                            |
| Peso, cintura, cadera y grasa                                                                                                                                                                                                                                                     | El expediente de documentos                                               |

Dos diferencias de datos de la hoja:

- **La semana 3:** el registro de cargas trae la sentadilla del 22/10 (3 × 12 × 65 kg), pero en asistencias ese día es
  una ausencia. Jeremy (P-33): manda la asistencia, pero el 6,336 de su panel incluye esa sentadilla. Para conservar el
  ejemplo en ámbar, en la demo el 22/10 asistió: el tonelaje de la semana 3 es de 5,760 kg y su volumen ajustado, 6,336.
- **Los días:** la hoja rotula las sesiones lunes, miércoles y viernes, pero las fechas de asistencia son martes, jueves
  y sábado. La app sigue las fechas.

Las dos están respondidas en las preguntas para Jeremy (`docs/preguntas/hoja-piloto-mateo.md`, P-33).

**Qué decir de los perfiles de día:**

- Jeremy respondió P-20: los gramos mandan y hay más tipos de día que entrenamiento y descanso.
- En el plan de Mateo, Descanso trae la proteína y la grasa de Entrenamiento ya puestas.
- El programa elige el perfil de cada día: un día con sesión es Entrenamiento, aunque el paciente falte, porque nadie
  reprogramó la sesión (P-20.3).
- Descanso es el mismo plan con menos almidones (P-20.5). En el editor, «Porciones de: Descanso» muestra los gramos de ese
  día: 30 g de pan en la media tarde y 50 g de papa en la cena, unos 240 g de carbohidratos. Son de ejemplo y se pueden
  cambiar ahí mismo.
- En un plan por intercambios, la app sugiere qué almidones quitar, primero de la media tarde y luego de la cena, y el coach
  lo ajusta.
- La app del paciente dice de qué día son las porciones de hoy, y la ficha 1.2.0 las imprime.

## 10 · Rendimiento (RNF-01, criterio 4 de P14) · 1 min

`docs/demos/demo-3-p95.md`: con 500 pacientes y dos años de historia, el peor p95 de la analítica es de 102 ms, frente
a un máximo de 300 ms. Es una medición local. La de k6 sobre un servidor igual al de producción, con carga sostenida, va
en P16.
