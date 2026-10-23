import type { Metadata } from 'next';
import { Section } from '@/features/patients/section';
import { RecipeForm } from '@/features/recipe/recipe-form';

export const metadata: Metadata = { title: 'Nueva receta' };

/** Receta de la organización (RF-21): el motor calcula sus nutrientes por porción (RN-E12). */
export default function NewRecipePage() {
  return (
    <Section
      title="Nueva receta"
      description="Solo la ve tu organización. Sirve para el menú semanal y para el recetario del paciente."
    >
      <RecipeForm />
    </Section>
  );
}
