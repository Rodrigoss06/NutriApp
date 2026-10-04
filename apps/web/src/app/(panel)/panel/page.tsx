import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Panel' };

export default function PanelPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Panel del profesional</h1>
      <p className="mt-2">Página de prueba del grupo (panel).</p>
    </main>
  );
}
