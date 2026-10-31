'use client';

import { Button, describedBy, FieldMessages, Label } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { checkEvidence, EVIDENCE_ACCEPT } from '@/features/patients/evidence';

const HINT = 'PDF, JPG o PNG de hasta 5 MB. Exige el consentimiento de imágenes vigente.';

/** El archivo de una prueba ya guardada (07 §4): se sube validado y se baja solo por la API, como adjunto y auditado (ADR-038). */
export function TestEvidence({
  evaluationId,
  testCode,
  testName,
  recorded,
  hasFile,
  editable,
  onAttach,
  onRemove,
}: {
  evaluationId: string;
  testCode: string;
  testName: string;
  /** La prueba ya tiene su fila: el archivo se adjunta a ella. */
  recorded: boolean;
  hasFile: boolean;
  editable: boolean;
  onAttach: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const attach = useMutation({ mutationFn: onAttach });
  const remove = useMutation({ mutationFn: onRemove });
  const pending = attach.isPending || remove.isPending;

  const onFile = async (chosen: File | undefined) => {
    setProblem(null);
    attach.reset();
    if (!chosen) return;
    const found = await checkEvidence(chosen);
    if (found) {
      setProblem(found);
      return;
    }
    attach.mutate(chosen);
  };

  if (hasFile) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/v1/functional-evaluations/${evaluationId}/tests/${testCode}/evidence`}
            className="flex min-h-touch items-center text-sm text-brand-text underline underline-offset-4"
          >
            Descargar evidencia de {testName}
          </a>
          {editable ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                remove.mutate();
              }}
            >
              Quitar archivo
            </Button>
          ) : null}
        </div>
        <FormError error={remove.error} title="No se pudo quitar el archivo" />
      </div>
    );
  }
  if (!editable) return null;
  if (!recorded) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la prueba para poder adjuntar un archivo.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Archivo de evidencia</Label>
      <input
        id={id}
        type="file"
        accept={EVIDENCE_ACCEPT}
        disabled={pending}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy(id, HINT, problem)}
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          // Se limpia ya: tras un error, elegir otra vez el mismo archivo vuelve a dispararlo.
          event.currentTarget.value = '';
          void onFile(chosen);
        }}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-brand-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-text"
      />
      <FieldMessages id={id} hint={HINT} error={problem} />
      <p role="status" className="text-sm text-muted-foreground">
        {attach.isPending ? 'Subiendo el archivo…' : ''}
      </p>
      <FormError error={attach.error} title="No se pudo subir el archivo" />
    </div>
  );
}
