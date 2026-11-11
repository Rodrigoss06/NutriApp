'use client';

import {
  formatNumber,
  SET_TYPE_LABELS,
  type LogWorkout,
  type WorkoutLog,
} from '@nutricoach/contracts';
import { Button, cn, Notice, NumberField } from '@nutricoach/ui';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { newClientId, useRecord } from './records';
import { ScaleField } from './scale-field';
import {
  effortKind,
  isCardio,
  liveTonnageKg,
  prescribedText,
  progressOf,
  sessionDraftOf,
  skippedBody,
  workoutBody,
  type ExerciseRating,
  type PrescribedSet,
  type SessionDraft,
  type SessionExercise,
  type SetDraft,
  type TrainingSession,
} from './workout';

const setLabel = (set: PrescribedSet): string =>
  set.setType === 'WORKING'
    ? `Serie ${String(set.setNo)}`
    : `Serie ${String(set.setNo)} · ${(SET_TYPE_LABELS as Readonly<Record<string, string>>)[set.setType] ?? set.setType}`;

/** Un rótulo corto a la vista y el completo para el lector: «Rep» se lee «Repeticiones, serie 1 de Sentadilla goblet». */
function shortLabel(visible: string, full: string): ReactNode {
  return (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{full}</span>
    </>
  );
}

/**
 * Registrar la sesión del día (RF-29): cada serie parte de lo prescrito y se marca hecha; se corrigen las repeticiones, el
 * peso y el RIR o RPE si fue distinto, y el cardio va en minutos. El estímulo y la fatiga se anotan una vez por ejercicio y
 * quedan en cada una de sus series (ADR-084). El tonelaje se ve mientras se registra (RN-F03); el definitivo lo calcula la API.
 */
export function WorkoutLogger({
  session,
  localDate,
}: {
  session: TrainingSession;
  localDate: string;
}) {
  const headingId = useId();
  const [draft, setDraft] = useState<SessionDraft>(() => sessionDraftOf(session));
  const [open, setOpen] = useState<string | null>(session.exercises[0]?.id ?? null);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const record = useRecord<LogWorkout, WorkoutLog>('/me/workouts');
  const progress = progressOf(session, draft);
  const tonnageKg = liveTonnageKg(session, draft);

  const updateSet = (exerciseId: string, index: number, changes: Partial<SetDraft>) => {
    setDraft((current) => ({
      ...current,
      sets: {
        ...current.sets,
        [exerciseId]: (current.sets[exerciseId] ?? []).map((set, i) =>
          i === index ? { ...set, ...changes } : set,
        ),
      },
    }));
  };
  const updateRating = (exerciseId: string, changes: Partial<ExerciseRating>) => {
    setDraft((current) => ({
      ...current,
      ratings: {
        ...current.ratings,
        [exerciseId]: {
          stimulus: current.ratings[exerciseId]?.stimulus ?? null,
          fatigue: current.ratings[exerciseId]?.fatigue ?? null,
          ...changes,
        },
      },
    }));
  };

  const submit = () => {
    const result = workoutBody(session, draft, { clientId: newClientId(), localDate });
    setProblems(result.ok ? [] : result.problems);
    if (result.ok) record.mutate(result.body);
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold">
          {session.name}
        </h2>
        {session.notes ? <p className="text-sm">{session.notes}</p> : null}
      </div>
      <ol className="flex flex-col gap-2">
        {session.exercises.map((exercise, position) => (
          <ExerciseRow
            key={exercise.id}
            position={position + 1}
            exercise={exercise}
            sets={draft.sets[exercise.id] ?? []}
            rating={draft.ratings[exercise.id] ?? { stimulus: null, fatigue: null }}
            expanded={open === exercise.id}
            onToggle={() => {
              setOpen((current) => (current === exercise.id ? null : exercise.id));
            }}
            onSet={(index, changes) => {
              updateSet(exercise.id, index, changes);
            }}
            onRating={(changes) => {
              updateRating(exercise.id, changes);
            }}
          />
        ))}
      </ol>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <legend className="px-1 font-semibold">Toda la sesión</legend>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Duración"
            unit="min"
            inputMode="numeric"
            value={draft.durationMinutes}
            onValueChange={(durationMinutes) => {
              setDraft((current) => ({ ...current, durationMinutes }));
            }}
          />
          <NumberField
            label="RPE de la sesión"
            hint="De 0 a 10."
            value={draft.sessionRpe}
            onValueChange={(sessionRpe) => {
              setDraft((current) => ({ ...current, sessionRpe }));
            }}
          />
        </div>
        <TextAreaField
          label="Notas para tu coach"
          hint="Opcional: cómo te fue, si algo molestó."
          maxLength={2_000}
          value={draft.notes}
          onChange={(event) => {
            const notes = event.target.value;
            setDraft((current) => ({ ...current, notes }));
          }}
        />
      </fieldset>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {progress.done} de {progress.total} series hechas
        </p>
        <p className="text-lg font-semibold tabular-nums" aria-live="polite">
          Tonelaje: {formatNumber(tonnageKg, 'trainingLoad')} kg
          {session.plannedTonnageKg !== null ? (
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              de {formatNumber(session.plannedTonnageKg, 'trainingLoad')} kg prescritos
            </span>
          ) : null}
        </p>
      </div>

      {problems.length > 0 ? (
        <Notice tone="danger" title="Revisa estas series">
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {record.isSuccess ? (
        <Notice tone="success" title="Sesión registrada">
          Tonelaje: {formatNumber(record.data.tonnageKg, 'trainingLoad')} kg.
        </Notice>
      ) : null}
      <FormError error={record.error} title="No se registró la sesión" />
      <div className="flex flex-col gap-2">
        <Button
          size="touch"
          disabled={progress.done === 0 || record.isPending || record.isSuccess}
          onClick={submit}
        >
          {record.isPending ? 'Registrando…' : 'Registrar sesión'}
        </Button>
        <Button
          size="touch"
          variant="secondary"
          disabled={record.isPending || record.isSuccess}
          onClick={() => {
            setProblems([]);
            record.mutate(skippedBody(session, { clientId: newClientId(), localDate }));
          }}
        >
          Hoy no hice esta sesión
        </Button>
      </div>
    </section>
  );
}

function ExerciseRow({
  position,
  exercise,
  sets,
  rating,
  expanded,
  onToggle,
  onSet,
  onRating,
}: {
  position: number;
  exercise: SessionExercise;
  sets: readonly SetDraft[];
  rating: ExerciseRating;
  expanded: boolean;
  onToggle: () => void;
  onSet: (index: number, changes: Partial<SetDraft>) => void;
  onRating: (changes: Partial<ExerciseRating>) => void;
}) {
  const regionId = useId();
  const done = sets.filter((set) => set.done).length;
  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
        className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex flex-col">
          <span className="font-medium">
            {position}. {exercise.name}
          </span>
          <span className="text-sm text-muted-foreground">
            {done} de {exercise.sets.length} series hechas
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-5 shrink-0 transition-transform', expanded ? 'rotate-180' : '')}
        />
      </button>
      <div id={regionId} hidden={!expanded} className="flex flex-col gap-3 px-4 pb-4">
        <ExerciseGuide exercise={exercise} />
        <ol className="flex flex-col gap-2">
          {exercise.sets.map((set, index) => (
            <SetRow
              key={`${String(set.setNo)}-${String(index)}`}
              exercise={exercise}
              set={set}
              draft={sets[index]}
              onChange={(changes) => {
                onSet(index, changes);
              }}
            />
          ))}
        </ol>
        <ScaleField
          label={`Estímulo de ${exercise.name}`}
          hint="1 poco · 5 mucho: cuánto sentiste trabajar el músculo."
          min={1}
          max={5}
          value={rating.stimulus}
          onChange={(stimulus) => {
            onRating({ stimulus });
          }}
        />
        <ScaleField
          label={`Fatiga de ${exercise.name}`}
          hint="1 poca · 5 mucha."
          min={1}
          max={5}
          value={rating.fatigue}
          onChange={(fatigue) => {
            onRating({ fatigue });
          }}
        />
      </div>
    </li>
  );
}

/** Lo que el coach escribió para el ejercicio y la ficha de la biblioteca (RN-F11): precaución, alternativa y variantes. */
function ExerciseGuide({ exercise }: { exercise: SessionExercise }) {
  const variants = [
    exercise.easierVariant ? `más fácil, ${exercise.easierVariant}` : null,
    exercise.harderVariant ? `más difícil, ${exercise.harderVariant}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {exercise.notes ? <p>{exercise.notes}</p> : null}
      {exercise.caution ? (
        <Notice tone="warning" title="Precaución">
          {exercise.caution}
        </Notice>
      ) : null}
      {exercise.alternative ? (
        <p className="text-muted-foreground">Si no puedes hacerlo: {exercise.alternative}.</p>
      ) : null}
      {variants.length > 0 ? (
        <p className="text-muted-foreground">Variantes: {variants.join('; ')}.</p>
      ) : null}
      {exercise.instructions ? (
        <p className="text-muted-foreground">{exercise.instructions}</p>
      ) : null}
      {exercise.mediaUrl ? (
        <a
          href={exercise.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-touch items-center text-brand-text underline"
        >
          Ver cómo se hace
          <span className="sr-only">: {exercise.name} (se abre en otra pestaña)</span>
        </a>
      ) : null}
    </div>
  );
}

function SetRow({
  exercise,
  set,
  draft,
  onChange,
}: {
  exercise: SessionExercise;
  set: PrescribedSet;
  draft: SetDraft | undefined;
  onChange: (changes: Partial<SetDraft>) => void;
}) {
  if (!draft) return null;
  const label = setLabel(set);
  const of = `${label} de ${exercise.name}`;
  const cardio = isCardio(set);
  const kind = effortKind(set);
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        draft.done ? 'border-brand-border bg-muted' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex flex-col text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">{prescribedText(set, exercise)}</span>
        </p>
        <Button
          size="touch"
          variant={draft.done ? 'primary' : 'secondary'}
          aria-pressed={draft.done}
          aria-label={`Hecha: ${of}`}
          onClick={() => {
            onChange({ done: !draft.done });
          }}
        >
          {draft.done ? <Check aria-hidden /> : null}
          Hecha
        </Button>
      </div>
      {cardio ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={shortLabel('Minutos', `Minutos, ${of}`)}
            unit="min"
            value={draft.minutes}
            onValueChange={(minutes) => {
              onChange({ minutes });
            }}
          />
          <NumberField
            label={shortLabel('Distancia', `Distancia, ${of}`)}
            unit="m"
            value={draft.distanceM}
            onValueChange={(distanceM) => {
              onChange({ distanceM });
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label={shortLabel('Rep', `Repeticiones, ${of}`)}
            inputMode="numeric"
            value={draft.reps}
            onValueChange={(reps) => {
              onChange({ reps });
            }}
          />
          <NumberField
            label={shortLabel('Peso', `Peso, ${of}`)}
            unit="kg"
            value={draft.loadKg}
            onValueChange={(loadKg) => {
              onChange({ loadKg });
            }}
          />
          <NumberField
            label={shortLabel(kind, `${kind}, ${of}`)}
            inputMode={kind === 'RIR' ? 'numeric' : 'decimal'}
            value={draft.effort}
            onValueChange={(effort) => {
              onChange({ effort });
            }}
          />
        </div>
      )}
    </li>
  );
}
