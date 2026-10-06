import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

/** Idempotency-Key en toda petición que escribe (RN-G08). Solo en el proceso HTTP. */
@Module({ providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }] })
export class IdempotencyModule {}
