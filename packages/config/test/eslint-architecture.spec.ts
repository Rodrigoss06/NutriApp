import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { applicationImports, domainImports } from '../eslint/nest.js';

/** Aplica solo `no-restricted-imports` con las opciones de apps/api a un archivo de ejemplo. */
function restrictedImports(options: object, code: string): string[] {
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        rules: { 'no-restricted-imports': ['error', options] },
      },
    ],
    { filename: 'src/modules/assessment/layer/file.ts' },
  );
  return messages.map((message) => message.message);
}

describe('02 §4 · imports restringidos que dependency-cruiser no ve', () => {
  it('application solo toma Injectable e Inject de NestJS', () => {
    const allowed = "import { Inject, Injectable } from '@nestjs/common';";
    const forbidden = "import { Controller } from '@nestjs/common';";

    expect(restrictedImports(applicationImports, allowed)).toEqual([]);
    expect(restrictedImports(applicationImports, forbidden)).toEqual([
      expect.stringContaining('02 §4'),
    ]);
  });

  it.each([
    "import { NestFactory } from '@nestjs/core';",
    "import { PrismaClient } from '@prisma/client';",
    "import type { Request } from 'express';",
    "import { EvaluationsController } from '../adapters/in/http/evaluations.controller.js';",
  ])('application rechaza %s', (code) => {
    expect(restrictedImports(applicationImports, code)).toHaveLength(1);
  });

  it.each([
    "import { Injectable } from '@nestjs/common';",
    "import { PrismaClient } from '@prisma/client';",
    "import { z } from 'zod';",
    "import type { Request } from 'express';",
    "import { CloseEvaluationHandler } from '../application/commands/close-evaluation.handler.js';",
  ])('domain rechaza %s', (code) => {
    expect(restrictedImports(domainImports, code)).toHaveLength(1);
  });

  it('domain puede importar shared-kernel y su propio código', () => {
    const code = [
      "import { AggregateRoot } from '@nutricoach/shared-kernel';",
      "import { SiteCode } from './site-code.vo.js';",
    ].join('\n');

    expect(restrictedImports(domainImports, code)).toEqual([]);
  });
});
