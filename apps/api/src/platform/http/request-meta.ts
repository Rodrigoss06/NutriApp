import type { Request } from 'express';
import type { ClsService } from 'nestjs-cls';

/** Clave en CLS de la petición HTTP en curso; el worker no tiene. */
export const CLS_REQUEST = 'nutricoach.request';

/** De dónde vino la petición, para la auditoría (RN-B03): identificador, IP y agente. */
export interface RequestMeta {
  readonly requestId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** Se lee al usarla: para entonces pino-http ya asignó el x-request-id. */
export function requestMeta(cls: ClsService): RequestMeta {
  const request = cls.isActive() ? cls.get<Request | undefined>(CLS_REQUEST) : undefined;
  if (!request) return { requestId: null, ip: null, userAgent: null };
  const id = (request as Request & { id?: unknown }).id;
  return {
    requestId: typeof id === 'string' ? id : null,
    ip: request.ip ?? null,
    userAgent: request.header('user-agent') ?? null,
  };
}
