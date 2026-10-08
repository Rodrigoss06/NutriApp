import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { apiInternalUrl, appEnv, internalToolsEnabled } = await import('./env.js');

describe('APP_ENV · el catálogo solo existe en local y staging', () => {
  it.each([
    [{ APP_ENV: 'local' }, 'local', true],
    [{ APP_ENV: 'staging', NODE_ENV: 'production' }, 'staging', true],
    [{ APP_ENV: 'production', NODE_ENV: 'production' }, 'production', false],
    [{ NODE_ENV: 'production' }, 'production', false],
    [{ NODE_ENV: 'development' }, 'local', true],
  ] as const)('%o es %s', (source, expected, tools) => {
    expect(appEnv(source)).toBe(expected);
    expect(internalToolsEnabled(source)).toBe(tools);
  });

  it('un valor desconocido falla al arrancar', () => {
    expect(() => appEnv({ APP_ENV: 'prod' })).toThrow();
  });
});

describe('API_INTERNAL_URL · la API desde el servidor de Next', () => {
  it('se lee en ejecución y queda como origen', () => {
    expect(apiInternalUrl({ API_INTERNAL_URL: 'http://api:3001/', APP_ENV: 'staging' })).toBe(
      'http://api:3001',
    );
  });

  it('en local tiene valor por defecto; fuera de local es obligatoria', () => {
    expect(apiInternalUrl({ APP_ENV: 'local' })).toBe('http://127.0.0.1:3001');
    expect(() => apiInternalUrl({ APP_ENV: 'production', NODE_ENV: 'production' })).toThrow();
  });
});
