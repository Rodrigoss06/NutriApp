'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker de la app del paciente con alcance /mi/: nunca controla el panel. Por ahora no
 * guarda datos en caché (P3); la cola sin conexión llega con RF-31.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/mi/' }).catch(() => {
      // Sin service worker la app funciona igual; solo no se instala.
    });
  }, []);
  return null;
}
