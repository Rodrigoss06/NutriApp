'use client';

import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  formatNumber,
  NumberField,
  Select,
} from '@nutricoach/ui';
import { Users } from 'lucide-react';
import { useState } from 'react';

const PAGES: Record<
  string,
  { rows: { id: string; name: string; weightKg: number }[]; next: string | null }
> = {
  start: {
    rows: [
      { id: 'p1', name: 'Paciente de ejemplo 1', weightKg: 80 },
      { id: 'p2', name: 'Paciente de ejemplo 2', weightKg: 64.35 },
    ],
    next: 'c2',
  },
  c2: { rows: [{ id: 'p3', name: 'Paciente de ejemplo 3', weightKg: 71.2 }], next: null },
};

/** Componentes con estado del catálogo, con datos sintéticos. */
export function InteractiveExamples() {
  const [weightKg, setWeightKg] = useState<number | null>(80);
  const [triceps, setTriceps] = useState<number | null>(null);
  const [level, setLevel] = useState<string>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const page = PAGES[cursor ?? 'start'] ?? { rows: [], next: null };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="campos" className="flex flex-col gap-4">
        <h2 id="campos" className="text-xl font-semibold">
          Campos
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Peso"
            unit="kg"
            value={weightKg}
            onValueChange={setWeightKg}
            hint="Acepta coma o punto."
          />
          <NumberField
            label="Pliegue del tríceps"
            unit="mm"
            value={triceps}
            onValueChange={setTriceps}
            error={
              triceps !== null && (triceps < 0 || triceps > 80)
                ? 'Entre 0 y 80 mm (RN-C04)'
                : undefined
            }
          />
          <Select
            label="Nivel de evaluación"
            value={level}
            onValueChange={setLevel}
            options={[
              { value: 'BASIC', label: 'Básico' },
              { value: 'ISAK1', label: 'ISAK 1 (restringido)' },
              { value: 'ISAK2', label: 'ISAK 2 (completo)' },
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Valor leído: <span className="tabular-nums">{formatNumber(weightKg, 'mass')}</span> kg
        </p>
      </section>

      <section aria-labelledby="tabla" className="flex flex-col gap-4">
        <h2 id="tabla" className="text-xl font-semibold">
          Tabla con paginación por cursor
        </h2>
        <DataTable
          caption="Pacientes de ejemplo"
          columns={[
            { key: 'name', header: 'Nombre', cell: (row) => row.name },
            {
              key: 'weight',
              header: 'Peso (kg)',
              numeric: true,
              cell: (row) => formatNumber(row.weightKg, 'mass'),
            },
          ]}
          rows={page.rows}
          rowKey={(row) => row.id}
          nextCursor={page.next}
          onCursorChange={setCursor}
          empty={<EmptyState icon={Users} title="Aún no hay pacientes" />}
        />
      </section>

      <section aria-labelledby="dialogo" className="flex flex-col gap-4">
        <h2 id="dialogo" className="text-xl font-semibold">
          Diálogo de confirmación
        </h2>
        <div className="flex items-center gap-4">
          <ConfirmDialog
            trigger={<Button variant="danger">Archivar paciente</Button>}
            title="¿Archivar a este paciente?"
            description="Libera su cupo y conserva toda su historia. Puedes reactivarlo cuando quieras."
            confirmLabel="Archivar"
            tone="danger"
            onConfirm={() => {
              setConfirmed(true);
            }}
          />
          <p role="status" className="text-sm">
            {confirmed ? 'Archivado (ejemplo).' : ''}
          </p>
        </div>
      </section>
    </div>
  );
}
