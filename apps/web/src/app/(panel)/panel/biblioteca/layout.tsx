import type { ReactNode } from 'react';
import { LibraryTabs } from '@/features/food/library-tabs';

/**
 * Biblioteca (RF-38): alimentos de referencia y propios, recetas (RF-21), un plato armado, actividades y listas de
 * intercambio.
 */
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Biblioteca</h1>
      <LibraryTabs />
      {children}
    </div>
  );
}
