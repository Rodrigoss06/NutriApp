import type { PatientExportListResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { PatientExportPanel } from '@/features/patient-export/patient-export-panel';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Tus datos' };

/**
 * Tus datos (RN-B04; ADR-131, ADR-132): descargar todo lo que guarda tu equipo sobre ti, en un ZIP con JSON y CSV, tus fichas en PDF y
 * tus archivos. Queda 24 horas, solo para ti.
 */
export default async function Page() {
  const exports = await serverApi<PatientExportListResponse>('/me/exports');
  if (!exports.ok) return <Notice tone="danger" title="No pudimos cargar esta sección" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tus datos</h1>
      <p className="text-muted-foreground">
        Descarga todo lo que tu equipo guarda sobre ti: tus datos en JSON y CSV, tus fichas en PDF y
        tus archivos (documentos, fotos de progreso y evidencias), en un ZIP. Queda 24 horas para
        descargarlo, solo para ti. Las notas privadas de tu profesional no van.
      </p>
      <PatientExportPanel endpoint="/me/exports" initial={exports.data} size="touch" />
    </div>
  );
}
