'use client';

import { useEffect, useRef, useState } from 'react';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Token del fragmento (#TOKEN) de un enlace de invitación o recuperación: se lee una vez y se borra de la barra con
 * history.replaceState, para que no quede en el historial, en capturas ni en el Referer. El fragmento nunca llega
 * al servidor. undefined mientras no se leyó; null si no había o no es válido.
 */
export function useFragmentToken(): string | null | undefined {
  // El efecto corre dos veces en modo estricto: la primera lectura se guarda antes de borrar el fragmento.
  const read = useRef<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (read.current === undefined) {
      const value = window.location.hash.slice(1);
      read.current = TOKEN.test(value) ? value : null;
      if (value)
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // Leer el fragmento solo es posible en el navegador, después de montar.
    setToken(read.current);
  }, []);
  return token;
}
