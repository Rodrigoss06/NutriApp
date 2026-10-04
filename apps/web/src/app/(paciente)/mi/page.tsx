import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hoy' };

// El texto visible no dice «Paciente»: esa palabra sale de la configuración de la organización.
export default function TodayPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-semibold">Hoy</h1>
      <p className="mt-2">Página de prueba de la app instalable.</p>
    </main>
  );
}
