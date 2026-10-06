import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { HealthResponse } from '@nutricoach/contracts';
import type { Response } from 'express';
import { ReadinessService } from './readiness.service.js';

/** Salud del proceso (01 §8). Sin versión: queda en /api/health, fuera de /api/v1. */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /** El proceso responde. Lo consulta el monitor externo de disponibilidad. */
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /**
   * Listo para recibir tráfico: base, migraciones al día, cola activa y partición del mes siguiente. El
   * despliegue espera este 200 (01 §6); si algo falla responde 503 y dice qué.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const checks = await this.readiness.check();
    const status = Object.values(checks).every((check) => check === 'ok') ? 'ok' : 'error';
    if (status === 'error') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status, checks };
  }
}
