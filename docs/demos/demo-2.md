# Demo 2 · Prescripción nutricional — guion

- **Para:** Jeremy. Unos 25 minutos, más preguntas.
- **Qué se acepta:** RF-18 a RF-23, RF-24 con tres fichas (dieta por intercambios, menú semanal y resultados
  antropométricos) y RF-38 con alimentos e intercambios (Notion 04, «Aceptación por demo»). RF-22, las plantillas de
  plan, es deseable y no se hizo (ADR-063).
- **Prueba de aceptación:** las dietas de Luis por intercambios y por composición, publicadas, y sus PDF. Al terminar
  se entrega el acta (`docs/actas/demo-2.md`): su aceptación por escrito habilita el Pago 2 de la semana 7.

> **Aviso:** la demo se hace en una computadora local, con datos de demostración y la versión v0.2.0. El servidor de
> pruebas (staging) sigue pendiente de la cuenta de Hetzner a nombre de Jeremy.

## Cómo leer las cifras

- Cada número aparece con el método que lo calculó: la meta de energía con su ecuación y su PAL, los intercambios con
  su lista y su versión, y los totales de un plato o una receta con «Composición de receta».
- Los alimentos son de la TPCA 2017 y las medidas caseras, de la TAFERA 2016. La atribución está una sola vez, en
  «Acerca de».
- Si a un alimento le falta un dato en la TPCA, la suma dice «al menos» y en cuántos alimentos falta. No se cuenta como
  cero (RN-I03).
- La pantalla redondea solo al mostrar: kcal y gramos enteros, porcentajes con 1 decimal (RN-D09). La adecuación usa
  el valor completo.
- La lista de intercambio es la de demostración, rotulada «Provisional»: las listas ADA y Dextre esperan el permiso de
  sus autores (riesgo R4).
- Luis es un paciente inventado: ningún dato es de una persona real.

## Qué trae la demo

| Quién | Qué tiene |
|---|---|
| Consultorio Demo | La organización de la Demo 1, con la marca por defecto: sin logo y con la paleta provisional |
| Dueña Demo | Dueña y nutricionista: atiende a Luis |
| Luis | Lo de la Demo 1 más su prescripción energética (1,835 kcal; G-12 a G-17), su dieta por intercambios publicada y después reemplazada, y su dieta por composición publicada, que es la vigente |
| Recetario | «Arroz con pollo»: 200 g de arroz cocido y 150 g de pollo en 2 porciones |
| Catálogos | 928 alimentos de la TPCA 2017, 933 medidas caseras de la TAFERA 2016 y la lista de intercambio de demostración |

## 1 · Datos maestros: alimentos e intercambios (RF-38) · 2 min

**Qué se hace**

1. Menú «Biblioteca», pestaña «Alimentos»: buscar «platano» (sin tilde) y abrir «Arroz pilado o pulido cocido».
2. Pestaña «Listas de intercambio».
3. «Acerca de», abajo en el menú.

**Qué decir**

- Las tablas peruanas vienen cargadas y validadas por lote: si una fila trae un error, el lote lo dice y no entra a
  medias.
- Un dato que la tabla no trae es «sin dato», nunca cero.
- Cada consultorio puede crear sus alimentos propios. Los de la TPCA no se editan (RN-I01).

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| «platano» encuentra «Plátano de isla» y los demás plátanos | Búsqueda sin tildes |
| Arroz cocido: «Energía 115 kcal», «Fibra dietaria · sin dato» y sus medidas caseras de la TAFERA, como «Espumadera llena 113.1 g» | RN-I03, RN-E12 |
| «Lista de demostración · versión 1.0.0», rotulada «Provisional»: «Carnes magras … 46 kcal» | RN-E11 |
| «Acerca de»: la TPCA 2017, la TAFERA 2016 y el Compendium 2024, una sola vez | ADR-055 |

## 2 · La meta del día: energía y macronutrientes (RF-18) · 1 min

**Qué se hace**

En la ficha de Luis, pestaña «Energía»: abrir la prescripción.

**Qué decir**

- Es la misma prescripción de la Demo 1: Mifflin-St Jeor, PAL 1.4, correr tres veces por semana y perder grasa.
- Todos los planes de Luis salen de esta meta: no se vuelve a escribir en cada plan.

**Qué debe aparecer**

| En pantalla | Caso dorado |
|---|---|
| Objetivo 1,835 kcal | G-16 |
| Proteína 160 g, grasa 51 g y carbohidratos 184 g | G-17 |

## 3 · Dieta por intercambios (RF-19, RF-23, RF-24) · 4 min

**Qué se hace**

1. Pestaña «Dieta»: el historial de planes. Abrir «Versión 1 · Reemplazado · Intercambios · DEMO 1.0.0».
2. Recorrer «Metas y adecuación», «Intercambios del día», «Reparto por tiempos de comida» y «Alimentos permitidos».
3. «Descargar ficha (PDF)» y abrir el archivo.

**Qué decir**

- El profesional fija verduras, frutas y lácteos; el motor despeja almidones, carnes y grasas para llegar a la meta
  (RN-E08). Cada número se puede ajustar a mano.
- El reparto por tiempos de comida lo propone el motor y también se ajusta (RN-E09).
- La porción de cada alimento permitido es la que aporta un intercambio de su grupo; el editor la sugiere y el
  profesional la cambia (ADR-057).
- Un plan publicado no se edita: «Crear versión nueva» hace un borrador. Este plan quedó «Reemplazado» al publicar la
  composición (RN-E14), y su ficha se sigue pudiendo bajar.

**Qué debe aparecer**

| En pantalla | Caso dorado o regla |
|---|---|
| Plan 1,889 kcal (103.0 %), carbohidratos 191 g (103.8 %), proteína 162 g (101.3 %) y grasa 53 g (104.0 %), todos «En rango» | RN-E10 |
| Verduras 4, frutas 3, lácteos 3, almidones 6, carnes magras 16 y grasas 3 | G-18 |
| Almidones por tiempo: 1, 1, 2, 1, 1. Carnes magras: 4, 2, 5, 2, 3 | G-19 |
| Desayuno · 07:00: «Arroz pilado o pulido cocido · 60 g», «Pollo, carne pulpa · 33 g», «Leche fresca de vaca, descremada · 320 g» | RN-G05 |
| La ficha `ficha-dieta-por-intercambios.pdf`, de 3 páginas: Luis con su código, las metas con su método, la lista «Lista de demostración, versión 1.0.0 · provisional», el reparto, los alimentos con su porción y la meta de agua de 2,500 ml | RN-H01, RN-H04 |

## 4 · Dieta por composición (RF-20, RF-24) · 4 min

**Qué se hace**

1. Volver a «Dieta» y abrir «Versión 1 · Vigente · Composición».
2. Recorrer la adecuación, los alimentos de cada tiempo y «Lo que aporta el día».
3. «Descargar ficha (PDF)».

**Qué decir**

- Aquí se escribe alimento por alimento, en gramos o en medidas caseras: «3 × Cucharada colmada» de avena son 31 g.
- Al huevo, al atún y al bonito la TPCA no les trae carbohidratos: el total dice «al menos» y la adecuación de
  carbohidratos es un mínimo (RN-I03).
- La composición se imprime con la misma ficha del menú, como un plan de un día (ADR-064). Siguen siendo cinco fichas.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| Energía 1,721 kcal de 1,835 kcal: 93.8 %, «En rango» | RN-E10 |
| Carbohidratos «al menos 189 g» de 184 g, «falta en 3 de 18», «al menos 102.9 %», «Faltan datos» | RN-I03 |
| Proteína 151 g de 160 g (94.1 %) y grasa 51 g de 51 g (99.5 %), «En rango» | RN-E10 |
| Desayuno · 07:00: «Avena, hojuela cruda · 31 g · 3 × Cucharada colmada» | RN-E12 |
| La ficha `ficha-menu.pdf`, de 2 páginas, titulada «Dieta por composición»: cada tiempo con sus alimentos y medidas, y «Total del día: 1,721 kcal» | RN-H01 |

## 5 · Recetario (RF-21) · 2 min

**Qué se hace**

«Biblioteca» → «Recetas» → «Arroz con pollo».

**Qué decir**

- Los nutrientes por porción los calcula el motor desde los ingredientes; si cambia un ingrediente, se recalculan.
- Una receta no se borra: se archiva y se restaura.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| «Rinde 2 porciones»: arroz cocido 200.0 g y pollo crudo 150.0 g | RN-E12 |
| Por porción: energía 204 kcal, proteínas 18 g, grasa total 2 g y carbohidratos totales 25 g | Criterio 1 de P10 |
| Fibra dietaria «0 g · falta en 1 de 2»: la TPCA no trae la fibra del pollo | RN-I03 |
| El aviso: todavía no se aplican factores de retención de micronutrientes al cocinar | RN-E12 |

## 6 · Menú semanal en vivo (RF-21, RF-23, RF-24) · 5 min

**Qué se hace**

1. En la ficha de Luis, «Dieta» → «Nuevo plan»; en «Modalidad», «Menú semanal»; «Crear borrador».
2. «Usar 2,500 ml (EFSA 2010)».
3. Para la demo, solo el almuerzo: quitar Desayuno, Media mañana, Media tarde y Cena, y poner 100 en «% del día» del
   almuerzo.
4. «Agregar» en la opción A del almuerzo del lunes → la receta «Arroz con pollo» → «Listo».
5. «Agregar» en la opción B → buscar «pollo carne pulpa» → «Pollo, carne pulpa» → «Listo», y 120 en «Gramos».
6. «Copiar el lunes a los demás días» → «Copiar».
7. «Guardar borrador» → «Publicar plan» → «Publicar».
8. «Descargar ficha (PDF)»: si todavía la está generando, dice «Generando…» unos segundos.

**Qué decir**

- Cada tiempo lleva una opción A y, si se quiere, una B para cambiar. El día suma la A; la B muestra lo suyo para
  comparar (RN-E16).
- En la consulta se llenan los cinco tiempos; aquí solo el almuerzo, por eso la adecuación sale «Por debajo».
- Al publicar, el menú pasa a ser el vigente y la composición queda «Reemplazado». La ficha la genera el sistema solo,
  en el momento de publicar.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| Opción A: «Arroz con pollo», 204 kcal. Opción B: «Pollo, carne pulpa · 120 g», 143 kcal y 26 g de proteína | RN-E16 |
| De lunes a domingo, 204 kcal; «Promedio 204 kcal, 25 g, 18 g, 2 g» | RN-E16 |
| Adecuación del promedio: energía 11.1 %, «Por debajo», «0 de 7 días en rango» | RN-E10, RN-G09 |
| En «Dieta»: menú semanal «Vigente»; composición e intercambios «Reemplazado» | RN-E14, RF-23 |
| La ficha `ficha-menu.pdf`, de 3 páginas, titulada «Menú semanal»: cada día con su opción A y B y su total, el promedio de la semana y la receta con una porción | RN-H01 |

## 7 · Ficha de resultados antropométricos (RF-24) · 2 min

**Qué se hace**

Pestaña «Evaluaciones» → la ISAK 2 de hoy → «Descargar ficha (PDF)».

**Qué decir**

- La ficha de resultados se genera al pedirla, cuando el sistema ya calculó los resultados.
- Cada número lleva su método al lado y cada interpretación su fuente, como en la pantalla (RN-D02).

**Qué debe aparecer**

| En la ficha | Caso dorado o regla |
|---|---|
| `ficha-resultados-antropometricos.pdf`, de 6 páginas, con la fecha de la medición y sus condiciones | RN-C09 |
| «% de grasa (Durnin & Womersley (1974) + Siri) 20.3 %», «Promedio · ACE» | G-06, criterio 2 de P11 |
| «Masa ósea (Rocha)», sin repetir el indicador (plantilla 1.0.1) | RN-D02, ADR-069 |
| IMC 26.1 kg/m², «Sobrepeso · OMS»; índice cintura/talla 0.49, «Sin riesgo aumentado · NICE…» | G-05, RN-D10 |
| La lectura de bioimpedancia, «cargada a mano»: no se compara con los pliegues | RN-C08 |

## 8 · La marca en las fichas (RN-H03) · 3 min

**Qué se hace**

1. Menú «Organización» → «Marca de las fichas».
2. Subir el logo (el de Jeremy, si lo trae; si no, cualquier PNG o JPG), elegir el color y escribir el nombre, el
   teléfono, el correo y el pie. «Guardar marca».
3. Volver al menú semanal de Luis → «Descargar ficha (PDF)».

**Qué decir**

- La marca la cambian la dueña y los administradores; los profesionales la ven. Cada cambio queda en la auditoría.
- El logo se revisa entero al subirlo: una imagen dañada no llega a las fichas.
- La ficha que ya se bajó no cambia: la siguiente sale con la marca nueva (RN-H02). El panel y la app del paciente
  toman la marca en la Demo 4 (RF-36).

**Qué debe aparecer**

| En pantalla o en la ficha | Regla |
|---|---|
| La vista previa cambia mientras se escribe, y el color muestra su contraste («Contraste AA») | ADR-066 |
| La ficha nueva lleva el logo arriba, el nombre en el color elegido y abajo el teléfono, el correo y el pie | RN-H03 |
| El PDF anterior, guardado en el paso 6, sigue igual | RN-H02 |

## Tabla de aceptación de la Demo 2

| RF | Qué | Dónde se ve | Estado |
|---|---|---|---|
| RF-18 | Macronutrientes: proteína en g/kg, grasa en % y carbohidratos por diferencia | Paso 2 | ✅ Listo (P7): G-17 |
| RF-19 | Dieta por intercambios con cálculo automático, ajuste, adecuación, reparto y alimentos permitidos | Paso 3 | ✅ Listo (P9): G-17 a G-19 en la E2E |
| RF-20 | Dieta por composición con gramos o medidas caseras, totales y adecuación | Paso 4 | ✅ Listo (P10) |
| RF-21 | Menú semanal con opción A y B, y recetario con nutrientes por porción | Pasos 5 y 6 | ✅ Listo (P10) |
| RF-22 | Plantillas de plan (deseable) | No se ve | ⬜ No se hizo (ADR-063) |
| RF-23 | Publicar con meta de hidratación e historial de versiones | Pasos 3, 4 y 6 | ✅ Listo (P9 y P10) |
| RF-24 | Fichas PDF: dieta por intercambios, menú semanal y resultados antropométricos, con la marca | Pasos 3, 4, 6, 7 y 8 | ✅ Listo (P11). Evolución y rutina, en la Demo 3 |
| RF-38 | Alimentos de la TPCA 2017, medidas de la TAFERA 2016 y listas de intercambio | Paso 1 | ✅ Listo (P8). Ejercicios, en la Demo 3 |

Las E2E de estas pantallas están en verde en escritorio (Chromium) y en celular (iPhone, WebKit): `biblioteca.spec.ts`
(P8), `dieta.spec.ts` (P9), `recetas.spec.ts` y `menu.spec.ts` (P10), y `fichas.spec.ts` y `marca.spec.ts` (P11).

## Antes de empezar (quien presenta)

1. El mismo día, o el anterior, empezar con la base limpia. Esto borra la base local, que solo tiene datos de
   demostración y de pruebas.

   ```bash
   docker compose -f infra/docker/compose.local.yml down -v
   docker compose -f infra/docker/compose.local.yml up -d --wait
   pnpm db:migrate && pnpm db:seed
   pnpm --filter api build && pnpm catalog:load plataforma@demo.example.com
   pnpm dev
   ```

2. Con `pnpm dev` corriendo, en otra terminal:

   ```bash
   pnpm demo:2
   ```

   Crea por la API la prescripción de Luis, la receta y sus dos dietas. Espera a que el worker calcule los resultados
   de Luis, y se puede correr dos veces: lo que ya está no se vuelve a crear. Termina con cuatro líneas «creada».

3. Abrir `http://localhost:3000/entrar` y entrar con `duena@demo.example.com` y `Demostracion-Local-2026`. Esa
   contraseña solo existe en local.
4. Comprobar que la ficha de la dieta por composición baja (paso 4) y que los resultados de Luis ya están (paso 7).
5. Tener a mano el logo para el paso 8. Navegador limpio, zoom al 125 % y este guion en otra pantalla.

## Plan B

- **`pnpm demo:2` dice que falta un alimento o que no pudo prescribir.** Faltan los catálogos (`catalog:load`) o el
  worker no está corriendo: detener y volver a correr `pnpm dev`, y repetir `pnpm demo:2`.
- **Una ficha se queda en «Generando…» más de un minuto.** El worker no está corriendo: volver a correr `pnpm dev`.
  La ficha sale al pedirla de nuevo.
- **Falla el menú en vivo.** El borrador queda guardado: abrirlo desde «Dieta» y seguir. Si no hay tiempo, mostrar la
  ficha de la composición (paso 4), que usa la misma plantilla.
- **Alguien cambió a Luis o la base quedó mal.** Repetir «Antes de empezar»: toma unos 5 minutos.

## Notas para el equipo

- **Ensayo:** el 2026-10-28 se recorrieron los ocho pasos por las pantallas sobre una base nueva, con la semilla y
  bajando cada ficha. Las cifras de este guion salen de ahí.
- **La semilla** (`apps/api/scripts/demo-2.ts`, con los datos de `seeds/luis/demo-2.json`) va por la API para que los
  snapshots, la adecuación y las fichas sean los reales. `test/integration/demo-2.int.spec.ts` la corre dos veces.
- **Botones y pestañas:** los nombres entre comillas son los de las pantallas.
- **Acta:** `docs/actas/demo-2.md` es el borrador para enviar al cliente al terminar. Antes de enviarla, confirmar que
  los nombres de las partes son los del contrato y completar la fecha y la modalidad.
