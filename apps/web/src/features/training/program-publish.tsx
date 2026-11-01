'use client';

import { Button, ConfirmDialog, Notice } from '@nutricoach/ui';
import { FormError } from '@/features/forms/form-error';
import { PublishProblems } from '@/features/nutrition-plan/plan-parts';

/**
 * Publicar el programa (RN-F12): lo que falta y la confirmación. A mano se puede publicar con una llave cerrada, con el aviso; queda registrado
 * en el evento (ADR-070).
 */
export function ProgramPublishPanel({
  versionNo,
  dirty,
  problems,
  closedKey,
  publishing,
  error,
  onPublish,
}: {
  versionNo: number;
  dirty: boolean;
  problems: readonly string[];
  closedKey: boolean;
  publishing: boolean;
  error: unknown;
  onPublish: () => void;
}) {
  return (
    <section
      aria-labelledby="publicar-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="publicar-titulo" className="font-semibold">
        Publicar la versión {versionNo}
      </h3>
      {closedKey ? (
        <Notice tone="warning" title="Una llave de seguridad sigue cerrada" rule="RN-F15">
          A mano se puede publicar, y queda registrado.
        </Notice>
      ) : null}
      {problems.length > 0 ? (
        <PublishProblems problems={problems} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Al publicar, el programa queda vigente y no se edita más; el que estaba vigente queda
          reemplazado (RN-F12).
        </p>
      )}
      {dirty ? (
        <p className="text-sm text-muted-foreground">Guarda los cambios antes de publicar.</p>
      ) : null}
      <FormError error={error} title="No se publicó el programa" />
      <div>
        <ConfirmDialog
          trigger={
            <Button variant="secondary" disabled={dirty || problems.length > 0 || publishing}>
              {publishing ? 'Publicando…' : 'Publicar programa'}
            </Button>
          }
          title={`¿Publicar la versión ${String(versionNo)}?`}
          description="Será el programa vigente y guarda una copia con los músculos de cada ejercicio. Un programa publicado no se edita: para cambiarlo, se crea una versión nueva."
          confirmLabel="Publicar"
          tone="danger"
          onConfirm={onPublish}
        />
      </div>
    </section>
  );
}

/** Guardar la semana: solo aparece si hay cambios, y queda a la vista mientras se recorre una semana larga. */
export function WeekSaveBar({
  weekNo,
  problems,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  weekNo: number;
  /** Lo que hay que revisar para poder guardar. */
  problems: readonly string[];
  saving: boolean;
  error: unknown;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Guardar la semana"
      className="sticky bottom-2 z-10 flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg"
    >
      {problems.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>Para guardar, revisa:</p>
          <ul aria-label="Lo que hay que revisar" className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormError error={error} title="No se guardó la semana" />
      <div className="flex flex-wrap gap-2">
        <Button disabled={problems.length > 0 || saving} onClick={onSave}>
          {saving ? 'Guardando…' : `Guardar semana ${String(weekNo)}`}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onDiscard}>
          Descartar cambios
        </Button>
      </div>
    </div>
  );
}
