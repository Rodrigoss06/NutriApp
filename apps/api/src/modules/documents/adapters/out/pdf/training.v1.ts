import {
  LOAD_KIND_LABELS,
  methodLabel,
  ONE_RM_FORMULA_LABELS,
  REVIEW_KIND_LABELS,
  ROUTINE_SPLIT_LABELS,
  sessionDay,
  SET_TYPE_LABELS,
  TRAINING_INTENSITY_LABELS,
  TRAINING_LEVEL_LABELS,
  TRAINING_OBJECTIVE_LABELS,
  weekPlan,
} from '@nutricoach/contracts';
import { Text, View, type DocumentProps } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type {
  TrainingSheet,
  TrainingSheetSession,
  TrainingSheetSet,
} from '../../../application/sheets/training-sheet.js';
import { patientLine } from './plan-parts.js';
import {
  emphasis,
  fixed,
  longDate,
  plain,
  section,
  sheetDocument,
  styles,
  table,
  type SheetFrame,
} from './sheet-kit.js';

/**
 * Ficha de la rutina, versión 1.0.0 (RN-H01, ADR-079): el programa con su fórmula de 1RM (RN-F04); el macrociclo con la versión de su
 * tabla de fases (RN-F13); cada semana con su plan de 7 días (07 §8), sus sesiones y las series por grupo muscular con su método
 * (RN-F06, RN-H04), con las semanas iguales juntas; y cada ejercicio una vez, con sus músculos, su precaución y sus variantes (RN-F11).
 */

type Block = TrainingSheet['blocks'][number];
type Exercise = TrainingSheetSession['exercises'][number];

const LIST = new Intl.ListFormat('es', { type: 'conjunction' });

const ORIGIN = { MANUAL: 'armado a mano', PROPOSAL: 'propuesta aprobada' } as const;

/** «Semana 1» o «Semanas 2 y 6». */
const weeksTitle = (weeks: readonly number[]): string =>
  weeks.length === 1 ? `Semana ${String(weeks[0])}` : `Semanas ${LIST.format(weeks.map(String))}`;

/** Las semanas de un mesociclo, que son contiguas: «semana 3» o «semanas 1 a 5». */
function weekRange(weeks: readonly number[]): string {
  const [first] = weeks;
  const last = weeks.at(-1);
  if (first === undefined || last === undefined) return '';
  return first === last ? `semana ${String(first)}` : `semanas ${String(first)} a ${String(last)}`;
}

function repsText({ repsMin, repsMax }: TrainingSheetSet): string | null {
  if (repsMin !== null && repsMax !== null && repsMin !== repsMax) {
    return `${String(repsMin)} a ${String(repsMax)} rep`;
  }
  const reps = repsMin ?? repsMax;
  return reps === null ? null : `${String(reps)} rep`;
}

/** «60 kg», «80 % de 1RM», «RIR 2», «RPE 8» o «Peso corporal». */
function loadText({ loadKind, loadValue }: TrainingSheetSet): string | null {
  if (loadKind === null) return null;
  if (loadKind === 'BODYWEIGHT') return LOAD_KIND_LABELS.BODYWEIGHT;
  const value = loadValue === null ? '' : plain(loadValue);
  if (loadKind === 'KG' || loadKind === 'PCT_1RM') return `${value} ${LOAD_KIND_LABELS[loadKind]}`;
  return `${loadKind} ${value}`;
}

/** El cardio se prescribe en minutos (RN-F10). */
const cardioParts = ({ durationSeconds, distanceM, met }: TrainingSheetSet): readonly string[] =>
  [
    durationSeconds === null ? null : `${plain(durationSeconds / 60)} min`,
    distanceM === null ? null : `${plain(distanceM)} m`,
    met === null ? null : `${plain(met)} MET`,
  ].filter((part): part is string => part !== null);

/** Lo que pide una serie: «8 a 12 rep · RIR 2 · 90 s de descanso · tempo 2-1-2». */
function setText(set: TrainingSheetSet): string {
  return [
    repsText(set),
    ...cardioParts(set),
    loadText(set),
    set.restSeconds === null ? null : `${String(set.restSeconds)} s de descanso`,
    set.tempo ? `tempo ${set.tempo}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

const sameSet = (a: TrainingSheetSet, b: TrainingSheetSet): boolean =>
  (Object.keys(a) as (keyof TrainingSheetSet)[]).every(
    (key) => key === 'setNo' || a[key] === b[key],
  );

/** Las series iguales, en una línea: «3 series · 8 a 12 rep · …». Distintas, null: van en una tabla. */
function setsLine(sets: readonly TrainingSheetSet[]): string | null {
  const [first] = sets;
  if (!first) return 'sin series';
  if (!sets.every((set) => sameSet(set, first))) return null;
  const count = sets.length === 1 ? '1 serie' : `${String(sets.length)} series`;
  const kind =
    first.setType === 'WORKING'
      ? count
      : `${count} (${SET_TYPE_LABELS[first.setType].toLowerCase()})`;
  return [kind, setText(first)].filter((part) => part !== '').join(' · ');
}

function setsTable(sets: readonly TrainingSheetSet[]): ReactElement {
  return table(
    [
      { label: 'Serie', flex: 0.6, numeric: true },
      { label: 'Tipo', flex: 1.3 },
      { label: 'Repeticiones', flex: 1.1 },
      { label: 'Carga', flex: 1.1 },
      { label: 'Descanso', flex: 0.9, numeric: true },
      { label: 'Tempo', flex: 0.8 },
      { label: 'Cardio', flex: 1.3 },
    ],
    sets.map((set) => [
      String(set.setNo),
      SET_TYPE_LABELS[set.setType],
      repsText(set) ?? '—',
      loadText(set) ?? '—',
      set.restSeconds === null ? '—' : `${String(set.restSeconds)} s`,
      set.tempo ?? '—',
      cardioParts(set).join(' · ') || '—',
    ]),
  );
}

function programCard(sheet: TrainingSheet): ReactElement {
  const { program, mesocycles } = sheet;
  const facts = [
    program.objective ? TRAINING_OBJECTIVE_LABELS[program.objective] : null,
    program.level ? TRAINING_LEVEL_LABELS[program.level] : null,
    program.daysPerWeek === null ? null : `${String(program.daysPerWeek)} días por semana`,
    program.split ? ROUTINE_SPLIT_LABELS[program.split] : null,
    `${String(program.totalWeeks)} ${program.totalWeeks === 1 ? 'semana' : 'semanas'}`,
  ].filter((part): part is string => part !== null);
  const named = mesocycles.length > 1 || mesocycles.some((mesocycle) => mesocycle.focus);
  return h(
    View,
    { style: [styles.card, { marginTop: 8 }] },
    h(
      Text,
      null,
      ...emphasis(
        'Programa: ',
        program.name,
        ` · versión ${String(program.versionNo)} · ${ORIGIN[program.origin]}`,
      ),
    ),
    h(Text, null, facts.join(' · ')),
    h(
      Text,
      null,
      `Del ${longDate(program.startDate)} al ${longDate(program.endDate)}. 1RM estimado con la fórmula de ${ONE_RM_FORMULA_LABELS[program.oneRmFormula]}.`,
    ),
    program.goal ? h(Text, null, ...emphasis('Objetivo del programa: ', program.goal)) : null,
    named
      ? h(
          Text,
          { style: styles.muted },
          `Mesociclos: ${mesocycles
            .map(
              (mesocycle) =>
                `${mesocycle.name}${mesocycle.focus ? ` (${mesocycle.focus})` : ''}, ${weekRange(mesocycle.weeks)}`,
            )
            .join(' · ')}.`,
        )
      : null,
  );
}

function macrocycle(sheet: TrainingSheet, frame: SheetFrame): ReactElement | null {
  if (sheet.macrocycle.length === 0) return null;
  const validFrom = sheet.program.periodizationValidFrom;
  return section(
    'Macrociclo',
    frame.colors,
    table(
      [
        { label: 'Semana', flex: 0.7, numeric: true },
        { label: 'Fase', flex: 1.7 },
        { label: 'Objetivo', flex: 1.9 },
        { label: 'Volumen', flex: 0.9, numeric: true },
        { label: 'Intensidad', flex: 1.3 },
        { label: 'RIR', flex: 0.6, numeric: true },
        { label: 'Revisión', flex: 1.5 },
      ],
      sheet.macrocycle.map((week) => {
        const phase = week.phase ?? '—';
        return [
          String(week.weekNo),
          week.isDeload && week.phase !== 'Descarga' ? `${phase} · descarga` : phase,
          week.phaseGoal ?? '—',
          week.volumeFactor === null ? '—' : fixed(week.volumeFactor, 2),
          week.intensity ? TRAINING_INTENSITY_LABELS[week.intensity] : '—',
          week.targetRir === null ? '—' : String(week.targetRir),
          week.reviewKind ? REVIEW_KIND_LABELS[week.reviewKind] : '—',
        ];
      }),
    ),
    h(
      Text,
      { style: [styles.note, { marginTop: 4 }] },
      [
        validFrom ? `Tabla de fases vigente desde el ${longDate(validFrom)}.` : null,
        'El factor de volumen y el RIR son el objetivo de cada semana.',
      ]
        .filter((part): part is string => part !== null)
        .join(' '),
    ),
  );
}

function exerciseRow(exercise: Exercise, index: number): ReactElement {
  const line = setsLine(exercise.sets);
  const name = `${String(index + 1)}. ${exercise.name}${
    exercise.supersetGroup ? ` (superserie ${exercise.supersetGroup})` : ''
  }`;
  return h(
    View,
    { key: index, style: { marginTop: 3 }, wrap: false },
    h(Text, null, ...emphasis('', name, line === null ? '' : ` · ${line}`)),
    exercise.notes ? h(Text, { style: [styles.muted, { marginLeft: 10 }] }, exercise.notes) : null,
    line === null ? h(View, { style: { marginTop: 2 } }, setsTable(exercise.sets)) : null,
  );
}

/** Una sesión puede ser más larga que lo que queda de la página: se corta entre ejercicios. */
function sessionBlock(session: TrainingSheetSession, frame: SheetFrame, key: number): ReactElement {
  return h(
    View,
    { key, style: [styles.ruled, { marginTop: 8 }] },
    h(
      Text,
      { style: [styles.subTitle, { color: frame.colors.primary.text }], minPresenceAhead: 30 },
      `${session.name} · ${sessionDay(session)}`,
    ),
    session.notes ? h(Text, { style: styles.muted }, session.notes) : null,
    ...session.exercises.map(exerciseRow),
  );
}

function weekBlock(sheet: TrainingSheet, frame: SheetFrame, block: Block): ReactElement {
  const plan = weekPlan(block.sessions);
  const [method] = sheet.methods;
  return h(
    View,
    { style: styles.section },
    // El título, el plan de los 7 días y las series por músculo van juntos y con el comienzo de la primera sesión.
    h(
      View,
      { wrap: false, minPresenceAhead: 40 },
      h(
        Text,
        { style: [styles.sectionTitle, { color: frame.colors.primary.text }] },
        weeksTitle(block.weeks),
      ),
      table(
        plan.map((day) => ({ label: day.label, flex: 1 })),
        [plan.map((day) => (day.sessions.length === 0 ? 'Descanso' : day.sessions.join(', ')))],
      ),
      block.setsByMuscle.length > 0 && method
        ? h(
            Text,
            { style: [styles.note, { marginTop: 4 }] },
            `Series de la semana por grupo muscular (${methodLabel(method.methodCode)}): ${block.setsByMuscle
              .map(({ muscle, sets }) => `${muscle} ${plain(sets)}`)
              .join(' · ')}.`,
          )
        : null,
    ),
    ...block.sessions.map((session, index) => sessionBlock(session, frame, index)),
  );
}

function exercises(sheet: TrainingSheet, frame: SheetFrame): ReactElement | null {
  if (sheet.exercises.length === 0) return null;
  return section(
    'Ejercicios',
    frame.colors,
    ...sheet.exercises.map((exercise, index) =>
      h(
        View,
        { key: index, style: { marginBottom: 4 }, wrap: false },
        h(Text, { style: styles.strong }, exercise.name),
        h(
          Text,
          { style: styles.muted },
          [
            exercise.primaryMuscles.length > 0
              ? `Principales: ${exercise.primaryMuscles.join(', ')}`
              : null,
            exercise.secondaryMuscles.length > 0
              ? `Secundarios: ${exercise.secondaryMuscles.join(', ')}`
              : null,
            exercise.caution ? `Precaución: ${exercise.caution}` : null,
            exercise.alternative ? `Alternativa: ${exercise.alternative}` : null,
            exercise.easierVariant ? `Más fácil: ${exercise.easierVariant}` : null,
            exercise.harderVariant ? `Más difícil: ${exercise.harderVariant}` : null,
          ]
            .filter((part): part is string => part !== null)
            .join(' · ') || 'Sin datos de la biblioteca.',
        ),
      ),
    ),
  );
}

export function trainingV1(sheet: TrainingSheet, frame: SheetFrame): ReactElement<DocumentProps> {
  return sheetDocument(
    frame,
    patientLine(sheet.patient),
    programCard(sheet),
    macrocycle(sheet, frame),
    ...sheet.blocks.map((block) => weekBlock(sheet, frame, block)),
    exercises(sheet, frame),
    h(
      View,
      { style: styles.section, wrap: false },
      h(
        Text,
        { style: styles.note },
        `Cálculos: ${sheet.methods
          .map((method) => `${methodLabel(method.methodCode)} ${method.methodVersion}`)
          .join(' · ')} · motor ${sheet.program.engineVersion}.`,
      ),
    ),
  );
}

/** El título y el subtítulo del encabezado: la versión y las fechas del programa. */
export function trainingTitles(sheet: TrainingSheet): { title: string; subtitle: string } {
  return {
    title: 'Rutina de entrenamiento',
    subtitle: `Versión ${String(sheet.program.versionNo)} · del ${longDate(sheet.program.startDate)} al ${longDate(sheet.program.endDate)}`,
  };
}
