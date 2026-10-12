import { buttonVariants } from '@nutricoach/ui';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { pluralLabel } from '@/features/organization/labels';
import { PatientList } from '@/features/patients/patient-list';
import { patientLabel } from '@/features/patients/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: pluralLabel(await patientLabel()) };
}

/** Pacientes de la organización que el profesional puede ver (RF-08, RN-A05). */
export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, estado } = await searchParams;
  const text = typeof q === 'string' ? q : '';
  const archived = estado === 'archivados';
  const label = await patientLabel();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{pluralLabel(label)}</h1>
        <Link href="/panel/pacientes/nuevo" className={buttonVariants({ className: 'ml-auto' })}>
          <Plus aria-hidden />
          Nuevo {label.toLowerCase()}
        </Link>
      </div>
      <PatientList
        key={`${text}|${String(archived)}`}
        text={text}
        archived={archived}
        patientLabel={label}
      />
    </div>
  );
}
