'use client';

import {
  LOAD_KIND_LABELS,
  LOAD_KINDS,
  REVIEW_KIND_CODES,
  REVIEW_KIND_LABELS,
  SET_TYPE_LABELS,
  SET_TYPES,
  TRAINING_INTENSITY_CODES,
  TRAINING_INTENSITY_LABELS,
  type LoadKind,
  type ProgramOrigin,
  type SetType,
} from '@nutricoach/contracts';
import { Button, Select, StatusBadge } from '@nutricoach/ui';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ExercisePicker } from '@/features/exercise/exercise-picker';
import { CheckboxField, TextAreaField, TextField } from '@/features/forms/fields';
import { CellInput } from '@/features/nutrition-plan/cell-input';
import { TableScroll } from '@/features/shell/table-scroll';
import {
  moveAt,
  newExerciseDraft,
  newSessionDraft,
  nextSet,
  NONE,
  removeAt,
  replaceAt,
  sessionDay,
  setsSummary,
  WEEKDAY_OPTIONS,
  type ExerciseDraft,
  type SessionDraft,
  type SetDraft,
  type WeekDraft,
} from './program-draft';

const SET_TYPE_OPTIONS = SET_TYPES.map((code) => ({ value: code, label: SET_TYPE_LABELS[code] }));
const LOAD_OPTIONS = [
  { value: NONE, label: 'Sin carga' },
  ...LOAD_KINDS.map((code) => ({ value: code, label: LOAD_KIND_LABELS[code] })),
];
const INTENSITY_OPTIONS = [
  { value: NONE, label: 'Sin indicar' },
  ...TRAINING_INTENSITY_CODES.map((code) => ({
    value: code,
    label: TRAINING_INTENSITY_LABELS[code],
  })),
];
const REVIEW_OPTIONS = [
  { value: NONE, label: 'Sin indicar' },
  ...REVIEW_KIND_CODES.map((code) => ({ value: code, label: REVIEW_KIND_LABELS[code] })),
];
const SET_COLUMNS = [
  'Serie',
  'Tipo',
  'Rep. mín.',
  'Rep. máx.',
  'Carga',
  'Valor',
  'Descanso (s)',
  'Tempo',
  'Minutos',
  'MET',
  'Quitar',
];

/** Una semana de propuesta tiene 8 ejercicios por sesión: esas empiezan cerradas, para ver la semana entera. */
const OPEN_BELOW_EXERCISES = 4;

/** Con peso corporal o sin carga no va un valor: la API lo rechazaría. */
const takesLoadValue = (kind: SetDraft['loadKind']): boolean =>
  kind !== NONE && kind !== 'BODYWEIGHT';

function SetRow({
  set,
  position,
  exerciseName,
  onChange,
  onRemove,
}: {
  set: SetDraft;
  position: number;
  exerciseName: string;
  onChange: (set: SetDraft) => void;
  onRemove: () => void;
}) {
  const name = `serie ${String(position)} de ${exerciseName}`;
  const cell = (
    label: string,
    field: 'repsMin' | 'repsMax' | 'loadValue' | 'restSeconds' | 'minutes' | 'met',
    inputMode: 'numeric' | 'decimal',
    disabled = false,
  ) => (
    <td className="px-1 py-2 align-top">
      <CellInput
        label={`${label}, ${name}`}
        className={field === 'loadValue' || field === 'minutes' ? 'w-16' : 'w-14'}
        inputMode={inputMode}
        disabled={disabled}
        value={set[field]}
        onChange={(event) => {
          onChange({ ...set, [field]: event.target.value });
        }}
      />
    </td>
  );
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-2 align-top text-sm tabular-nums">{position}</td>
      <td className="min-w-36 px-1 py-2 align-top">
        <Select
          hideLabel
          label={`Tipo, ${name}`}
          options={SET_TYPE_OPTIONS}
          value={set.setType}
          onValueChange={(value) => {
            onChange({ ...set, setType: value as SetType });
          }}
        />
      </td>
      {cell('Repeticiones mínimas', 'repsMin', 'numeric')}
      {cell('Repeticiones máximas', 'repsMax', 'numeric')}
      <td className="min-w-36 px-1 py-2 align-top">
        <Select
          hideLabel
          label={`Carga, ${name}`}
          options={LOAD_OPTIONS}
          value={set.loadKind}
          onValueChange={(value) => {
            const loadKind = value as LoadKind | typeof NONE;
            onChange({
              ...set,
              loadKind,
              loadValue: takesLoadValue(loadKind) ? set.loadValue : '',
            });
          }}
        />
      </td>
      {cell('Valor de la carga', 'loadValue', 'decimal', !takesLoadValue(set.loadKind))}
      {cell('Descanso en segundos', 'restSeconds', 'numeric')}
      <td className="px-1 py-2 align-top">
        <CellInput
          label={`Tempo, ${name}`}
          className="w-20 text-left"
          maxLength={20}
          value={set.tempo}
          onChange={(event) => {
            onChange({ ...set, tempo: event.target.value });
          }}
        />
      </td>
      {cell('Minutos de cardio', 'minutes', 'decimal')}
      {cell('MET del cardio', 'met', 'decimal')}
      <td className="px-1 py-2 align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${name}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

function ExerciseEditor({
  exercise,
  position,
  total,
  showApproval,
  onChange,
  onRemove,
  onMove,
}: {
  exercise: ExerciseDraft;
  position: number;
  total: number;
  showApproval: boolean;
  onChange: (exercise: ExerciseDraft) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <li className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {position}. {exercise.name}
          </span>
          {showApproval ? (
            <StatusBadge tone={exercise.approved ? 'success' : 'warning'}>
              {exercise.approved ? 'Aprobado' : 'Por aprobar'}
            </StatusBadge>
          ) : null}
        </span>
        <span className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Subir ${exercise.name}`}
            disabled={position === 1}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Bajar ${exercise.name}`}
            disabled={position === total}
            onClick={() => {
              onMove(1);
            }}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar ${exercise.name}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </span>
      </div>
      <details>
        <summary className="cursor-pointer py-2 text-sm">{setsSummary(exercise.sets)}</summary>
        <div className="flex flex-col gap-3 pt-1">
          <TableScroll label={`Series de ${exercise.name}`}>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Series de {exercise.name}</caption>
              <thead className="bg-surface text-left text-muted-foreground">
                <tr>
                  {SET_COLUMNS.map((title) => (
                    <th key={title} scope="col" className="px-2 py-2 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exercise.sets.map((set, index) => (
                  <SetRow
                    key={set.key}
                    set={set}
                    position={index + 1}
                    exerciseName={exercise.name}
                    onChange={(next) => {
                      onChange({ ...exercise, sets: replaceAt(exercise.sets, index, next) });
                    }}
                    onRemove={() => {
                      onChange({ ...exercise, sets: removeAt(exercise.sets, index) });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                onChange({ ...exercise, sets: [...exercise.sets, nextSet(exercise.sets)] });
              }}
            >
              Agregar serie
            </Button>
          </div>
          <TextAreaField
            label="Notas del ejercicio"
            rows={2}
            className="min-h-16"
            maxLength={500}
            value={exercise.notes}
            onChange={(event) => {
              onChange({ ...exercise, notes: event.target.value });
            }}
          />
        </div>
      </details>
    </li>
  );
}

function SessionEditor({
  session,
  position,
  showApproval,
  onChange,
  onRemove,
}: {
  session: SessionDraft;
  position: number;
  showApproval: boolean;
  onChange: (session: SessionDraft) => void;
  onRemove: () => void;
}) {
  const { exercises } = session;
  const [open, setOpen] = useState(exercises.length < OPEN_BELOW_EXERCISES);
  const day = sessionDay({
    position,
    dayOfWeek: session.dayOfWeek === NONE ? null : Number(session.dayOfWeek),
  });
  return (
    <section
      aria-label={session.name || `Sesión ${String(position)}, sin nombre`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <details
        open={open}
        onToggle={(event) => {
          setOpen(event.currentTarget.open);
        }}
      >
        <summary className="cursor-pointer py-2 font-medium">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>
              {session.name} · {day}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {exercises.length === 1 ? '1 ejercicio' : `${String(exercises.length)} ejercicios`}
            </span>
          </span>
        </summary>
        <div className="flex flex-col gap-3 pt-2">
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <TextField
              label="Nombre de la sesión"
              maxLength={120}
              autoComplete="off"
              value={session.name}
              onChange={(event) => {
                onChange({ ...session, name: event.target.value });
              }}
            />
            <Select
              label="Día"
              hint="Sin día fijo, va según su orden: la sesión 1, el día 1 de la semana."
              options={[{ value: NONE, label: 'Sin día fijo' }, ...WEEKDAY_OPTIONS]}
              value={session.dayOfWeek}
              onValueChange={(dayOfWeek) => {
                onChange({ ...session, dayOfWeek });
              }}
            />
          </div>
          {exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta sesión todavía no tiene ejercicios.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {exercises.map((exercise, index) => (
                <ExerciseEditor
                  key={exercise.key}
                  exercise={exercise}
                  position={index + 1}
                  total={exercises.length}
                  showApproval={showApproval}
                  onChange={(next) => {
                    onChange({ ...session, exercises: replaceAt(exercises, index, next) });
                  }}
                  onRemove={() => {
                    onChange({ ...session, exercises: removeAt(exercises, index) });
                  }}
                  onMove={(delta) => {
                    onChange({ ...session, exercises: moveAt(exercises, index, delta) });
                  }}
                />
              ))}
            </ol>
          )}
          <ExercisePicker
            label={`Agregar ejercicio a ${session.name}`}
            value={null}
            onChange={(exercise) => {
              if (exercise) {
                onChange({ ...session, exercises: [...exercises, newExerciseDraft(exercise)] });
              }
            }}
          />
          <TextAreaField
            label="Notas de la sesión"
            rows={2}
            className="min-h-16"
            maxLength={500}
            value={session.notes}
            onChange={(event) => {
              onChange({ ...session, notes: event.target.value });
            }}
          />
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Quitar ${session.name}`}
              onClick={onRemove}
            >
              Quitar sesión
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}

/** La fase de la semana: viene de la tabla en una propuesta y el coach la puede ajustar (RN-F13, P-07). */
function PhaseFields({
  draft,
  onChange,
}: {
  draft: WeekDraft;
  onChange: (draft: WeekDraft) => void;
}) {
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer py-2 font-medium">Fase de la semana</summary>
      <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Fase"
          maxLength={120}
          autoComplete="off"
          value={draft.phaseEs}
          onChange={(event) => {
            onChange({ ...draft, phaseEs: event.target.value });
          }}
        />
        <TextField
          label="Objetivo de la fase"
          maxLength={120}
          autoComplete="off"
          value={draft.phaseGoalEs}
          onChange={(event) => {
            onChange({ ...draft, phaseGoalEs: event.target.value });
          }}
        />
        <TextField
          label="Factor de volumen"
          inputMode="decimal"
          autoComplete="off"
          value={draft.volumeFactor}
          onChange={(event) => {
            onChange({ ...draft, volumeFactor: event.target.value });
          }}
        />
        <Select
          label="Intensidad"
          options={INTENSITY_OPTIONS}
          value={draft.intensity}
          onValueChange={(value) => {
            onChange({ ...draft, intensity: value as WeekDraft['intensity'] });
          }}
        />
        <TextField
          label="RIR objetivo"
          inputMode="numeric"
          autoComplete="off"
          value={draft.targetRir}
          onChange={(event) => {
            onChange({ ...draft, targetRir: event.target.value });
          }}
        />
        <Select
          label="Revisión"
          options={REVIEW_OPTIONS}
          value={draft.reviewKind}
          onValueChange={(value) => {
            onChange({ ...draft, reviewKind: value as WeekDraft['reviewKind'] });
          }}
        />
        <CheckboxField
          label="Semana de descarga"
          checked={draft.isDeload}
          onChange={(event) => {
            onChange({ ...draft, isDeload: event.target.checked });
          }}
        />
      </div>
    </details>
  );
}

/**
 * Editar una semana (RF-26): su fase, sus sesiones, sus ejercicios y sus series. Mientras se guarda, nada se escribe: lo escrito en ese
 * momento se perdería al volver lo guardado.
 */
export function WeekEditor({
  weekNo,
  draft,
  origin,
  saving,
  onChange,
}: {
  weekNo: number;
  draft: WeekDraft;
  origin: ProgramOrigin;
  saving: boolean;
  onChange: (draft: WeekDraft) => void;
}) {
  const { sessions } = draft;
  return (
    <fieldset disabled={saving} className="flex min-w-0 flex-col gap-4">
      <legend className="sr-only">Semana {weekNo}</legend>
      <PhaseFields draft={draft} onChange={onChange} />
      {sessions.map((session, index) => (
        <SessionEditor
          key={session.key}
          session={session}
          position={index + 1}
          showApproval={origin === 'PROPOSAL'}
          onChange={(next) => {
            onChange({ ...draft, sessions: replaceAt(sessions, index, next) });
          }}
          onRemove={() => {
            onChange({ ...draft, sessions: removeAt(sessions, index) });
          }}
        />
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onChange({ ...draft, sessions: [...sessions, newSessionDraft(sessions.length + 1)] });
          }}
        >
          Agregar sesión
        </Button>
      </div>
    </fieldset>
  );
}
