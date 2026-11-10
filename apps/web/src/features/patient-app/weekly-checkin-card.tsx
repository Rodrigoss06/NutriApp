'use client';

import type { LogWeeklyCheckin, MeWeeklyCheckin, WeeklyCheckin } from '@nutricoach/contracts';
import { Button, Notice, NumberField } from '@nutricoach/ui';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { TextAreaField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { newClientId, useRecord } from './records';
import {
  closesText,
  weeklyCheckinBody,
  weeklyCheckinProblems,
  type WeeklyCheckinValues,
} from './weekly-checkin';

/**
 * El check-in de la semana (P-21, P-22; ADR-109): del domingo al martes, cuánto siguió su plan de alimentación, su peso si su app lo
 * permite y un comentario para su equipo, que le llega como nota. Enviarlo otra vez dentro del plazo lo corrige.
 */
export function WeeklyCheckinCard({ checkin }: { checkin: MeWeeklyCheckin }) {
  const [editing, setEditing] = useState(checkin.done === null);
  const [values, setValues] = useState<WeeklyCheckinValues>({
    nutritionCompliancePct: checkin.done?.nutritionCompliancePct ?? null,
    bodyWeightKg: null,
    comment: '',
  });
  const [touched, setTouched] = useState(false);
  const record = useRecord<LogWeeklyCheckin, WeeklyCheckin>('/me/weekly-checkins');
  const problems = weeklyCheckinProblems(values);
  const valid = Object.keys(problems).length === 0;
  const done = record.data ?? checkin.done;
  return (
    <section
      aria-labelledby="checkin-semana"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h2 id="checkin-semana" className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck aria-hidden className="size-5" /> Check-in de la semana
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{closesText(checkin)}</p>
      {done && !editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <Notice tone="success" title="Check-in enviado">
            Tu alimentación de la semana: {done.nutritionCompliancePct} %.
            {done.withComment ? ' Tu equipo recibió tu comentario.' : ''}
          </Notice>
          <Button
            variant="secondary"
            size="touch"
            onClick={() => {
              record.reset();
              setTouched(false);
              setEditing(true);
            }}
          >
            Corregir
          </Button>
        </div>
      ) : (
        <form
          noValidate
          aria-label="Check-in de la semana"
          className="mt-3 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!valid) return;
            record.mutate(weeklyCheckinBody(checkin, values, newClientId()), {
              onSuccess: () => {
                // El peso y el comentario ya quedaron: corregir no los repite.
                setValues((current) => ({ ...current, bodyWeightKg: null, comment: '' }));
                setEditing(false);
              },
            });
          }}
        >
          <NumberField
            label="Cuánto de tu plan de alimentación cumpliste esta semana"
            unit="%"
            inputMode="numeric"
            value={values.nutritionCompliancePct}
            onValueChange={(nutritionCompliancePct) => {
              setValues((current) => ({ ...current, nutritionCompliancePct }));
            }}
            hint="De 0 a 100 %."
            error={touched ? problems.nutritionCompliancePct : undefined}
            required
          />
          {checkin.asksWeight ? (
            <NumberField
              label="Tu peso de hoy"
              unit="kg"
              value={values.bodyWeightKg}
              onValueChange={(bodyWeightKg) => {
                setValues((current) => ({ ...current, bodyWeightKg }));
              }}
              hint="Opcional. En ayunas y con poca ropa, si puedes."
              error={touched ? problems.bodyWeightKg : undefined}
            />
          ) : null}
          <TextAreaField
            label="Comentarios para tu equipo"
            hint="Opcional. Le llega como una nota."
            maxLength={2_000}
            value={values.comment}
            onChange={(event) => {
              const comment = event.target.value;
              setValues((current) => ({ ...current, comment }));
            }}
          />
          <FormError error={record.error} title="No se envió tu check-in" />
          <Button type="submit" size="touch" disabled={record.isPending}>
            Enviar check-in
          </Button>
        </form>
      )}
    </section>
  );
}
