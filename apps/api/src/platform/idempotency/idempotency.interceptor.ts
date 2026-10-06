import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
  HttpException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { UNIT_OF_WORK, type SecurityContext, type UnitOfWork } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { Prisma } from '../database/generated/client.js';
import type { Db } from '../database/prisma.provider.js';
import type { ContextualRequest } from '../http/request-context.js';
import { requestHash } from './request-hash.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'idempotent-replayed';

/** Una clave vale 24 horas; después se puede reutilizar y el trabajo diario la borra. */
const TTL = '24 hours';
const KEY_FORMAT = /^[A-Za-z0-9._:-]{8,128}$/;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface StoredKey {
  method: string;
  path: string;
  request_hash: Uint8Array;
  status_code: number | null;
  response: unknown;
}

type Claim = { kind: 'claimed' } | { kind: 'existing'; stored: StoredKey };

/** Error RFC 9457 con código estable (06 §5). */
function problem(status: number, code: string, title: string): Record<string, unknown> {
  return { type: 'about:blank', title, status, code };
}

/**
 * Idempotency-Key (05.3 platform.idempotency_key, RN-G08). Con la misma clave y el mismo cuerpo, la segunda
 * petición recibe la respuesta guardada sin volver a ejecutar el caso de uso; con otro cuerpo, 422; si la
 * primera sigue en curso, 409. Las respuestas 5xx no se guardan: el reintento vuelve a ejecutar. Sin usuario
 * autenticado o sin cabecera, la petición sigue sin cambios.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TransactionHost) private readonly db: Db,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ContextualRequest>();
    const response = http.getResponse<Response>();
    const key = request.header(IDEMPOTENCY_HEADER);
    const user = request.securityContext;
    if (key === undefined || !MUTATING.has(request.method) || user?.userId == null)
      return next.handle();
    if (!KEY_FORMAT.test(key)) {
      throw new BadRequestException(
        problem(
          400,
          'NC-PLT-003',
          'Idempotency-Key inválida: de 8 a 128 letras, dígitos, punto, guion o dos puntos.',
        ),
      );
    }
    return from(this.#run(user, key, request, response, next));
  }

  async #run(
    user: SecurityContext,
    key: string,
    request: ContextualRequest,
    response: Response,
    next: CallHandler,
  ): Promise<unknown> {
    const path = request.originalUrl.split('?')[0] ?? request.originalUrl;
    const hash = requestHash(request.method, path, request.body);
    const claim = await this.#claim(user, key, request.method, path, hash);

    if (claim.kind === 'existing') {
      const { stored } = claim;
      if (
        stored.method !== request.method ||
        stored.path !== path ||
        !hash.equals(stored.request_hash)
      ) {
        throw new UnprocessableEntityException(
          problem(422, 'NC-PLT-001', 'La Idempotency-Key ya se usó con otra petición.'),
        );
      }
      if (stored.status_code === null) {
        throw new ConflictException(
          problem(409, 'NC-PLT-002', 'La petición con esta Idempotency-Key todavía está en curso.'),
        );
      }
      response.status(stored.status_code).setHeader(REPLAYED_HEADER, 'true');
      return stored.response;
    }

    try {
      const body: unknown = await lastValueFrom(next.handle() as Observable<unknown>, {
        defaultValue: undefined,
      });
      await this.#settle(user, key, response.statusCode, body);
      return body;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        await this.#settle(user, key, error.getStatus(), error.getResponse());
      } else {
        await this.#release(user, key);
      }
      throw error;
    }
  }

  /** Reserva la clave; una vencida se vuelve a reservar. Devuelve la existente si no la pudo reservar. */
  #claim(
    user: SecurityContext,
    key: string,
    method: string,
    path: string,
    hash: Buffer,
  ): Promise<Claim> {
    return this.uow.run(user, async () => {
      const claimed = await this.db.tx.$executeRaw`
        INSERT INTO platform.idempotency_key (user_id, key, method, path, request_hash, expires_at)
        VALUES (${user.userId}::uuid, ${key}, ${method}, ${path}, ${hash}, now() + ${TTL}::interval)
        ON CONFLICT (user_id, key) DO UPDATE
          SET method = EXCLUDED.method, path = EXCLUDED.path, request_hash = EXCLUDED.request_hash,
              status_code = NULL, response = NULL, created_at = now(), expires_at = EXCLUDED.expires_at
          WHERE idempotency_key.expires_at <= now()`;
      if (claimed === 1) return { kind: 'claimed' } as const;
      const [stored] = await this.db.tx.$queryRaw<StoredKey[]>`
        SELECT method, path, request_hash, status_code, response FROM platform.idempotency_key
        WHERE user_id = ${user.userId}::uuid AND key = ${key}`;
      if (!stored) throw new Error('Idempotency-Key reservada sin fila visible.');
      return { kind: 'existing', stored } as const;
    });
  }

  #settle(user: SecurityContext, key: string, status: number, body: unknown): Promise<void> {
    const json = (body === undefined ? null : body) as Prisma.InputJsonValue | null;
    return this.uow.run(user, async () => {
      await this.db.tx.$executeRaw`
        UPDATE platform.idempotency_key SET status_code = ${status}, response = ${JSON.stringify(json)}::jsonb
        WHERE user_id = ${user.userId}::uuid AND key = ${key}`;
    });
  }

  /** 5xx o falla técnica: la clave queda vencida para que el reintento vuelva a ejecutar. */
  #release(user: SecurityContext, key: string): Promise<void> {
    return this.uow.run(user, async () => {
      await this.db.tx.$executeRaw`
        UPDATE platform.idempotency_key SET expires_at = now()
        WHERE user_id = ${user.userId}::uuid AND key = ${key} AND status_code IS NULL`;
    });
  }
}
