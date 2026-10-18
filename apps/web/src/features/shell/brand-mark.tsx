/**
 * Logo o nombre de la organización (RN-H03). Sin logo, la inicial en un cuadro con el color de la marca y el
 * nombre al lado. El color del nombre lo decide dónde va: claro en el riel oscuro, de marca sobre el papel.
 */
export function BrandMark({
  displayName,
  logoUrl,
}: {
  displayName: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- el logo viene del almacenamiento de la organización
    return <img src={logoUrl} alt={displayName} className="h-8 w-auto" />;
  }
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground"
      >
        {displayName.trim().charAt(0).toUpperCase()}
      </span>
      <span data-brand-name className="truncate font-semibold [font-stretch:108%]">
        {displayName}
      </span>
    </span>
  );
}
