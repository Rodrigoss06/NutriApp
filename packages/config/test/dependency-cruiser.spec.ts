import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const fixtureRoot = fileURLToPath(new URL('./fixtures/arch/', import.meta.url));
const configFile = fileURLToPath(new URL('../dependency-cruiser.cjs', import.meta.url));
const depcruiseBin = fileURLToPath(
  new URL('../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', import.meta.url),
);

interface Violation {
  rule: string;
  from: string;
  to: string;
}

interface CruiseOutput {
  summary: { violations: { rule: { name: string }; from: string; to: string }[] };
}

/**
 * Corre el mismo binario y la misma configuración que `pnpm lint:arch` sobre un árbol de ejemplo
 * con la estructura del monorepo: un archivo permitido o prohibido por cada regla.
 */
function depcruise(...extraArgs: string[]) {
  return spawnSync(
    process.execPath,
    [depcruiseBin, 'apps', 'packages', '--config', configFile, ...extraArgs],
    { cwd: fixtureRoot, encoding: 'utf8' },
  );
}

let lintArch: ReturnType<typeof depcruise>;
let violations: Violation[];

beforeAll(() => {
  lintArch = depcruise();
  const output = JSON.parse(depcruise('--output-type', 'json').stdout) as CruiseOutput;
  violations = output.summary.violations.map(({ rule, from, to }) => ({
    rule: rule.name,
    from,
    to,
  }));
});

describe('02 §4 · RNF-21 · reglas de dependencia (pnpm lint:arch)', () => {
  it('falla cuando el domain de un módulo importa el domain de otro módulo', () => {
    const from = 'apps/api/src/modules/assessment/domain/evaluation.ts';
    const to = 'apps/api/src/modules/patients/domain/patient.ts';

    expect(lintArch.status).not.toBe(0);
    expect(lintArch.stdout).toContain(`error module-public-api: ${from} → ${to}`);
    expect(violations).toContainEqual({ rule: 'module-public-api', from, to });
    expect(violations).toContainEqual({ rule: 'domain-allowlist', from, to });
  });

  it.each([
    [
      'domain-allowlist',
      'apps/api/src/modules/assessment/domain/uses-framework.ts',
      '@nestjs/common',
    ],
    [
      'domain-engine-types-only',
      'apps/api/src/modules/assessment/domain/uses-engine-value.ts',
      'packages/engine/src/index.ts',
    ],
    [
      'application-no-infrastructure',
      'apps/api/src/modules/assessment/application/uses-adapter.ts',
      'apps/api/src/modules/assessment/adapters/in/evaluations.controller.ts',
    ],
    [
      'module-public-api',
      'apps/api/src/modules/assessment/adapters/in/evaluations.controller.ts',
      'apps/api/src/modules/patients/adapters/out/prisma-patient.repository.ts',
    ],
    [
      'module-public-api-from-app-root',
      'apps/api/src/app.module.ts',
      'apps/api/src/modules/patients/domain/patient.ts',
    ],
    ['web-not-to-api', 'apps/web/src/app/page.tsx', 'apps/api/src/modules/patients/index.ts'],
    [
      'web-allowed-packages',
      'apps/web/src/app/uses-kernel.ts',
      'packages/shared-kernel/src/index.ts',
    ],
    ['engine-pure', 'packages/engine/src/uses-io.ts', 'crypto'],
    ['shared-kernel-no-dependencies', 'packages/shared-kernel/src/uses-dependency.ts', 'zod'],
    ['packages-not-to-apps', 'packages/shared-kernel/src/uses-app.ts', 'apps/api/src/main.ts'],
    ['not-to-unresolvable', 'packages/shared-kernel/src/uses-dependency.ts', 'zod'],
  ])('%s atrapa %s → %s', (rule, from, to) => {
    expect(violations).toContainEqual({ rule, from, to });
  });

  it('no-circular atrapa un ciclo entre archivos', () => {
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: 'no-circular',
        from: 'packages/shared-kernel/src/cycle-a.ts',
      }),
    );
  });

  it('permite el propio dominio, shared-kernel, tipos de engine y el index.ts de otro módulo', () => {
    const allowed = [
      'apps/api/src/main.ts',
      'apps/api/src/modules/patients/domain/patient.ts',
      'apps/api/src/modules/patients/application/register-patient.handler.ts',
      'apps/api/src/modules/patients/adapters/out/prisma-patient.repository.ts',
    ];

    expect(violations.filter((violation) => allowed.includes(violation.from))).toEqual([]);
  });
});
