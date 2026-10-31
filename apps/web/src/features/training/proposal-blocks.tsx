'use client';

import {
  MOVEMENT_PATTERN_LABELS,
  type ApproveBlock,
  type ExerciseRef,
  type ProgramDocument,
} from '@nutricoach/contracts';
import { Button, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ExercisePicker } from '@/features/exercise/exercise-picker';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { proposalBlocks, setDraftOf, setsSummary, type ProposalBlock } from './program-draft';
import type { ProgramEditor as Editor } from './use-program';

const WEEK_LIST = new Intl.ListFormat('es', { type: 'conjunction' });

function BlockRow({
  block,
  locked,
  write,
  onApproved,
}: {
  block: ProposalBlock;
  locked: boolean;
  write: Editor['write'];
  onApproved: () => void;
}) {
  const { exercise, day, order } = block;
  const [substituting, setSubstituting] = useState(false);
  const [replacement, setReplacement] = useState<ExerciseRef | null>(null);
  const [note, setNote] = useState('');
  const approve = useMutation({
    mutationFn: (body: ApproveBlock) => write('/blocks/approve', { method: 'POST', body }),
    onSuccess: () => {
      setSubstituting(false);
      setReplacement(null);
      setNote('');
      onApproved();
    },
  });
  const pattern = exercise.movementPattern ?? exercise.pattern;
  const disabled = locked || approve.isPending;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {order}. {exercise.name}
            </span>
            <StatusBadge tone={block.approved ? 'success' : 'warning'}>
              {block.approved ? 'Aprobado' : 'Por aprobar'}
            </StatusBadge>
            {block.substituted ? <StatusBadge tone="info">Sustituido</StatusBadge> : null}
          </span>
          <span className="text-sm text-muted-foreground">
            {MOVEMENT_PATTERN_LABELS[pattern]} · Semana {block.weekNo}:{' '}
            {setsSummary(exercise.sets.map(setDraftOf))}
          </span>
          <span className="text-sm text-muted-foreground">
            {exercise.primaryMuscles.map(({ name }) => name).join(', ')}
            {exercise.caution ? ` · Precaución: ${exercise.caution}` : ''}
          </span>
          {block.otherExercises.map((other) => (
            <span key={other.name} className="text-sm">
              Semana {WEEK_LIST.format(other.weeks.map(String))}: {other.name}
            </span>
          ))}
          {exercise.substitutionNote ? (
            <span className="text-sm whitespace-pre-wrap">Nota: {exercise.substitutionNote}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {block.approved ? null : (
            <Button
              size="sm"
              data-approve
              aria-label={`Aprobar ${exercise.name}, día ${String(day)}, orden ${String(order)}`}
              disabled={disabled}
              onClick={() => {
                approve.mutate({ day, order });
              }}
            >
              Aprobar
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={substituting}
            aria-label={`Sustituir ${exercise.name}, día ${String(day)}, orden ${String(order)}`}
            disabled={disabled}
            onClick={() => {
              setSubstituting((open) => !open);
            }}
          >
            Sustituir
          </Button>
        </div>
      </div>
      {substituting ? (
        <div
          role="group"
          aria-label={`Sustituir ${exercise.name}`}
          className="flex flex-col gap-3 rounded-md border border-border p-3"
        >
          <ExercisePicker
            label="Ejercicio que lo sustituye"
            pattern={pattern}
            exclude={exercise.exerciseId}
            value={replacement}
            onChange={setReplacement}
          />
          <TextAreaField
            label="Nota de la sustitución"
            hint="Opcional."
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <div>
            <Button
              size="sm"
              disabled={disabled || replacement === null}
              onClick={() => {
                approve.mutate({ day, order, exerciseId: replacement?.id ?? null, note });
              }}
            >
              Aprobar la sustitución
            </Button>
          </div>
        </div>
      ) : null}
      <FormError error={approve.error} title="No se aprobó" />
    </li>
  );
}

/**
 * Aprobar o sustituir cada bloque de la propuesta, en todas sus semanas (RN-F14). Aprobado uno, el foco pasa al siguiente por aprobar: el
 * botón desaparece y, con el teclado, se seguiría desde el principio de la página.
 */
export function ProposalBlocks({
  document,
  locked,
  write,
}: {
  document: ProgramDocument;
  locked: boolean;
  write: Editor['write'];
}) {
  const list = useRef<HTMLDetailsElement>(null);
  const blocks = proposalBlocks(document);
  const approved = blocks.filter((block) => block.approved).length;
  const days = [...new Set(blocks.map((block) => block.day))];
  return (
    <details
      ref={list}
      open={approved < blocks.length}
      className="rounded-lg border border-border bg-card p-4"
    >
      <summary className="cursor-pointer py-2 font-semibold">
        <span className="inline-flex flex-wrap items-center gap-2">
          Aprobación de la propuesta
          <StatusBadge tone={approved === blocks.length ? 'success' : 'warning'}>
            {approved} de {blocks.length} aprobados
          </StatusBadge>
        </span>
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-sm text-muted-foreground">
          Es una propuesta: apruebas o sustituyes cada ejercicio, y vale para todas sus semanas.
          Solo se publica aprobada (RN-F14). Sustituir no cambia las series.
        </p>
        {locked ? (
          <p className="text-sm text-muted-foreground">
            Guarda o descarta los cambios de la semana antes de aprobar.
          </p>
        ) : null}
        {days.map((day) => {
          const ofDay = blocks.filter((block) => block.day === day);
          return (
            <section key={day} aria-label={`Bloques del día ${String(day)}`}>
              <h4 className="font-medium">
                Día {day}: {ofDay[0]?.dayName}
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {ofDay.map((block) => (
                  <BlockRow
                    key={`${String(block.day)}:${String(block.order)}`}
                    block={block}
                    locked={locked}
                    write={write}
                    onApproved={() => {
                      requestAnimationFrame(() => {
                        list.current?.querySelector<HTMLButtonElement>('[data-approve]')?.focus();
                      });
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
