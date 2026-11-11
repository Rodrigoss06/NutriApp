import {
  methodLabel,
  prescriptionParts,
  sessionDay,
  SET_TYPE_LABELS,
  weekPlan,
  type ProgramDocument,
} from '@nutricoach/contracts';
import { MethodBadge } from '@nutricoach/ui';
import { TableScroll } from '@/features/shell/table-scroll';
import { formatTestValue } from './labels';
import { muscleNames, phaseSummary, weekSetsByMuscle, type ProgramWeek } from './program-draft';

type Exercise = ProgramWeek['sessions'][number]['exercises'][number];
type PrescribedSet = Exercise['sets'][number];

/**
 * Las partes de una serie con el texto de contracts (P-34, ADR-114): «8 a 12 rep/lado» en un unilateral, «30 s/lado» en una
 * isometría y «esfuerzo suave (RPE 5–6)» en la movilidad y el cardio con RIR 4 o más.
 */
const partsOf = (set: PrescribedSet, exercise: Exercise) =>
  prescriptionParts(set, exercise, (value) => formatTestValue(value));
const durationOf = (set: PrescribedSet, exercise: Exercise): string => {
  const { duration, distance, met } = partsOf(set, exercise);
  return [duration, distance, met].filter(Boolean).join(' · ') || '—';
};

/** El plan de la semana: los días de entrenamiento y de descanso (07 §8). */
export function WeekPlan({ week }: { week: ProgramWeek }) {
  return (
    <ul
      aria-label="Plan de la semana"
      className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7"
    >
      {weekPlan(week.sessions).map(({ label, sessions }) => (
        <li key={label} className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block font-medium">{label}</span>
          <span className={sessions.length === 0 ? 'text-muted-foreground' : undefined}>
            {sessions.length === 0 ? 'Descanso' : sessions.join(', ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Las series de la semana por grupo muscular, con su método (RN-F06, RN-D02). */
export function WeekMuscleSets({
  week,
  document,
}: {
  week: ProgramWeek;
  document: ProgramDocument;
}) {
  const totals = weekSetsByMuscle(week);
  if (totals.length === 0) return null;
  const names = muscleNames(document);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="font-medium">Series de la semana por grupo muscular: </span>
        {totals
          .map(([muscle, sets]) => `${names.get(muscle) ?? muscle} ${formatTestValue(sets)}`)
          .join(' · ')}
      </p>
      <MethodBadge
        label={methodLabel(document.setsMethod.code)}
        code={document.setsMethod.code}
        version={document.setsMethod.version}
      />
    </div>
  );
}

function ExerciseFacts({ exercise }: { exercise: Exercise }) {
  const muscles = (list: Exercise['primaryMuscles']) => list.map(({ name }) => name).join(', ');
  const facts = [
    exercise.primaryMuscles.length > 0 ? `Principales: ${muscles(exercise.primaryMuscles)}` : null,
    exercise.secondaryMuscles.length > 0
      ? `Secundarios: ${muscles(exercise.secondaryMuscles)}`
      : null,
    exercise.caution ? `Precaución: ${exercise.caution}` : null,
    exercise.alternative ? `Alternativa: ${exercise.alternative.name}` : null,
    exercise.easierVariant ? `Más fácil: ${exercise.easierVariant.name}` : null,
    exercise.harderVariant ? `Más difícil: ${exercise.harderVariant.name}` : null,
  ].filter(Boolean);
  return facts.length > 0 ? (
    <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>
  ) : null;
}

function SetsTable({ exercise }: { exercise: Exercise }) {
  return (
    <TableScroll label={`Series de ${exercise.name}`}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Series de {exercise.name}</caption>
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            {['Serie', 'Tipo', 'Repeticiones', 'Carga', 'Descanso', 'Tempo', 'Tiempo'].map(
              (title) => (
                <th key={title} scope="col" className="px-3 py-2 font-medium">
                  {title}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {exercise.sets.map((set) => (
            <tr key={set.setNo} className="border-t border-border">
              <td className="px-3 py-2 tabular-nums">{set.setNo}</td>
              <td className="px-3 py-2">{SET_TYPE_LABELS[set.setType]}</td>
              <td className="px-3 py-2 tabular-nums">{partsOf(set, exercise).reps ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{partsOf(set, exercise).load ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">
                {set.restSeconds === null ? '—' : `${String(set.restSeconds)} s`}
              </td>
              <td className="px-3 py-2 tabular-nums">{set.tempo ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{durationOf(set, exercise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * Una semana del programa, de solo lectura: su fase y cada sesión con su día, sus ejercicios y sus series (RF-26, RN-F12). Publicado, todo
 * sale del snapshot: los músculos no cambian aunque se edite la biblioteca.
 */
export function ProgramWeekView({
  week,
  document,
  profiles,
}: {
  week: ProgramWeek;
  document: ProgramDocument;
  /** Los perfiles de día del plan nutricional del paciente, para nombrar el de cada sesión (P-20.4). */
  profiles: readonly { readonly code: string; readonly name: string }[];
}) {
  const phase = phaseSummary(week);
  return (
    <section aria-label={`Semana ${String(week.weekNo)}`} className="flex flex-col gap-4">
      {phase.length > 0 ? <p className="text-sm">{phase.join(' · ')}</p> : null}
      {week.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta semana no tiene sesiones.</p>
      ) : (
        <>
          <WeekPlan week={week} />
          <WeekMuscleSets week={week} document={document} />
        </>
      )}
      {week.sessions.map((session) => (
        <section
          key={session.id}
          aria-label={session.name}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <h4 className="font-medium">
            {session.name} · {sessionDay(session)}
          </h4>
          {session.dayProfileCode ? (
            <p className="text-sm text-muted-foreground">
              Perfil del día:{' '}
              {profiles.find((profile) => profile.code === session.dayProfileCode)?.name ??
                `${session.dayProfileCode} (no está en el plan)`}
            </p>
          ) : null}
          {session.notes ? <p className="text-sm whitespace-pre-wrap">{session.notes}</p> : null}
          {session.exercises.map((exercise) => (
            <div key={exercise.id} className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{exercise.name}</p>
                <ExerciseFacts exercise={exercise} />
                {exercise.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{exercise.notes}</p>
                ) : null}
                {exercise.substitutionNote ? (
                  <p className="text-sm whitespace-pre-wrap">
                    Nota de la sustitución: {exercise.substitutionNote}
                  </p>
                ) : null}
              </div>
              <SetsTable exercise={exercise} />
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}
