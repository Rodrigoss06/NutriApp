import type { ReactNode } from 'react';

/** Área pública (02 §11): entrar, aceptar invitaciones y recuperar la contraseña. */
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-area="public">{children}</div>;
}
