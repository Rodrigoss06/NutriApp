import { VersioningType, type INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { ProblemDetailsFilter } from './problem-details.filter.js';

/** Puerto local de la API; la web usa el 3000. En los contenedores, Caddy envía /api aquí. */
export const API_PORT = 3001;

/**
 * Proxies de confianza para X-Forwarded-For: Caddy en la red de Docker y el loopback. Nunca `true`: cualquiera
 * podría inventar su IP y saltarse el límite de intentos.
 */
export const TRUSTED_PROXIES = 'loopback, uniquelocal';

/**
 * Rutas bajo /api, con versión en la URI: lo de negocio queda en /api/v1/... (06 §5) y lo que
 * declara VERSION_NEUTRAL, como la salud, en /api/... Errores en RFC 9457. La usan main.ts y las pruebas de API.
 */
export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ProblemDetailsFilter());
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', TRUSTED_PROXIES);
  express.disable('x-powered-by');
}
