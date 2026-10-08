import { BadRequestException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { domainError } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import { problemFromDomainError, ProblemException } from './problem.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

function respond(exception: unknown) {
  const sent: { status?: number; type?: string; body?: unknown; headers: Record<string, string> } =
    { headers: {} };
  const response = {
    setHeader: (name: string, value: string) => {
      sent.headers[name] = value;
    },
    status(code: number) {
      sent.status = code;
      return this;
    },
    type(value: string) {
      sent.type = value;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }), getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return sent;
}

describe('06 §5 · errores en RFC 9457 con code, rule y requestId', () => {
  it('un error de dominio con regla responde 422 con su code y su rule', () => {
    const error = domainError({
      code: 'NC-TEN-001',
      rule: 'RN-A03',
      message: 'Sin cupo en el plan.',
    });
    const sent = respond(problemFromDomainError(error));

    expect(sent.status).toBe(422);
    expect(sent.type).toBe('application/problem+json');
    expect(sent.body).toEqual({
      type: 'about:blank',
      status: 422,
      title: 'Sin cupo en el plan.',
      code: 'NC-TEN-001',
      rule: 'RN-A03',
      requestId: 'req-1',
    });
  });

  it('conserva las cabeceras del problema (Retry-After en 429)', () => {
    const sent = respond(
      new ProblemException(
        429,
        { title: 'Demasiados intentos.', code: 'NC-PLT-429' },
        { 'Retry-After': '60' },
      ),
    );

    expect(sent.status).toBe(429);
    expect(sent.headers).toEqual({ 'Retry-After': '60' });
  });

  it('las excepciones de NestJS reciben título y code genéricos', () => {
    expect(respond(new NotFoundException()).body).toMatchObject({
      status: 404,
      code: 'NC-PLT-404',
      title: 'No encontrado.',
    });
    expect(
      respond(new BadRequestException({ code: 'NC-PLT-003', title: 'Clave inválida' })).body,
    ).toMatchObject({
      code: 'NC-PLT-003',
      title: 'Clave inválida',
    });
  });

  it('una falla inesperada responde 500 sin detalles', () => {
    const sent = respond(new Error('detalle interno con datos'));

    expect(sent.status).toBe(500);
    expect(JSON.stringify(sent.body)).not.toContain('detalle interno');
    expect(sent.body).toMatchObject({ code: 'NC-PLT-500' });
  });

  it('un error de dominio sin regla es 400 salvo que el caso de uso indique otro estado', () => {
    const error = domainError({ code: 'NC-IAM-010', message: 'Correo o contraseña incorrectos.' });

    expect(problemFromDomainError(error).getStatus()).toBe(400);
    expect(problemFromDomainError(error, 401).getStatus()).toBe(401);
  });
});
