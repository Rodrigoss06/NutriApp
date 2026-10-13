import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { RegisterPatientForm } from '@/features/patients/register-form';
import { getMembers, patientLabel } from '@/features/patients/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Nuevo ${(await patientLabel()).toLowerCase()}` };
}

export default async function NewPatientPage() {
  const [members, label] = await Promise.all([getMembers(), patientLabel()]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nuevo {label.toLowerCase()}</h1>
      {members.ok ? (
        <RegisterPatientForm members={members.data.members} />
      ) : (
        <Notice tone="danger" title="No pudimos cargar el formulario" />
      )}
    </div>
  );
}
