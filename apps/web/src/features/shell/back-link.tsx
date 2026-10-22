'use client';

import { Button } from '@nutricoach/ui';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** Vuelve a la pantalla anterior; si se abrió sola (un enlace directo, la app instalada), a la entrada. */
export function BackLink() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/entrar');
      }}
    >
      <ArrowLeft aria-hidden />
      Volver
    </Button>
  );
}
