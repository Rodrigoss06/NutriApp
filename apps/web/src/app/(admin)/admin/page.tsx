import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Panel interno' };

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Panel interno</h1>
      <p className="mt-2">Página de prueba del grupo (admin).</p>
    </main>
  );
}
