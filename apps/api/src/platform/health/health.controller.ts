import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import type { HealthResponse } from '@nutricoach/contracts';

/** Salud del proceso (01 §8). Sin versión: queda en /api/health, fuera de /api/v1. */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  /** El proceso responde. Lo consulta el monitor externo de disponibilidad. */
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /**
   * Listo para recibir tráfico. Provisional: P2 agrega la base, las migraciones al día, la cola
   * activa y la partición del mes siguiente.
   */
  @Get('ready')
  ready(): HealthResponse {
    return { status: 'ok', checks: {} };
  }
}
