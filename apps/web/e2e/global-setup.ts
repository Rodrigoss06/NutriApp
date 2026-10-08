import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createOrganization } from './support/stack';

/** Fuera de test-results, que Playwright vacía al empezar. */
export const ORGANIZATION_B_FILE = '.playwright-state/organizacion-b.json';

/** La organización B de los recorridos de aislamiento: se crea una vez con la API de plataforma. */
export default async function globalSetup(): Promise<void> {
  const organization = await createOrganization('Organización B');
  mkdirSync(dirname(ORGANIZATION_B_FILE), { recursive: true });
  writeFileSync(ORGANIZATION_B_FILE, JSON.stringify(organization));
}
