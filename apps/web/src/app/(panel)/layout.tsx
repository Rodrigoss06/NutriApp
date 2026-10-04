import type { ReactNode } from 'react';

/** Panel del profesional (02 §11). P3 agrega la barra lateral, el buscador y la organización. */
export default function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-area="panel">{children}</div>;
}
