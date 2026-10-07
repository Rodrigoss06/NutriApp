import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { appEnv, internalToolsEnabled } = await import('./env.js');

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
