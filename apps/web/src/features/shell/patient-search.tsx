import { Search } from 'lucide-react';

/** Buscador de pacientes por nombre o documento (RF-08): un formulario GET, funciona sin JavaScript. */
export function PatientSearch({ patientLabel }: { patientLabel: string }) {
  const label = `Buscar ${patientLabel.toLowerCase()} por nombre o documento`;
  return (
    <form role="search" action="/panel/pacientes" className="relative w-full max-w-md">
      <label htmlFor="patient-search" className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id="patient-search"
        name="q"
        type="search"
        placeholder={label}
        className="h-10 w-full rounded-md border border-input-border bg-background pr-3 pl-9 text-base placeholder:text-muted-foreground"
      />
    </form>
  );
}
