'use client';

import { brandCss, DEFAULT_BRAND, parseBrand } from '@nutricoach/ui';
import { useState } from 'react';

/**
 * Cambia la marca en vivo para probar el criterio de P3: solo cambian las variables --brand-*, ningún
 * componente. El <style> se renderiza con el estado (sin useEffect) y gana al del servidor por ir después.
 */
export function LiveBrand({ initial }: { initial: { primary: string; secondary: string } }) {
  const [primary, setPrimary] = useState(initial.primary);
  const [secondary, setSecondary] = useState(initial.secondary);
  const css = brandCss(parseBrand({ primary, secondary }));
  return (
    <fieldset className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">Marca de prueba</legend>
      <style>{css}</style>
      <label className="flex flex-col gap-1 text-sm">
        Primario
        <input
          type="color"
          value={primary}
          onChange={(event) => {
            setPrimary(event.target.value);
          }}
          className="h-10 w-20 rounded-md border border-input-border"
          data-testid="brand-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Secundario
        <input
          type="color"
          value={secondary}
          onChange={(event) => {
            setSecondary(event.target.value);
          }}
          className="h-10 w-20 rounded-md border border-input-border"
        />
      </label>
      <button
        type="button"
        className="h-10 rounded-md px-3 text-sm underline"
        onClick={() => {
          setPrimary(DEFAULT_BRAND.primary);
          setSecondary(DEFAULT_BRAND.secondary);
        }}
      >
        Volver a la paleta provisional
      </button>
    </fieldset>
  );
}
