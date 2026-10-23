'use client';

import { useEffect, useState } from 'react';

/**
 * Espera a que la persona deje de escribir antes de pedir algo a la API. Solo valores que se comparan por valor: un
 * objeto nuevo en cada render reiniciaría la espera y volvería a renderizar sin fin. Un cuerpo se pasa como su texto
 * JSON.
 */
export function useDebounced<T extends string | number | boolean | null>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}
