import type { MetadataRoute } from 'next';

/** La plataforma es privada: nada del panel, la app ni el panel interno (con el catálogo) se indexa. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: ['/admin/', '/panel/', '/mi/', '/api/'] }] };
}
