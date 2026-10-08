import type { ReactNode } from 'react';

/** Marco de las pantallas de acceso: una columna centrada, cómoda en el celular. */
export function AuthCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: ReactNode; children: ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-brand-text">NutriCoach</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </main>
  );
}
