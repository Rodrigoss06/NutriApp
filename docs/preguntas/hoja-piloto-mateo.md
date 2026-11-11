# Preguntas para Jeremy · hoja piloto «JV Fitness · Mi plan» (Mateo Prueba, octubre de 2026)

Revisamos la hoja con el alumno ficticio Mateo Prueba. Cargamos su mes en la app para la Demo 3 y el control semanal
da lo mismo que tu hoja: descarga en las semanas 1 y 2, y continuar en las semanas 3 y 4.

La hoja trae funciones nuevas que vamos a construir. Para no inventar reglas, necesitamos que nos confirmes estos
puntos. Cada pregunta dice en qué parte de la hoja está y usa los números de Mateo. Basta con responder con la letra
de la opción o con el dato que falta.

Numeración: siguen a las preguntas abiertas P-01 a P-19 de la página 07 de Notion.

## Alimentación por tipo de día

**P-20 · Metas de día de entrenamiento y de descanso** (portada, «Objetivo de alimentación», y microciclo)

En la hoja, el día de entrenamiento tiene 2,500 kcal (proteína 160 g, carbohidratos 310 g, grasa 70 g) y el de
descanso, 2,250 kcal (160 g, 240 g, 70 g). Solo cambian los carbohidratos.

1. ¿Siempre se mantienen fijas la proteína y la grasa, y solo cambian los carbohidratos? ¿O el coach puede cambiar
   cualquier macronutriente en cada tipo de día?
2. Con 4, 4 y 9 kcal por gramo, 160/310/70 da 2,510 kcal y 160/240/70 da 2,230 kcal. ¿Qué manda?
   - a) Las kcal, y los gramos se redondean.
   - b) Los gramos, y las kcal se redondean.
3. Si el alumno falta a una sesión, ese día:
   - a) mantiene la meta de entrenamiento;
   - b) pasa a la de descanso.
4. ¿Hay otros tipos de día, como acondicionamiento o competencia? ¿O solo hay entrenamiento y descanso?
5. ¿Qué pasa con las comidas del plan?
   - a) Es el mismo plan, con menos porciones de almidones o cereales el día de descanso. Dinos en qué comidas.
   - b) Son dos planes de comidas distintos, uno por tipo de día.
   - c) Cambia solo la meta, y el alumno ajusta las porciones.

> **Respuesta de Jeremy (2026-11-08).** La app la sigue desde P14.5 (ADR-100).
>
> 1. La proteína, los carbohidratos y la grasa se editan en cada tipo de día. Al crear el día de descanso se
>    autocompletan la proteína y la grasa del día de entrenamiento.
> 2. b) Mandan los gramos. Mateo: 2,510 kcal el día de entrenamiento y 2,230 el de descanso.
> 3. b) El día pasa a descanso, pero solo cuando el alumno o el coach reprograman la sesión a tiempo:
>    - «no entreno hoy» baja la meta de hoy;
>    - «mover a mañana» cambia hoy a 2,230 kcal y mañana a 2,510;
>    - nunca de forma automática a medianoche, porque quien iba a entrenar de noche ya comió para entrenar.
> 4. Hay más tipos de día: perfiles personalizables, con Entrenamiento y Descanso por defecto, y los que cree el
>    coach con sus gramos (ciclado alto, medio y bajo; refeed; competencia).
> 5. a) Es el mismo plan. En descanso hay menos porciones de almidones o cereales en las comidas de antes y después
>    de entrenar, o entre el almuerzo y la cena. Solo cambia la cantidad del alimento fuente; la proteína y la grasa
>    no cambian.

**P-20.6 · Dónde van los almidones de más en un día alto** (sigue a P-20.4 y P-20.5)

En un plan por intercambios, la app ya sugiere los almidones de cada perfil y el coach los cambia. Para el descanso de Mateo
(240 g en vez de 310 g) faltan 70 g de carbohidratos, unos 5 intercambios de almidones de 15 g. La app los quita primero de
la media tarde, luego de la cena y después del último tiempo del día hacia el primero, como respondiste en P-20.5.

Un perfil alto, un refeed o una competencia pide lo contrario. Si Mateo tiene un día alto con 370 g, son 60 g más: unos 4
intercambios. ¿Dónde los sugerimos?

- a) Repartidos según el porcentaje de cada comida, como se reparte cualquier grupo. La app hace esto por ahora.
- b) En las comidas de antes y después de entrenar: primero la media tarde y luego la cena, como al quitar.
- c) Otra regla. Dinos cuál.

> **Respuesta de Jeremy (2026-11-09).** La app la sigue desde P14.5 (ADR-102).
>
> b), con reparto alternado: +1 en la media tarde, +1 en la cena, y así. Mateo, con 370 g: 2 más en la media tarde y 2 en la
> cena.
>
> - El desayuno, la media mañana y el almuerzo no cambian en toda la semana: solo cambian las comidas de la tarde y la noche.
> - Los almidones de más quedan antes y después de entrenar, para rendir en la sesión y reponer el glucógeno.
> - Al quitar, la media tarde llega a 0 y se pasa a la cena; al sumar no hay ese límite, por eso se alterna. Otra opción es un
>   tope por tiempo (por ejemplo, +2) y el resto hacia atrás, hasta el almuerzo.

## Check-in y registro

**P-21 · Check-in semanal o registro diario** (portada: «completa tu check-in semanal en aproximadamente 2 minutos»)

Hoy la app pide un registro diario corto: sueño, fatiga, dolor, estrés y motivación. El control de la semana usa el
promedio. Tu hoja muestra un solo valor por semana: sueño 6.4 h, estrés 3, fatiga 3, rendimiento 80 % y alimentación
78 % en la semana 1.

- a) Solo un check-in a la semana, por ejemplo el domingo. Dinos qué pregunta y en qué escala.
- b) El registro diario, como hoy. El valor semanal es el promedio.
- c) Las dos cosas: el registro diario, más un check-in semanal con preguntas propias. Dinos cuáles.

> **Respuesta de Jeremy (2026-11-09).** c) El registro diario corto, como hoy (sueño, fatiga, dolor, estrés y motivación), y un
> check-in de 2 minutos el domingo solo con:
>
> - alimentación %, de 0 a 100 %;
> - peso corporal;
> - comentarios.
>
> **Decisiones de Rodrigo (2026-11-10), para el PR 5.** La alimentación sale del registro diario y pasa al check-in del domingo; el
> control semanal toma ese valor y los registros diarios ya guardados se conservan. El check-in se completa del domingo al martes
> siguiente, y los comentarios llegan al coach como una nota sin leer. Por defecto, hasta que Rodrigo diga otra cosa: el peso se
> pide solo si la app permite el peso en casa, y enviarlo otra vez dentro del plazo lo corrige.

**P-22 · De dónde sale el «Rendimiento %»** (informe mensual, «Evolución semanal»: 80, 80, 100 y 100)

- a) Lo declara el alumno.
- b) Lo califica el coach.
- c) Se calcula con las cargas hechas frente a las planificadas. Así lo hace hoy la app cuando la rutina tiene kg y
  repeticiones fijas; si no, usa lo que escribe el alumno.

¿Y el «Alimentación %» lo declara el alumno?

> **Respuesta de Jeremy (2026-11-09).**
>
> - **Rendimiento %:** c) Se calcula con las cargas o las sesiones hechas frente a las planificadas, como hoy. Lo que declara el
>   alumno solo cuenta cuando la rutina no tiene kg ni repeticiones fijas.
> - **Alimentación %:** lo declara el alumno en el check-in del domingo, de 0 a 100 %, como adherencia percibida, salvo que la
>   app ya calcule el porcentaje de comidas marcadas como cumplidas en la semana. La app no marca comidas cumplidas: mide los días
>   con las kcal en rango (RN-G09).

## Panel de fatiga y recuperación

**P-23 · Cuándo es ámbar** (panel, línea «LECTURA»)

La hoja dice cuándo es rojo, pero no cuándo es ámbar:

- **Recuperación roja:** estrés de 4 o más, o sueño de menos de 6 h.
- **Carga roja:** volumen más de 30 % sobre el promedio de las 3 semanas previas.

Con Mateo:

- **Recuperación:**
  - semana 1 (estrés 3, sueño 6.4 h): ámbar;
  - semana 3 (estrés 3, sueño 7.1 h): ámbar;
  - semana 4 (estrés 2, sueño 7.4 h): verde.
- **Carga:**
  - semana 3, con 18 % sobre su promedio: ámbar;
  - semana 2, con 5 %: verde.

Necesitamos los umbrales exactos de ámbar:

1. **Recuperación:** ¿estrés 3? ¿Y con qué sueño, por ejemplo menos de 7 h?
2. **Carga:** ¿más de 10 % o más de 15 % sobre el promedio?
3. **Fatiga percibida:** ¿3?

> **Respuesta de Jeremy (2026-11-09).**
>
> 1. **Recuperación ámbar:** estrés 3, o sueño de 6.0 h a menos de 7.0 h, mientras nada esté en rojo. La semana 3 de Mateo
>    (estrés 3, sueño 7.1 h) es ámbar por el estrés, aunque duerma más de 7 h.
> 2. **Carga ámbar:** más de 15 % y hasta 30 % sobre el promedio. Con los datos de Mateo sirven 10 % y 15 % (5 % verde y 18 %
>    ámbar), pero 15 % deja pasar una sobrecarga progresiva normal de 8 a 12 % sin falsas alertas.
> 3. **Fatiga percibida,** de 1 a 5: verde 1 o 2, ámbar 3 y roja 4 o 5, igual que el estrés.
>
> **Decisión de Rodrigo (2026-11-10), para el PR 3.** La app promedia el registro diario de la semana: los promedios se comparan
> por rangos, sin redondear. Menos de 3.0 es verde, de 3.0 a menos de 4.0 es ámbar y 4.0 o más es rojo, en el estrés y en la
> fatiga. Redondear antes haría que un 2.6 dispare un ámbar falso.

**P-24 · Estado general** (panel, columna «Estado general»)

¿El estado general es el peor de los tres: recuperación, carga y fatiga percibida? En la semana 1, la carga no tiene
base («SIN BASE») y la recuperación es ámbar, y el estado general sale ámbar. ¿«Sin base» cuenta como verde? ¿El
promedio de 3 semanas ignora las semanas sin datos? Por ejemplo, la semana 6 da (6,336 + 3,375) ÷ 2 = 4,855.5.

> **Respuesta de Jeremy (2026-11-09).**
>
> 1. Sí: el estado general es el peor de los tres. Rojo manda sobre ámbar, y ámbar sobre verde.
> 2. «Sin base» cuenta como verde: no suma alerta, y deciden las métricas que tienen datos. En la semana 1 manda el ámbar de la
>    recuperación.
> 3. El promedio de 3 semanas ignora las semanas sin datos, en la suma y en el divisor: la semana 6 da (6,336 + 3,375) ÷ 2 =
>    4,855.5.

**P-25 · Panel frente al control semanal**

- En la semana 2, el panel sale rojo y el control dice «Descarga 20–30 % y revisar».
- En la semana 3, el panel sale ámbar y el control dice «Continuar plan».

Cuando no coinciden:

- a) El panel solo informa y decide el control semanal.
- b) El panel cambia la decisión de la semana. Si es así, dinos cómo.

> **Respuesta de Jeremy (2026-11-09).** a) El panel solo informa y decide el control semanal. En la semana 3, el panel ámbar avisa
> de fatiga o de carga, y el control dice «Continuar plan» porque el rendimiento de Mateo subió a 100 %. Así hay un solo motor de
> decisión: la descarga la prescribe el control semanal.

## Volumen ajustado y fatiga por músculo

**P-26 · Tablas de factores** (registro de cargas: «Factor RIR», «Cadencia», «Factor descanso», «Ejecución»)

El volumen ajustado de la hoja es volumen × factor RIR × factor descanso. Por ejemplo, 3 × 12 × 45 kg = 1,620; con
RIR 2, por 1.1, da 1,782. Solo vemos algunos valores: RIR 2 = 1.1, RIR 3 = 1.0, RIR 4 = 0.9 y 120 s = 1.

1. Necesitamos la tabla completa del factor RIR, de RIR 0 a RIR 5 o más.
2. Necesitamos la tabla completa del factor descanso: 45, 60, 75, 90, 120, 180 s…
3. ¿La cadencia (3-1-1) o la ejecución («Buena») cambian el volumen?
4. ¿Cómo cuentan los ejercicios sin peso, como el peso corporal, el cardio o la movilidad?

> **Respuesta de Jeremy (2026-11-10).**
>
> 1. **Factor RIR:** 1.0 + (3 − RIR) × 0.1. RIR 0 = 1.3, RIR 1 = 1.2, RIR 2 = 1.1, RIR 3 = 1.0, RIR 4 = 0.9, y RIR 5 o más = 0.8.
> 2. **Factor descanso:** 45 s = 1.15, 60 s = 1.10, 75 s = 1.05, 90 s = 1.00, 120 s = 1.00, y 180 s o más = 0.95. Con 90 y
>    120 s en 1.00 cuadra el ejemplo: 1,620 × 1.1 = 1,782.
> 3. La cadencia y la ejecución no cambian el volumen: son indicadores técnicos para que el coach decida si mantiene o sube la
>    carga la semana siguiente.
> 4. **Ejercicios sin peso:**
>    - la movilidad, las isometrías por tiempo y el cardio aportan 0 kg de volumen y solo cuentan para cumplir la sesión;
>    - la calistenia y el peso corporal suman sus series efectivas al grupo muscular, y tonelaje solo si registran lastre.
>
> **Respuesta (2026-11-11, por Rodrigo), para lo que la tabla no traía:**
>
> - un descanso entre dos filas toma el escalón inferior: 150 s = 1.00, el de 120 s. Escrito por tramos: hasta 45 s = 1.15,
>   de 46 a 60 s = 1.10, de 61 a 75 s = 1.05, de 76 a 179 s = 1.00 y 180 s o más = 0.95. Entre 46 y 89 s los tramos y el
>   escalón inferior no daban lo mismo: valen los tramos (Rodrigo, 2026-11-11). 50 s = 1.10, 70 s = 1.05 y 80 s = 1.00;
> - menos de 45 s (30 s) = 1.15, como 45 s;
> - una serie con RPE y sin RIR: RIR = 10 − RPE, entre 0 y 5. RPE 8 = RIR 2 = 1.1. Con decimal, la fórmula de Jeremy
>   (Rodrigo, 2026-11-11): RPE 8.5 = RIR 1.5 = 1.15. Lo sigue el motor 1.14.0 (ADR-113).

**P-27 · Fatiga por grupo muscular** (panel, «Fatiga por grupo muscular»)

1. Necesitamos los coeficientes de cada ejercicio, o de cada patrón: fatiga muscular, fatiga neural, carga axial y
   demanda técnica. También la fórmula de «Recuperación est.», de «Fatiga entrenamiento» y del «Estado».
2. En la semana 5, «Base 3 sem.» trae Pecho 1,461.6 y Tríceps 312.2, pero Dorsal y Cuádriceps están vacíos, aunque
   Mateo hizo jalón al pecho y sentadilla. ¿Esos dos ejercicios no están en tu tabla de coeficientes?
3. ¿Usamos tus 17 grupos (Pecho, Dorsal, Trapecio, … Abductor) en el panel y en las series ponderadas? ¿El ejercicio
   secundario vale 0.5, como hoy en la app?

> **Respuesta de Jeremy (2026-11-10).**
>
> 1. **Coeficientes por patrón de movimiento,** no por ejercicio (fatiga muscular, fatiga neural, carga axial y demanda
>    técnica):
>    - compuestos de pierna y cadera (sentadilla, peso muerto): 1.2, 1.3, 1.3 y 1.2;
>    - compuestos libres de torso (press banca, remo, dominadas): 1.1, 1.1, 1.0 y 1.1;
>    - compuestos guiados y poleas (jalón, prensa): 1.0, 1.0, 0.8 y 0.9;
>    - aislamiento y brazos: 0.9, 0.7, 0.5 y 0.8;
>    - movilidad y cardio: 0.
>      **Fórmulas:**
>    - «Fatiga entrenamiento» es el volumen ajustado del grupo, ponderado: 1.0 el músculo primario y 0.5 el secundario;
>    - el «Estado» lo compara con «Base 3 sem.» con los umbrales de P-23: verde hasta +15 %, ámbar de +15 % a +30 % y rojo más
>      de +30 %;
>    - «Recuperación est.»: 48 h en verde, 60 h en ámbar y 72 h en rojo.
> 2. Fue un error de nombres en la fórmula del Excel: en la app, el jalón al pecho va a Dorsal y la sentadilla a Cuádriceps.
> 3. Sí: los 17 grupos de la app, con 1.0 el primario y 0.5 el secundario. Así salen los promedios de «Base 3 sem.», como
>    Pecho 1,461.6 y Tríceps 312.2.
>
> **Decisión de Rodrigo (2026-11-11), para el PR 4.** Vale la regla de 1.0 para el primario y 0.5 para el secundario, sin
> coeficientes por ejercicio: un ejercicio nuevo no necesita sus propios decimales. Con Mateo, la «Base 3 sem.» de la semana 5
> sale del press banca de las semanas 2 a 4 (1,419): Pecho 1,419 y Tríceps 709.5, no los 1,461.6 y 312.2 de la hoja, que salen
> de otros coeficientes (1.03 y 0.22).

## Informe mensual

**P-28 · Cómo se arma y quién escribe**

1. ¿El informe es por mes calendario (período 202610) o por mesociclo de 4 semanas? Las semanas de Mateo van del 06/10
   al 02/11.
2. Los textos «Logro principal», «Limitante», «Ajuste principal» y «Prioridad siguiente», ¿los escribe el coach? ¿El
   «Comentario del alumno» lo escribe el alumno desde la app?
3. ¿Qué estados tiene el informe? Por ejemplo: borrador, por revisar y enviado. ¿El alumno lo ve en la app y en PDF?
   Ten en cuenta que sería una sexta ficha PDF: el contrato tiene cinco.

> **Respuesta (2026-11-10, por Rodrigo).** Por mesociclo de 4 semanas. El coach escribe Logro, Limitante, Ajuste y Prioridad, y el
> alumno escribe su Comentario desde la app. Estados: Borrador y Enviado. Solo como vista en la app, sin sexta ficha PDF, para
> respetar las cinco fichas del contrato.

**P-29 · Números del informe**

1. **Volumen cumplido:** la hoja dice 95.2 %, pero las series dan 223 de 240 (92.9 %), y la semana 1, 56 de 60
   (93.3 %). ¿Cómo se calcula?
2. **PR:** la columna dice 1 en la semana 1 y nada después, aunque las cargas subieron en las semanas 2 y 3. ¿Qué cuenta
   como récord? Por ejemplo, un 1RM estimado más alto que el anterior en el mismo ejercicio.
3. **Series planificadas** (60, 64, 68 y 48): ¿salen de la rutina completa? El registro de cargas trae un solo ejercicio
   por sesión.

> **Respuesta (2026-11-10, por Rodrigo).** Volumen cumplido = series hechas ÷ series planificadas (223 ÷ 240 = 92.9 %). Un PR es un
> 1RM estimado más alto que el anterior en el mismo ejercicio (en la hoja fue un ejemplo incompleto). Las series planificadas
> salen de la rutina completa de la semana.

**P-30 · Fotos de progreso** («Comparativa fotográfica»)

1. ¿Las sube el alumno desde la app, el coach desde el panel, o los dos?
2. ¿Son tres vistas, frontal, lateral y posterior, en cada evaluación o una vez al mes?
3. Las fotos del cuerpo son datos sensibles. Proponemos un consentimiento propio, con el texto de tu abogado. ¿De
   acuerdo? ¿Cuánto tiempo se guardan?

> **Respuesta (2026-11-10, por Rodrigo).** Las suben los dos, alumno y coach: tres vistas (frontal, lateral y posterior) en cada
> cierre de mesociclo de 4 semanas. Sí al consentimiento propio de datos sensibles. Se guardan mientras la cuenta esté activa y 12
> meses después de la baja, o se borran si revoca.
>
> **Rodrigo (2026-11-11):** el texto del consentimiento de las fotos:
>
> «Autorizo de manera libre, previa y expresa la carga, almacenamiento y visualización de mis fotografías corporales de progreso
> en la plataforma, con la única finalidad de que mi entrenador realice el seguimiento de mi evolución física. Estas imágenes son
> estrictamente confidenciales, no se compartirán con terceros ni se usarán con fines comerciales, y se conservarán únicamente
> mientras mi expediente esté activo o hasta que revoque este consentimiento.»
>
> Por aclarar antes del PR 6b: el texto dice que se conservan mientras el expediente esté activo; la respuesta de arriba suma 12
> meses después de la baja.

## Documentos, asistencias y prescripción

**P-31 · Expediente de documentos y evidencias** («Expediente de Mateo Prueba · enlaces seguros, sin duplicar archivos»)

1. ¿La app guarda los archivos (subidos a la app) o solo enlaces a donde ya están, como Google Drive?
2. ¿Las 8 categorías son fijas o el coach puede agregar? (Administrativo, Clínico, Progreso, Evaluación APECS, Técnica,
   Seguimiento, Evaluaciones físicas y Reporte.)
3. ¿Qué estados hay además de «Pendiente»?
4. Los videos de técnica serían enlaces: la app acepta archivos de hasta 5 MB.

> **Respuesta (2026-11-10, por Rodrigo).** Enlaces externos, y archivos directos solo hasta 5 MB con el soporte que ya existe; los
> videos, siempre por enlace. Las 8 categorías son fijas. Estados: Pendiente, Por revisar y Validado.

**P-32 · Asistencias** («Asistencias · solo consulta»)

1. La hoja dice: «el registro oficial, los saldos, las renovaciones y las congelaciones se gestionan únicamente desde
   el panel central». ¿El «panel central» es esta plataforma o es otro sistema?
2. Los saldos, las renovaciones y las congelaciones de paquetes de sesiones no están en el contrato, y los pagos
   quedan fuera. ¿Los necesitas?
3. «Evento calendario» y «Enlace del evento», ¿son de Google Calendar? El calendario de la app llega en la etapa
   siguiente, con citas y sus estados.

> **Respuesta (2026-11-10, por Rodrigo).**
>
> 1. El «panel central» es el panel del coach en esta misma plataforma; para el alumno, la tabla es de solo consulta.
> 2. No se necesitan saldos, renovaciones, congelaciones ni pagos: no están en el contrato. Solo se registra la asistencia a las
>    sesiones.
> 3. No hace falta integrar Google Calendar: lo cubren el calendario propio de la app y sus citas en P15, o una URL externa
>    opcional, sin sincronizar.

**P-33 · Dos datos de Mateo que no cuadran**

1. **Sesión del 22/10:** el registro de cargas trae la sentadilla de la semana 3 (3 × 12 × 65 kg). Pero en asistencias
   el 22/10 es «AUSENTE», y el informe cuenta 2 sesiones esa semana. ¿Cuál vale? Si fue ausencia, el volumen ajustado
   de la semana 3 baja de 6,336 a 3,762, y la carga pasa de ámbar a verde. En la demo seguimos la asistencia.
2. **Días de las sesiones:** el microciclo pone Full Body A, B y C en lunes, miércoles y viernes. Pero las fechas de
   asistencia son martes, jueves y sábado (06/10, 08/10, 10/10…). En la demo seguimos las fechas.

> **Respuesta de Jeremy (2026-11-10).**
>
> 1. Manda la asistencia: una sesión ausente no suma tonelaje. Pero el 6,336 de la semana 3 que citan P-23 y P-24 incluye esa
>    sentadilla. Para conservar el ejemplo en ámbar (+18 %), el 22/10 pasa a «ASISTIÓ» en la semilla; si queda «AUSENTE», la
>    semana baja a 3,762 y sale verde.
> 2. Mandan las fechas reales (martes, jueves y sábado), como ya hace la demo. «Lunes, miércoles y viernes» es texto fijo de
>    la plantilla.
>
> **Decisión de Rodrigo (2026-11-10), para el PR 3.** El 22/10 pasa a «ASISTIÓ» en `demo:3`: la semana 3 de Mateo tiene 3
> sesiones, 5,760 kg de tonelaje y 6,336 de volumen ajustado, y el panel sale ámbar (+18 %), como en la hoja.

**P-34 · Plantilla de la prescripción** («Prescripción de rutina»)

1. La hoja dice «Días / semana: 3» y «División sugerida: FULL BODY / TORSO-PIERNA», pero trae 5 sesiones: Superior A,
   Inferior A, Acondicionamiento, Superior B e Inferior B. ¿Qué división va con 3, 4 y 5 días?
2. ¿Cuántos bloques lleva cada sesión: 5, como en la hoja, u 8, como en la plantilla V3?
3. Hay patrones nuevos, que necesitan su ejercicio por nivel:
   - movilidad de hombro y movilidad torácica;
   - estabilidad lumbar, antirrotación y tronco antiextensión;
   - cardiorrespiratorio y brazos.
4. ¿«10–12/lado» son repeticiones por lado? ¿«20–30 s/lado» es una isometría por tiempo?
5. ¿El tempo (3-1-1 en los principales, 2-1-2 en los demás) y el descanso (120 s en los principales de pierna, 90, 75,
   60 y 45 s) son los valores base de cada patrón?
6. ¿Qué significan el RIR 4 de la movilidad y el RIR 5 del cardio?

> **Respuesta de Jeremy (2026-11-10).**
>
> 1. 3 días: Full Body A, B y C. 4 días: torso-pierna (Superior A, Inferior A, Superior B, Inferior B). 5 días: lo mismo más
>    Acondicionamiento, las 5 tablas de la hoja.
> 2. Hasta 8 bloques, como la V3, y por defecto se muestran los 5 de la hoja, sin los vacíos.
> 3. Ejercicios por nivel (básico, intermedio y avanzado):
>    - movilidad de hombro: dislocaciones con banda, rotación externa en polea, CARs de hombro;
>    - movilidad torácica: open book en el suelo, extensión en foam roller, rotación en cuadrupedia;
>    - estabilidad lumbar: bird-dog, puente glúteo unilateral, hip thrust o extensión isométrica;
>    - antirrotación: press Pallof isométrico, press Pallof dinámico, press Pallof en split stance;
>    - tronco antiextensión: plancha frontal, dead bug, rueda abdominal;
>    - cardiorrespiratorio: caminata inclinada Z2, remo o bici constante, intervalos en AirBike o remo;
>    - brazos: curl con mancuerna y tríceps en polea, curl con barra Z y press francés, curl inclinado y extensión tras nuca.
> 4. «10–12/lado» son repeticiones por lado y «20–30 s/lado», una isometría en segundos por lado.
> 5. Sí: los tempos (3-1-1 y 2-1-2) y los descansos (120, 90, 75, 60 y 45 s) son los valores base de cada patrón.
> 6. El RIR 4 y el RIR 5 de la movilidad y el cardio solo indican un esfuerzo suave (RPE 5 a 6) y no cambian el volumen.
>
> **Decisiones de Rodrigo (2026-11-10), para el PR 9.** Con 3 días se usa la plantilla de cuerpo completo A, B y C de la V3. Los
> ejercicios nuevos se cargan como provisionales, con valores estándar, hasta que Jeremy los valide. «Brazos» va en dos bloques,
> Bíceps y Tríceps, como hoy en la app. El bird dog pasa al patrón de estabilidad lumbar, como en la lista de Jeremy.
>
> **Decisiones de Rodrigo (2026-11-11), para el PR 9b.**
>
> - Con 5 días, la división de Jeremy: Superior A, Inferior A, Superior B, Inferior B y Acondicionamiento. Cambia RN-F14 y el
>   caso dorado G-31 (empuje, tracción y pierna) en Notion.
> - «Flexión de rodilla» y «Extensión de rodilla» son dos patrones nuevos, cada uno con su ejercicio por nivel.
> - El tempo y el descanso salen del patrón, como en la tabla de Jeremy, y no los fijos de RN-F14 (2-1-2 y 90 s): cambia RN-F14
>   en Notion.
>
> **Por confirmar con Jeremy (ADR-112):**
>
> 1. Los ejercicios por nivel de la flexión y de la extensión de rodilla. Mientras tanto, el curl femoral en máquina y la
>    extensión de rodilla en máquina, en los tres niveles.
> 2. Las series y las repeticiones de cada bloque. La hoja da 3 series a los primeros bloques y 2 a los accesorios, y rangos
>    distintos: curl femoral 10–15, pantorrilla 12–15, hombro 12–15. ¿Son valores base de la propuesta? Por ahora sigue
>    3 × 8–12, como RN-F14.
>
> **Respuesta (2026-11-11, por Rodrigo):** de acuerdo con las dos, por ahora: la máquina en los tres niveles de rodilla y
> 3 × 8–12.

## Otros

**P-35 · «Seguimiento asistido por WhatsApp»** (macrociclo, fila «Revisión», semanas 1 a 8)

La V3 decía «Seguimiento diario» y «Control y ajuste». ¿Es un tipo de revisión nuevo, en el que el coach acompaña por
WhatsApp fuera de la app? La app no se integra con WhatsApp; sí podemos mostrar la etiqueta y un botón que abra el chat.

> **Respuesta de Jeremy (2026-11-10).** Sí, es una modalidad de acompañamiento: la etiqueta en el macrociclo y un botón que abra
> el chat del alumno con un enlace wa.me, sin integrar ninguna API de mensajería.

**P-36 · «La rutina se prescribe en Nutriplace»** (microciclo, «Uso»)

¿«Nutriplace» será el nombre de esta plataforma? Hoy usamos «NutriCoach» como nombre de trabajo. ¿O es otra herramienta
que usas?

> **Respuesta de Jeremy (2026-11-10).** Es la misma plataforma: «Nutriplace» era otro nombre comercial en la hoja. Se mantiene
> «NutriCoach» en el sistema.

**P-37 · Semanas 9 a 12 y momento de la descarga**

1. En la hoja, el mesociclo 3 (semanas 9 a 12) está vacío. La V3 trae Descarga, Consolidación, Consolidación y
   Transición/retest. ¿Seguimos la V3?
2. Las semanas 1 y 2 dicen «Descarga», pero la descarga se aplicó en la semana 4 («Se aplicó descarga en la cuarta
   semana»), y la semana 4 de la V3 es «Progresar». ¿La descarga se aplica en la semana siguiente a la decisión o
   cuando el coach elige? En la app, la decisión del coach crea la versión de las semanas que siguen.

> **Respuesta de Jeremy (2026-11-10).**
>
> 1. Sí: el mesociclo 3 sigue la V3 (Descarga, Consolidación, Consolidación y Transición/retest).
> 2. La descarga se aplica en la semana siguiente a la decisión del coach, como hoy en la app. Con Mateo, la alerta saltó en
>    las semanas 2 y 3, y la reducción de volumen se hizo en la semana 4 (3,375).
