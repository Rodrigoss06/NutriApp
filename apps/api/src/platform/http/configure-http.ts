import { VersioningType, type INestApplication } from '@nestjs/common';

/** Puerto local de la API; la web usa el 3000. En los contenedores, Caddy envía /api aquí. */
export const API_PORT = 3001;

/**
 * Rutas bajo /api, con versión en la URI: lo de negocio queda en /api/v1/... (06 §5) y lo que
 * declara VERSION_NEUTRAL, como la salud, en /api/... La usan main.ts y las pruebas de API.
 */
export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
