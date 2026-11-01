'use client';

import { methodLabel, type ExchangeNutritionPlan } from '@nutricoach/contracts';
import { Button, ConfirmDialog, formatNumber, MethodBadge, StatusBadge } from '@nutricoach/ui';
import Link from 'next/link';
import { TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { hydrationOf } from './draft';
import { hydrationReferences } from './portion';

const ML = new Intl.NumberFormat('es-PE');
/** Un plan nuevo tiene muchos pendientes: se ven los primeros y el resto se despliega. */
const SHOWN_PROBLEMS = 3;

/** Las metas del día, exactas, de la prescripción energética del plan (RF-18, RN-D09). */
export function TargetsCard({
  targets,
  patientId,
  energyPrescriptionId,
}: {
  targets: ExchangeNutritionPlan['targets'];
  patientId: string;
  energyPrescriptionId: string;
}) {
  return (
    <section
      aria-labelledby="metas-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="metas-titulo" className="font-semibold">
        Metas del día
      </h3>
      <MethodBadge label={methodLabel('MACROS_PROTEIN_FIRST')} code="MACROS_PROTEIN_FIRST" />
      <dl className="grid gap-2 sm:grid-cols-4">
        {(
          [
            ['Energía', targets.kcal, 'kcal', 'kcal'],
            ['Carbohidratos', targets.choG, 'grams', 'g'],
            ['Proteína', targets.proteinG, 'grams', 'g'],
            ['Grasa', targets.fatG, 'grams', 'g'],
          ] as const
        ).map(([label, value, kind, unit]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatNumber(value, kind)} {unit}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Salen de la prescripción energética, sin redondear (RF-18).{' '}
        <Link
          href={`/panel/pacientes/${patientId}/energia/${energyPrescriptionId}`}
          className="text-brand-text underline"
        >
          Ver la prescripción
        </Link>
      </p>
    </section>
  );
}

/** La meta de hidratación la fija el profesional; las ingestas adecuadas son solo una ayuda (RN-E13). */
export function HydrationCard({
  value,
  onChange,
  patientSex,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  patientSex: 'M' | 'F';
  disabled: boolean;
}) {
  return (
    <section
      aria-labelledby="hidratacion-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="hidratacion-titulo" className="font-semibold">
        Hidratación
      </h3>
      <div className="max-w-xs">
        <TextField
          label="Meta de hidratación (ml por día)"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={value}
          error={hydrationOf(value) === undefined ? 'Un entero de 1 a 10000 ml.' : undefined}
          hint="Hace falta para publicar (RN-E13)."
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">
          Ingesta adecuada de agua total para {patientSex === 'F' ? 'mujeres' : 'hombres'} adultos,
          con el agua de los alimentos. Es una referencia: la meta la decides tú.
        </p>
        <ul className="flex flex-wrap gap-2">
          {hydrationReferences(patientSex).map((reference) => (
            <li key={reference.source}>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  onChange(String(reference.ml));
                }}
              >
                Usar {ML.format(reference.ml)} ml ({reference.source})
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Lo que falta para publicar un plan o un programa, con los primeros a la vista. */
export function PublishProblems({ problems }: { problems: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>Para publicar falta:</p>
      <ul aria-label="Lo que falta para publicar" className="list-disc pl-5">
        {problems.slice(0, SHOWN_PROBLEMS).map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      {problems.length > SHOWN_PROBLEMS ? (
        <details>
          <summary className="cursor-pointer text-brand-text">
            Ver {problems.length - SHOWN_PROBLEMS} más
          </summary>
          <ul className="list-disc pl-5">
            {problems.slice(SHOWN_PROBLEMS).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Guardar el borrador y publicarlo (RN-E14, RN-E15): lo que falta para publicar, los cambios sin guardar y la
 * confirmación. Un plan publicado no se edita.
 */
export function DraftPanel({
  versionNo,
  dirty,
  invalid,
  disabled,
  problems,
  saving,
  saveError,
  onSave,
  publishing,
  publishError,
  onPublish,
}: {
  versionNo: number;
  dirty: boolean;
  /** Algún campo no tiene un valor válido: no se puede guardar. */
  invalid: boolean;
  disabled: boolean;
  problems: readonly string[];
  saving: boolean;
  saveError: unknown;
  onSave: () => void;
  publishing: boolean;
  publishError: unknown;
  onPublish: () => void;
}) {
  return (
    <section
      aria-labelledby="borrador-titulo"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="borrador-titulo" className="font-semibold">
        Borrador · versión {versionNo}
      </h3>
      <p className="text-sm" role="status">
        {dirty ? (
          <StatusBadge tone="warning">Cambios sin guardar</StatusBadge>
        ) : (
          <StatusBadge tone="success">Guardado</StatusBadge>
        )}
      </p>
      <FormError error={saveError} title="No se guardó el borrador" />
      <Button disabled={disabled || !dirty || invalid || saving} onClick={onSave}>
        {saving ? 'Guardando…' : 'Guardar borrador'}
      </Button>

      <h4 className="pt-2 font-semibold">Publicar</h4>
      {problems.length > 0 ? (
        <PublishProblems problems={problems} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Al publicar, el plan vale desde hoy y no se edita más; el que estaba vigente queda
          reemplazado (RN-E14, RN-E15).
        </p>
      )}
      {dirty ? (
        <p className="text-sm text-muted-foreground">Guarda los cambios antes de publicar.</p>
      ) : null}
      <FormError error={publishError} title="No se publicó el plan" />
      <ConfirmDialog
        trigger={
          <Button
            variant="secondary"
            disabled={disabled || dirty || problems.length > 0 || publishing}
          >
            {publishing ? 'Publicando…' : 'Publicar plan'}
          </Button>
        }
        title={`¿Publicar la versión ${String(versionNo)}?`}
        description="Desde hoy será el plan vigente del paciente y aparecerá en su app. Un plan publicado no se edita: para cambiarlo, se crea una versión nueva."
        confirmLabel="Publicar"
        tone="danger"
        onConfirm={onPublish}
      />
    </section>
  );
}
