import { EmptyState } from '@nutricoach/ui';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { LogoutButton } from '@/features/session/session-actions';

export const metadata: Metadata = { title: 'Panel interno' };

export default function PlatformPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Panel interno</h1>
      <EmptyState
        icon={ShieldCheck}
        title="El panel interno llega en P15"
        description="Mientras tanto, las organizaciones y suscripciones se administran con la API de plataforma."
      />
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
