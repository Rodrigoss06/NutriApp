import {
  EXERCISE_MODALITY_LABELS,
  MOVEMENT_PATTERN_LABELS,
  TRAINING_LEVEL_LABELS,
  type ExerciseDetail,
  type ExerciseRef,
} from '@nutricoach/contracts';
import { Notice, StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { ExerciseActions } from './exercise-actions';
import { baseRest, baseVolume } from './format';

function ExerciseLink({ exercise }: { exercise: ExerciseRef | null }) {
  if (!exercise) return <>—</>;
  return (
    <Link
      href={`/panel/biblioteca/ejercicios/${exercise.id}`}
      className="text-brand-text underline"
    >
      {exercise.name}
    </Link>
  );
}

/**
 * La ficha de un ejercicio (RF-25, 07 §5): patrón, nivel, equipo, músculos, precaución, alternativa, regresión y
 * progresión (RN-F11), y los valores base. Los de referencia no se editan (RN-I01).
 */
export function ExerciseDetailView({ exercise }: { exercise: ExerciseDetail }) {
  const volume = baseVolume(exercise);
  const rest = baseRest(exercise);
  const names = (muscles: readonly { name: string }[]) =>
    muscles.map(({ name }) => name).join(', ') || '—';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-xl font-semibold">{exercise.name}</h2>
          <p className="text-sm text-muted-foreground">
            {MOVEMENT_PATTERN_LABELS[exercise.pattern]} · {TRAINING_LEVEL_LABELS[exercise.level]}
          </p>
        </div>
        {exercise.own ? <StatusBadge tone="info">Propio de tu organización</StatusBadge> : null}
        {exercise.status === 'ARCHIVED' ? (
          <StatusBadge tone="warning">Archivado</StatusBadge>
        ) : null}
        <ExerciseActions exercise={exercise} />
      </div>
      {exercise.provisional ? (
        <Notice tone="warning" title="Ejercicio provisional">
          Todavía no tiene la revisión final. Revísalo antes de prescribirlo.
        </Notice>
      ) : null}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        {exercise.aliases.length > 0 ? (
          <>
            <dt className="text-muted-foreground">También se conoce como</dt>
            <dd>{exercise.aliases.join(', ')}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Modalidad</dt>
        <dd>{EXERCISE_MODALITY_LABELS[exercise.modality]}</dd>
        <dt className="text-muted-foreground">Equipo</dt>
        <dd>{exercise.equipmentName ?? 'Sin equipo definido'}</dd>
        <dt className="text-muted-foreground">Un lado a la vez</dt>
        <dd>{exercise.isUnilateral ? 'Sí' : 'No'}</dd>
        <dt className="text-muted-foreground">Músculo principal</dt>
        <dd>{names(exercise.primaryMuscles)}</dd>
        <dt className="text-muted-foreground">Músculo secundario</dt>
        <dd>{names(exercise.secondaryMuscles)}</dd>
        <dt className="text-muted-foreground">Precaución</dt>
        <dd>{exercise.caution ?? '—'}</dd>
        <dt className="text-muted-foreground">Valores base</dt>
        <dd className="tabular-nums">{[volume, rest].filter(Boolean).join(' · ') || '—'}</dd>
        <dt className="text-muted-foreground">Alternativa</dt>
        <dd>
          <ExerciseLink exercise={exercise.alternative} />
        </dd>
        <dt className="text-muted-foreground">Regresión (más fácil)</dt>
        <dd>
          <ExerciseLink exercise={exercise.easierVariant} />
        </dd>
        <dt className="text-muted-foreground">Progresión (más difícil)</dt>
        <dd>
          <ExerciseLink exercise={exercise.harderVariant} />
        </dd>
        {exercise.mediaUrl ? (
          <>
            <dt className="text-muted-foreground">Video o imagen</dt>
            <dd>
              <a
                href={exercise.mediaUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-text underline"
              >
                Abrir el enlace
              </a>
            </dd>
          </>
        ) : null}
        {exercise.instructions ? (
          <>
            <dt className="text-muted-foreground">Instrucciones</dt>
            <dd className="whitespace-pre-line">{exercise.instructions}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
