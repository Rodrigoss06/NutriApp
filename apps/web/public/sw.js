// Service worker de la app del paciente (P3), registrado con alcance /mi/. Todavía no guarda datos en caché:
// la cola de registros sin conexión llega con RF-31. Sin manejador de fetch, el navegador va siempre a la red.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
