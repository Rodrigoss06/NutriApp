import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ACCESS_RULE, type AccessRule } from '../src/platform/index.js';

describe('02 §10 · se niega por defecto: toda ruta declara su regla de acceso', () => {
  it('cada método HTTP de cada controlador tiene @Public, @Authenticated, @PlatformOnly o un permiso', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    const discovery = moduleRef.get(DiscoveryService);
    const scanner = moduleRef.get(MetadataScanner);
    const reflector = moduleRef.get(Reflector);

    const routes: { route: string; rule: AccessRule | undefined }[] = [];
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[name] as () => unknown;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        routes.push({
          route: `${wrapper.name}.${name}`,
          rule: reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
            handler,
            wrapper.metatype as never,
          ]),
        });
      }
    }

    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => r.rule === undefined).map((r) => r.route)).toEqual([]);
    await moduleRef.close();
  });
});
