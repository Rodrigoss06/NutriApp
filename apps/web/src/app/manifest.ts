import type { MetadataRoute } from 'next';
import { DEFAULT_BRAND } from '@nutricoach/ui';

/**
 * Manifiesto de la app del paciente (02 §11, RF-27): se instala desde el navegador y abre en /mi/hoy, dentro del
 * alcance /mi/ que también usa el service worker. Nombre y colores provisionales hasta la marca del cliente.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NutriCoach',
    short_name: 'NutriCoach',
    description: 'Tu plan, tus registros y tu progreso.',
    lang: 'es-PE',
    dir: 'ltr',
    id: '/mi/',
    scope: '/mi/',
    start_url: '/mi/hoy',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: DEFAULT_BRAND.primary,
    background_color: '#ffffff',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
