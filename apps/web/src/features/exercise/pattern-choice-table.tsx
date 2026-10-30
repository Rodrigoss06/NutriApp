'use client';

import {
  MOVEMENT_PATTERN_LABELS,
  MOVEMENT_PATTERNS,
  TRAINING_LEVEL_LABELS,
  TRAINING_LEVELS,
  type ExerciseListResponse,
  type MovementPatternCode,
  type PatternChoice,
  type PatternChoiceListResponse,
  type TrainingLevelCode,
} from '@nutricoach/contracts';
import { Button, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { TableScroll } from '@/features/shell/table-scroll';
import { apiFetch } from '@/lib/api/client';

interface Cell {
  readonly pattern: MovementPatternCode;
  readonly level: TrainingLevelCode;
}

/**
 * El ejercicio que sugiere la propuesta por patrón y nivel (RN-F14, 07 §5). Parte de la tabla de la V3 y cada
 * organización reemplaza las filas que quiera: solo cuenta para las propuestas siguientes.
 */
export function PatternChoiceTable({ initial }: { initial: readonly PatternChoice[] }) {
  const canWrite = useCanWrite();
  const [choices, setChoices] = useState(initial);
  const [editing, setEditing] = useState<Cell | null>(null);
  const update = useMutation({
    mutationFn: ({ cell, exerciseId }: { cell: Cell; exerciseId: string | null }) =>
      apiFetch<PatternChoiceListResponse>(
        `/exercise-pattern-choices/${cell.pattern}/${cell.level}`,
        exerciseId ? { method: 'PUT', body: { exerciseId } } : { method: 'DELETE' },
      ),
    onSuccess: (response) => {
      setChoices(response.choices);
      setEditing(null);
    },
  });
  const options = useQuery({
    queryKey: ['exercises', 'pattern', editing?.pattern],
    queryFn: () =>
      apiFetch<ExerciseListResponse>(`/exercises?pattern=${editing?.pattern ?? ''}&limit=200`),
    enabled: editing !== null,
  });
  const choiceOf = (pattern: MovementPatternCode, level: TrainingLevelCode) =>
    choices.find((choice) => choice.pattern === pattern && choice.level === level);

  return (
    <div className="flex flex-col gap-3">
      <FormError error={update.error} title="No se pudo cambiar la tabla" />
      <TableScroll label="Ejercicio sugerido por patrón y nivel">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Ejercicio sugerido por patrón y nivel</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Patrón
              </th>
              {TRAINING_LEVELS.map((level) => (
                <th key={level} scope="col" className="px-3 py-2 font-medium">
                  {TRAINING_LEVEL_LABELS[level]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOVEMENT_PATTERNS.map((pattern) => (
              <tr key={pattern} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {MOVEMENT_PATTERN_LABELS[pattern]}
                </th>
                {TRAINING_LEVELS.map((level) => {
                  const choice = choiceOf(pattern, level);
                  const open = editing?.pattern === pattern && editing.level === level;
                  const place = `${MOVEMENT_PATTERN_LABELS[pattern]}, ${TRAINING_LEVEL_LABELS[level]}`;
                  return (
                    <td key={level} className="min-w-48 px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span>{choice?.exercise.name ?? 'Sin ejercicio'}</span>
                        {choice?.own ? (
                          <StatusBadge tone="info">De tu organización</StatusBadge>
                        ) : null}
                        {choice?.provisional ? (
                          <StatusBadge tone="warning">Provisional</StatusBadge>
                        ) : null}
                        {open ? (
                          <div className="flex w-full flex-col gap-2">
                            <Select
                              label={`Ejercicio para ${place}`}
                              disabled={!options.data || update.isPending}
                              value={choice?.exercise.id}
                              onValueChange={(exerciseId) => {
                                update.mutate({ cell: { pattern, level }, exerciseId });
                              }}
                              options={(options.data?.exercises ?? []).map(({ id, name }) => ({
                                value: id,
                                label: name,
                              }))}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(null);
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : canWrite ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Cambiar ${place}`}
                              onClick={() => {
                                setEditing({ pattern, level });
                              }}
                            >
                              Cambiar
                            </Button>
                            {choice?.own ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Volver a la original en ${place}`}
                                disabled={update.isPending}
                                onClick={() => {
                                  update.mutate({
                                    cell: { pattern, level },
                                    exerciseId: null,
                                  });
                                }}
                              >
                                Volver a la original
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
