# Demo 1 · Base y evaluación — guion

- **Para:** Jeremy. Unos 20 minutos, más preguntas.
- **Qué se acepta:** RF-01 a RF-06 y RF-08 a RF-17 (Notion 04, «Aceptación por demo»). RF-18, los macronutrientes,
  se adelantó desde la Demo 2 y también se ve.
- **Prueba de aceptación:** el recorrido con Luis. Sus números coinciden con los casos dorados de la página 03 de
  Notion (G-01 a G-17).

> **Aviso:** la demo se hace en una computadora local, con datos de demostración. El servidor de pruebas (staging)
> queda pendiente de la cuenta de Hetzner a nombre de Jeremy; cuando exista, la misma demo corre allí con la
> versión v0.1.0.

## Cómo leer las cifras

- Cada número aparece con el método que lo calculó, y cada interpretación con su fuente (OMS, ACE, NICE…).
- La pantalla redondea solo al mostrar (RN-D09): masas y porcentajes con 1 decimal; cintura/talla, cintura/cadera,
  ETM, CMD95 y superficie corporal con 2; kcal y gramos enteros (ADR-049). La interpretación usa siempre el valor
  completo.
- En las tablas, la columna **Caso dorado** trae el valor exacto de la página 03. Si coincide con la pantalla al
  redondear, el cálculo está bien.
- Luis y Ana son pacientes inventados: ningún dato es de una persona real.

## Qué trae la demo

| Quién | Qué tiene |
|---|---|
| Consultorio Demo | Plan «Tramo 5 (provisional)»: 5 pacientes activos y 2 profesionales |
| Dueña Demo | Dueña y nutricionista. Evalúa a Luis y tiene su estudio de ETM de hace 90 días |
| Profesional Demo | Profesional de entrenamiento. No está en el equipo de Luis ni en el de Ana |
| Luis | 28 años, adulto. Registrado hace 5 semanas, con consentimiento e historia. Dos evaluaciones ISAK 2: una de hace 4 semanas y otra de hoy, que incluye una lectura de bioimpedancia |
| Ana | 34 años, adulta. Tiene ficha, consentimiento e historia, sin evaluaciones: con ella se mide en vivo |

## 1 · Entrar y ver la organización (RF-01 a RF-03) · 2 min

**Qué se hace**

1. En la página de entrada, entrar como la dueña.
2. Menú «Organización»: «Datos», «Suscripción y cupo», «Miembros» e «Invitaciones pendientes».
3. Invitar a una tercera profesional, con cualquier correo: el sistema no lo permite.

**Qué decir**

- Solo entra quien fue invitado. Cada persona elige su contraseña y nadie más la conoce.
- El plan fija los límites: aquí, 5 pacientes activos y 2 profesionales. Archivar a un paciente libera cupo.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| Plan «Tramo 5 (provisional)», estado activo y un año de vigencia | RF-03 |
| Uso del cupo: «Pacientes activos: 2 de 5» y «Profesionales: 2 de 2» | RN-A03 |
| Miembros: Dueña Demo (dueña) y Profesional Demo (profesional) | RF-02 |
| Al invitar: «El plan permite 2 profesionales y ya están todos los cupos ocupados.» | RN-A03 |

## 2 · Luis: ficha, consentimiento, historia y expediente (RF-05, RF-08 a RF-10) · 3 min

**Qué se hace**

1. Menú «Pacientes»: escribir «luis» en el buscador. También encuentra sin tildes.
2. Abrir su ficha: datos, equipo de atención y acceso a la app (todavía sin invitar).
3. Pestañas «Consentimientos», «Historia clínica» y «Línea de tiempo».

**Qué decir**

- Sin el consentimiento de datos de salud no se guarda nada clínico (RN-B01). Si el paciente lo revoca, no se puede
  registrar nada nuevo.
- La historia no se sobrescribe: cada cambio crea una revisión.
- Todo lo de Luis queda en una sola línea de tiempo.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| Luis Ejemplo Sintético · P-000001 · 28 años · Adulto | RF-08 |
| Equipo de atención: Dueña Demo, «Responsable», «Lectura y escritura» | RN-A05 |
| «Datos de salud», versión 0.1 (provisional), «En consulta, digital», otorgado hace 5 semanas | RF-05 |
| Historia clínica, revisión 1: alimentación, actividad física, sueño y objetivos | RF-09 |
| Línea de tiempo: alta, consentimiento e historia (hace 5 semanas); evaluación (hace 4 semanas); evaluación (hoy) | RF-10 |

## 3 · Captura en vivo con Ana: tercera toma, cierre y enmienda (RF-11, RF-14) · 4 min

Se mide a Ana para que los números de Luis no cambien.

**Qué se hace**

1. Abrir la ficha de Ana (P-000002) → «Nueva evaluación». Nivel «Básico». Condiciones: en ayunas, sin actividad
   intensa en las últimas 24 horas, hidratación «Normal».
2. Escribir las dos tomas de cada sitio:

   | Sitio | Tomas | Consolidado en pantalla |
   |---|---|---|
   | Peso | 58.4 y 58.4 | 58.4 kg |
   | Talla | 160.0 y 160.2 | 160.1 cm |
   | Cintura | 72.5 y 72.7 | 72.6 cm |
   | Cadera | 96.0 y 96.2 | 96.1 cm |

3. «Agregar sitio» → pliegue del tríceps como sitio extra:
   - tomas 12.0 y 12.4;
   - luego cambiar la segunda toma a 13.0: el sistema pide una tercera;
   - tercera toma 12.6.
4. «Cerrar evaluación». En unos segundos aparecen los resultados.
5. «Enmendar», con el motivo «Peso mal digitado: la balanza marcaba 59.4 kg.». Se abre la revisión 2 con las mismas
   tomas. Cambiar el peso a 59.4 y 59.4, y cerrarla.

**Qué decir**

- La diferencia entre tomas se revisa al momento: más de 5 % en pliegues, o más de 1 % en el resto, exige una tercera
  toma (RN-C02). Con dos tomas vale el promedio; con tres, la del medio (RN-C03).
- Con una tercera toma pendiente no se puede cerrar.
- Una evaluación cerrada no se edita: se enmienda con motivo, y lo anterior queda como histórico (RN-C07).

**Qué debe aparecer**

| En pantalla | Caso dorado | Regla |
|---|---|---|
| Tríceps 12.0 y 12.4: diferencia 3.3 %, sin tercera toma, consolidado 12.2 mm | G-01: 3.33 %, 12.2 mm | RN-C02, RN-C03 |
| Tríceps 12.0 y 13.0: diferencia 8.3 %, pide tercera toma | G-02: 8.33 % | RN-C02 |
| Con la tercera, 12.6: consolidado 12.6 mm, la del medio | G-03: 12.6 mm | RN-C03 |
| IMC 22.8, «Normal», fuente OMS | — | RN-D10 |
| Cintura/talla 0.45, «Sin riesgo aumentado», fuente NICE (2022) y Ashwell y Gibson (2016) | — | RN-D10 |
| Cintura/cadera 0.76, «Sin obesidad abdominal», fuente OMS | — | RN-D10 |
| Cintura 72.6 cm, «Sin riesgo aumentado», fuente OMS 2008 | — | RN-D10 |
| Los demás métodos figuran como no disponibles por el nivel: piden ISAK 1 o ISAK 2 | — | RN-C01 |
| Tras la enmienda: revisión 2 vigente con IMC 23.2, «Normal»; la original queda «Enmendada», con sus resultados como histórico | — | RN-C07 |

## 4 · Las evaluaciones ISAK 2 de Luis (RF-12, RF-13, RF-15, RF-16) · 5 min

**Qué se hace**

1. En la ficha de Luis, abrir «Evaluaciones»: la de hoy (ISAK 2 con bioimpedancia) y la de hace 4 semanas (ISAK 2).
2. Abrir la de hoy: los 42 sitios con sus tomas y la lectura de bioimpedancia.
3. Abrir sus resultados.
4. Pedir el peso objetivo con 15 % de grasa.
5. Mostrar los métodos por población de la organización y los de Luis.
6. Mostrar el ETM de la evaluadora (Dueña Demo).

**Qué decir**

- Los tres métodos de % de grasa dan números distintos y caen en tres categorías de la misma tabla ACE. Por eso cada
  número lleva su método (RN-D02). Para un adulto, el principal es Durnin & Womersley + Siri.
- Faulkner y Yuhasz se calculan, pero con un aviso: se validaron en otras poblaciones (RN-D06).
- Jackson & Pollock de 7 pliegues no se ofrece: le faltan tres pliegues de su propio protocolo (RN-D04).
- La bioimpedancia se muestra con la marca y el modelo del equipo. Su % de grasa no se mezcla con el de pliegues: son
  métodos distintos (RN-C08).
- Los métodos por defecto dependen de la población: el de un deportista no es el de un adulto. La organización los
  cambia, y también se pueden cambiar para un paciente. Cambiar un método no recalcula nada en silencio (RN-D08).
- El ETM mide qué tan repetible es la evaluadora. Con él se calcula el CMD95, que separa un cambio real del ruido de
  la medición.

**Qué debe aparecer: resultados de hoy**

| En pantalla | Caso dorado |
|---|---|
| IMC 26.1, «Sobrepeso» (OMS) | G-05: 26.12 |
| Cintura/talla 0.49, «Sin riesgo aumentado» (NICE 2022; Ashwell y Gibson 2016) | G-05: 0.491 |
| Cintura/cadera 0.88, «Sin obesidad abdominal» (OMS) · cintura 86.0 cm, «Sin riesgo aumentado» (OMS 2008) | G-05: 0.88 |
| Durnin & Womersley + Siri (principal): suma de 4 pliegues 56.0 mm, densidad 1.05261, grasa 20.3 % «Promedio» (ACE), masa grasa 16.2 kg, masa libre de grasa 63.8 kg | G-06: 56; 1.05261; 20.26 %; 16.21; 63.79 |
| Faulkner: 16.0 % «Fitness» (ACE), suma 67.0 mm, con aviso | G-07: 16.03 %, 67 mm |
| Yuhasz: 12.6 % «Atlético» (ACE), suma de 6 pliegues 95.0 mm, con aviso | G-07: 12.57 %, 95 mm |
| Jackson & Pollock 7: no disponible, faltan pectoral, axilar medio y suprailíaco | RN-D04 |
| 4 componentes: ósea 12.0 kg (Rocha 1975), residual 19.3 kg (Würch 1974), muscular 32.5 kg (por diferencia), grasa 16.2 kg (Durnin & Womersley + Siri) | G-08: 12.02; 19.28; 32.49 |
| Lee: perímetro de brazo corregido 29.2 cm, masa muscular esquelética 32.6 kg | G-09: 29.23; 32.58 |
| Kerr: superficie corporal 1.86 m², piel 4.0 kg, adiposa 23.4 kg (Z −0.69), muscular 35.9 kg (Z 1.58), ósea 8.7 kg (cabeza 1.3 + cuerpo 7.4), residual 9.5 kg (Z 2.44) | G-10: 1.8599; 4.04; 23.44 (−0.691); 35.92 (1.58); 8.722 (1.325 + 7.397); 9.46 (2.44) |
| Kerr: masa estructurada 81.6 kg, +2.0 % sobre el peso, sin aviso (el aviso sale sobre 5 %) | G-10: 81.59, +1.98 % |
| Proporcionalidad: índice córmico 52.0, Manouvrier 92.3, acromio-ilíaco 71.3 | G-11: 52.0; 92.31; 71.25 |
| Peso objetivo con 15 % de grasa: 75.1 kg, perder 4.9 kg (con la masa libre de grasa de Durnin & Womersley + Siri) | G-12: 75.05; 4.95 |

**Qué debe aparecer: bioimpedancia, métodos y ETM**

| En pantalla | Caso dorado o regla |
|---|---|
| «Marca Demo · BIA-200»: grasa corporal 18.4 %, masa grasa 14.7 kg, masa libre de grasa 65.3 kg, masa muscular 62.0 kg, agua corporal total 47.8 L, grasa visceral 6 (nivel), ángulo de fase 7.1° | RN-C08 |
| Adulto: % de grasa Durnin & Womersley + Siri, músculo Lee, hueso Rocha. Deportista: Yuhasz, Kerr y Rocha. Niños, adolescentes y obesidad: sin ecuación de pliegues por defecto | RN-D05 |
| Luis usa los de su población (Adulto), sin cambios propios | RF-16 |
| ETM de Dueña Demo en los 6 pliegues: 0.37 mm (2.35 %), CMD95 1.04 mm | G-04: 0.374 mm (2.35 %), 1.04 mm |

**Si sobra tiempo:** elegir Yuhasz como método de % de grasa de Luis. Sus números no cambian; solo cambia cuál es el
principal. Antes del paso 6, volver a «el de la organización»: la energía usa la masa libre de grasa del método
principal.

## 5 · Comparación con la evaluación anterior (RF-15, RN-C06) · 2 min

**Qué se hace**

En la evaluación de hoy, «Comparar con la anterior».

**Qué decir**

- Un cambio menor que el CMD95 de la evaluadora no se distingue del error de medición: «sin cambio significativo».
- Solo se compara un método consigo mismo. El 20.3 % de hoy se compara con el 21.3 % de Durnin & Womersley + Siri,
  nunca con el de Yuhasz ni con el del equipo de bioimpedancia (RN-D03).
- Ambas evaluaciones se hicieron con la misma evaluadora y a la misma hora, en ayunas, así que no hay aviso. Si
  cambiaran, el sistema lo advertiría (RN-C09).

**Qué debe aparecer**

| En pantalla | Caso dorado o regla |
|---|---|
| Suma de 6 pliegues: de 101.9 a 95.0 mm, −6.9 mm frente a un CMD95 de 6.18 mm: cambio real | G-04: 95 mm, CMD95 6.18 mm |
| Tríceps, subescapular y supraespinal: −1.5 mm frente a un CMD95 de 0.78 mm: cambio real | RN-C06 |
| Abdominal −1.5 mm (CMD95 1.96), muslo anterior −0.6 mm (0.78) y pantorrilla −0.3 mm (0.39): sin cambio significativo | RN-C06 |
| Bíceps y cresta ilíaca: sin ETM, no se puede saber si el cambio es real | RN-C06 |
| % de grasa por método: Durnin & Womersley + Siri de 21.3 a 20.3 %; Faulkner de 17.0 a 16.0 %; Yuhasz de 13.3 a 12.6 % | RN-D03 |
| Sin avisos de condiciones: la misma evaluadora y la misma hora | RN-C09 |

**Si preguntan por la cintura/talla:** hace 4 semanas era 0.50, exactamente la mitad de la talla: «Riesgo
aumentado» según NICE. Hoy es 0.49, «Sin riesgo aumentado». La interpretación sigue a la fuente. Pero la cintura
bajó solo 1.5 cm, y sin un ETM de perímetros no se puede decir que el cambio sea real.

## 6 · Energía y macronutrientes (RF-17; RF-18 adelantado) · 3 min

**Qué se hace**

1. En la ficha de Luis, «Energía». Toma por defecto la evaluación de hoy y muestra la tasa metabólica en reposo
   (TMR) con los cinco métodos.
2. Completar:
   - TMR: Mifflin-St Jeor;
   - estrategia aditiva, con PAL de vida diaria 1.4;
   - actividad: buscar «correr» → «Correr a 6–6.3 mph (unos 10 km/h)», 9.3 MET, 30 minutos, 3 veces por semana;
   - objetivo «Perder grasa», 3 kg de grasa por mes, meta de 15 % de grasa;
   - proteína 2 g/kg y grasa 25 % de las kcal.
3. Revisar la vista previa y guardar la prescripción.

**Qué decir**

- Cunningham y Katch-McArdle usan la masa libre de grasa de la evaluación (63.8 kg, Durnin & Womersley + Siri) y la
  citan.
- El PAL cubre solo la vida diaria; el ejercicio se suma aparte, para no contarlo dos veces (RN-E02).
- El ritmo y la fecha son una estimación inicial: se recalculan con el peso nuevo en cada evaluación (RN-E05).
- La proteína se fija primero, después la grasa, y los carbohidratos con lo que queda (RN-E07).

**Qué debe aparecer**

| En pantalla | Caso dorado |
|---|---|
| TMR: Mifflin-St Jeor 1,759 · Harris-Benedict 1,853 · FAO/OMS/UNU 1,897 · Cunningham 1,903 · Katch-McArdle 1,748 kcal | G-13 |
| Base con PAL 1.4, sin ejercicio: 2,462 kcal | G-14 |
| Correr: 372 kcal brutas y 332 netas por sesión; 142 kcal por día en promedio; gasto total (GET) 2,605 kcal | G-15 |
| Déficit 770 kcal por día; objetivo 1,835 kcal; ritmo 0.9 % del peso por semana | G-16: 770; 1835; 0.86 % |
| Peso objetivo 75.1 kg en 1.6 meses: fecha estimada 49 días después de hoy | G-12: 75.05 kg; G-16: 1.65 meses |
| Proteína 160 g, grasa 51 g, carbohidratos 184 g | G-17 |
| La prescripción aparece en la línea de tiempo de Luis | RF-10 |

## 7 · Auditoría: quién abrió el expediente (RF-06) · 1 min

**Qué se hace**

En la ficha de Luis, «Ver su auditoría». También se llega desde el menú «Auditoría», con filtros por persona, acción
y fechas (hasta 90 días).

**Qué decir**

- Cada vez que alguien abre el expediente, queda registrado quién, qué y cuándo. Nadie puede borrar ni cambiar ese
  registro (RN-B03).
- Solo la dueña ve la auditoría.

**Qué debe aparecer**

| En pantalla | Regla |
|---|---|
| Dueña Demo, «Lectura» de «Ficha», «Historia clínica», «Evaluación», «Resultados de una evaluación» y «Datos para la energía», con la hora de esta demo | RN-B03 |
| «Alta» de «Prescripción energética», de hace un minuto | RN-B03 |

**Si sobra tiempo:**

- Salir y entrar como Profesional Demo: no ve a Luis ni a Ana, porque no está en su equipo de atención (RN-A05).
- Salir al terminar: cierra la sesión (RF-01).

## Tabla de aceptación de la Demo 1

| RF | Qué | Dónde se ve | Estado |
|---|---|---|---|
| RF-01 | Entrar, salir y recuperar la contraseña | Paso 1 y al terminar; la recuperación por correo está probada en la E2E de P5 | ✅ Listo (P5) |
| RF-02 | Organización: datos, miembros, roles e invitaciones | Paso 1 | ✅ Listo (P5) |
| RF-03 | Cupo del plan y su uso | Paso 1 | ✅ Listo (P5 y P6). Límites provisionales hasta N9 |
| RF-04 | Elegir organización (deseable) | No se ve: la dueña demo tiene una sola organización. Probado en la E2E de P5 | ✅ Listo (P5) |
| RF-05 | Consentimiento versionado | Paso 2 | ✅ Listo (P6). Textos provisionales hasta la revisión legal |
| RF-06 | Auditoría para la dueña | Paso 7 | ✅ Listo (P6). Muestra también las lecturas de evaluaciones y energía |
| RF-08 | Pacientes y equipo de atención | Pasos 2 y 7 | ✅ Listo (P6) |
| RF-09 | Historia clínica versionada y notas | Paso 2 | ✅ Listo (P6). Historia v1 en texto libre hasta la ficha de Jeremy |
| RF-10 | Expediente con línea de tiempo | Pasos 2 y 6 | ✅ Listo (P6); P7 suma evaluaciones y energía |
| RF-11 | Evaluación y captura con tercera toma | Paso 3 | 🟨 Cálculo y reglas listos y probados; falta la pantalla de captura (PR 5) |
| RF-12 | ETM del evaluador | Pasos 4 y 5 | 🟨 Listo y probado; falta la pantalla (PR 5) |
| RF-13 | Bioimpedancia a mano, con marca y modelo | Paso 4 | 🟨 Listo y probado; falta la pantalla (PR 5). Lista de indicadores por confirmar (N19) |
| RF-14 | Cerrar y enmendar con motivo | Paso 3 | 🟨 Listo y probado; falta la pantalla (PR 5) |
| RF-15 | Composición corporal con método e interpretación con fuente | Pasos 4 y 5 | 🟨 Listo y probado (G-04 a G-12); falta la pantalla (PR 5) |
| RF-16 | Métodos por población, por organización y por paciente | Paso 4 | 🟨 Listo y probado; falta la pantalla (PR 5) |
| RF-17 | Energía: TMR, PAL, ejercicio, GET, objetivo, ritmo, peso objetivo y fecha | Paso 6 | 🟨 Listo y probado (G-12 a G-16); falta la pantalla (PR 5) |
| RF-18 | Macronutrientes (adelantado de la Demo 2) | Paso 6 | 🟨 Listo y probado (G-17); falta la pantalla (PR 5) |

Los RF de P7 pasan a ✅ cuando estén sus pantallas y la E2E del recorrido (`apps/web/e2e/demo-1.spec.ts`) esté en
verde.

## Antes de empezar (quien presenta)

1. El mismo día, o el anterior, empezar con la base limpia y cargar los datos de demostración. Esto borra la base
   local, que solo tiene datos de demostración y de pruebas. Cargar la demo sobre una base con datos no sirve: si Luis
   ya existe, la carga no lo toca.

   ```bash
   docker compose -f infra/docker/compose.local.yml down -v
   docker compose -f infra/docker/compose.local.yml up -d --wait
   pnpm db:migrate && pnpm db:seed
   pnpm dev
   ```

   Las fechas son relativas al día de la carga: la evaluación actual de Luis queda con esa fecha, y Luis cumple 28
   años ese día.

2. Abrir `http://localhost:3000/entrar` y entrar con `duena@demo.example.com` y `Demostracion-Local-2026`. Esa
   contraseña solo existe en local.
3. Comprobar que los resultados de Luis ya están: sin el worker, dicen «calculando».
4. Navegador limpio, zoom al 125 % y este guion en otra pantalla.

## Plan B

- **Los resultados no aparecen.** Si dicen «calculando» por más de un minuto, el worker no está corriendo: detener y
  volver a correr `pnpm dev`.
- **Falla la captura en vivo.** Crear otra evaluación básica para Ana: la fallida queda en borrador y no molesta. Si
  no hay tiempo, seguir con Luis (paso 4).
- **Alguien cambió a Luis o la base quedó mal.** Detener `pnpm dev` y repetir el paso 1 de «Antes de empezar»: base
  limpia y datos de demostración otra vez. Toma unos 5 minutos.
- **Falla la computadora.** Tener la demo cargada el mismo día también en una segunda computadora.

## Notas para el equipo

- **Ensayo:** el 2026-10-13 se recorrieron los siete pasos sobre una base nueva, llamando directamente a la API.
  Todas las cifras de este guion salen de ese ensayo y coinciden con los casos dorados.
- **Pantallas (PR 5):** los nombres de botones entre comillas que todavía no existen son provisionales:
  «Nueva evaluación», «Agregar sitio», «Cerrar evaluación», «Enmendar», «Evaluaciones», «Comparar con la anterior» y
  «Energía». Se ajustan cuando estén las pantallas.
- **La captura (paso 3) necesita:**
  - agregar un sitio extra en una evaluación básica;
  - el aviso de tercera toma en vivo;
  - el bloqueo del cierre mientras falte una toma.
- **Los resultados necesitan:**
  - el método junto a cada número;
  - la fuente junto a cada interpretación;
  - el aviso «Sin interpretación pediátrica en la versión 1.0» en menores (`interpretationNote`).
- **E2E:** `apps/web/e2e/demo-1.spec.ts` sigue estos siete pasos con los datos de `seeds/luis/luis.json` y
  `seeds/ana/ana.json`, en su propia organización.
  - El criterio de P7 pide crear a Luis en la E2E: alta, consentimiento, historia, evaluación ISAK 2, cierre,
    resultados y energía. Por eso la E2E no usa la carga de la demo.
  - Comprueba G-01 a G-17 en escritorio y en celular.
- **Decidido en ADR-049:**
  - ETM, %ETM, CMD95 y superficie corporal con 2 decimales; los meses hasta la meta, con 1;
  - por debajo de 0.4, la cintura/talla se muestra sin interpretación: NICE no clasifica esa franja;
  - NICE usa la cintura/talla con IMC menor que 35; la versión 1.0 la interpreta igual y no agrega aviso.
