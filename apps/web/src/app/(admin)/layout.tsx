import type { ReactNode } from 'react';

/** Panel interno de la plataforma (02 §11): organizaciones, planes, soporte y banderas. */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-area="admin">{children}</div>;
}
