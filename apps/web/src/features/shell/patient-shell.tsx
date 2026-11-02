import type { AppSection } from '@nutricoach/contracts';
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';
import { PatientBottomNav } from './patient-bottom-nav';

/** App del paciente (02 §11): primero el celular, con barra inferior y objetivos táctiles de 44 px. */
export function PatientShell({
  displayName,
  logoUrl,
  sections,
  children,
}: {
  displayName: string;
  logoUrl: string | null;
  /** Las secciones a la vista (RF-27); null si no se pudieron leer: se muestran todas. */
  sections: readonly AppSection[] | null;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex h-14 items-center border-b border-border px-4">
        <BrandMark displayName={displayName} logoUrl={logoUrl} />
      </header>
      <main id="contenido" className="flex-1 px-4 pt-4 pb-24">
        {children}
      </main>
      <PatientBottomNav sections={sections} />
    </div>
  );
}
