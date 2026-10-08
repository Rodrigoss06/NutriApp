import '../env-file.js';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isErr } from '@nutricoach/shared-kernel';
import { IamApi, IamModule } from '../modules/iam/index.js';
import { TenancyModule } from '../modules/tenancy/index.js';
import { PlatformModule } from '../platform/index.js';

/**
 * Primer PLATFORM_ADMIN de un entorno (decisión 3 de P5): crea la cuenta sin contraseña y deja en el outbox el
 * correo con un enlace de 24 horas para fijarla; el worker lo envía. Nadie ve ni elige su contraseña.
 *
 * Uso: node dist/cli/create-platform-admin.js <correo> "<nombre>"
 */
@Module({ imports: [PlatformModule, TenancyModule, IamModule] })
class CliModule {}

const [email, displayName] = process.argv.slice(2);
if (!email || !displayName?.trim()) {
  console.error('Uso: create-platform-admin <correo> "<nombre>"');
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
try {
  const result = await app.get(IamApi).createPlatformAdmin(email, displayName.trim());
  if (isErr(result)) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    console.log(
      'Cuenta creada. El worker enviará el enlace para fijar la contraseña (vale 24 horas).',
    );
  }
} finally {
  await app.close();
}
