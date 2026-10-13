import type { ReactNode } from 'react';

/** Sección con su título como nombre accesible. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = `seccion-${title
    .normalize('NFD')
    .replace(/[^A-Za-z]+/g, '-')
    .toLowerCase()}`;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={id}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
