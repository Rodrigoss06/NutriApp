import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * /api va a la API (02 §11). En producción Next toma los rewrites del manifiesto que genera `next build`: por eso
 * API_INTERNAL_URL debe existir al compilar en CI y para staging o producción; en local vale la API en :3001. En staging y producción Caddy atiende /api antes que Next; el rewrite
 * sirve en local, en CI y como respaldo. Los componentes de servidor leen API_INTERNAL_URL en ejecución.
 */
function apiInternalUrl(phase: string): string {
  const value = process.env['API_INTERNAL_URL'];
  if (value) return new URL(value).origin;
  const deployed =
    Boolean(process.env['CI']) || ['staging', 'production'].includes(process.env['APP_ENV'] ?? '');
  if (phase === PHASE_PRODUCTION_BUILD && deployed) {
    throw new Error(
      'Falta API_INTERNAL_URL al compilar: los rewrites de /api quedan en el manifiesto del build.',
    );
  }
  return 'http://127.0.0.1:3001';
}

export default function config(phase: string): NextConfig {
  const api = apiInternalUrl(phase);
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    // packages/ui se publica como código fuente (TSX y CSS): Next.js lo compila.
    transpilePackages: ['@nutricoach/ui'],
    rewrites() {
      return Promise.resolve([{ source: '/api/:path*', destination: `${api}/api/:path*` }]);
    },
  };
}
