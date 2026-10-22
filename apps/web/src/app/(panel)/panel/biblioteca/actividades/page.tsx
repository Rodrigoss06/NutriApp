import type { Metadata } from 'next';
import { ActivitySearch } from '@/features/activities/activity-search';
import { Section } from '@/features/patients/section';

export const metadata: Metadata = { title: 'Actividades' };

/** Actividades del Compendium 2024 con su MET, para el gasto por ejercicio (RN-E03). */
export default function ActivitiesPage() {
  return (
    <Section
      title="Actividades"
      description="Con su MET: el gasto de la actividad frente al reposo. Se agregan a una prescripción energética desde el expediente."
    >
      <ActivitySearch />
    </Section>
  );
}
