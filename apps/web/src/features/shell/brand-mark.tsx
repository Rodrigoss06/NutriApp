/** Logo o nombre de la organización (RN-H03). */
export function BrandMark({
  displayName,
  logoUrl,
}: {
  displayName: string;
  logoUrl: string | null;
}) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- el logo viene del almacenamiento de la organización
    <img src={logoUrl} alt={displayName} className="h-8 w-auto" />
  ) : (
    <span className="text-lg font-semibold text-brand-text">{displayName}</span>
  );
}
