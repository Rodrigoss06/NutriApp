import { isErr, isOk, type OrganizationId } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { JPEG_BASELINE, pngImage } from '../../../../test/support/images.js';
import type { BrandingText } from '../domain/branding.js';
import { BrandingCommands } from './commands/branding.commands.js';
import { BrandingQueries } from './queries/branding.queries.js';
import {
  contextFor,
  FakeClock,
  FakeFiles,
  fakeIds,
  FakeOutbox,
  FakeUow,
  MemoryTenancyStore,
} from './tenancy-fakes.spec-support.js';

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let store: MemoryTenancyStore;
let files: FakeFiles;
let org: OrganizationId;

const commands = () => new BrandingCommands(uow, clock, fakeIds, outbox, store, files.asRegistry());
const queries = () => new BrandingQueries(uow, store, files.asRegistry());
const owner = () => contextFor(org, 'OWNER');

const BRAND: BrandingText = {
  displayName: 'Consultorio Demo',
  primaryColor: '#0f766e',
  secondaryColor: '#d97706',
  contact: { phone: '+51 999 000 111', email: 'citas@demo.test', website: 'demo.test' },
  pdfFooter: 'Colegiatura CNP 0000',
};
const LOGO = pngImage({ width: 64, height: 32 });

const payloads = () => outbox.events.map(({ event }) => event.payload);

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  store = new MemoryTenancyStore();
  files = new FakeFiles();
  org = store.addOrganization();
});

describe('RN-H03 · la marca de las fichas de la organización', () => {
  it('se crea con su nombre, colores, contacto y pie; el evento nombra los campos, nunca los valores', async () => {
    expect(isOk(await commands().update(owner(), BRAND))).toBe(true);
    const saved = await queries().organizationBranding(owner());
    expect(saved).toMatchObject({ ...BRAND, memberId: null, logoFileId: null });
    expect(saved?.updatedAt).toEqual(clock.now());
    expect(outbox.types()).toEqual(['tenancy.branding.changed']);
    expect(payloads()).toEqual([
      {
        memberId: null,
        fields: [
          'displayName',
          'primaryColor',
          'secondaryColor',
          'contact.phone',
          'contact.email',
          'contact.website',
          'pdfFooter',
        ],
      },
    ]);
    expect(JSON.stringify(payloads())).not.toContain('citas@demo.test');
    expect(store.locks).toBe(1);
  });

  it('cambiar solo un dato reemplaza la misma fila; guardar lo mismo no emite nada', async () => {
    await commands().update(owner(), BRAND);
    const first = await queries().organizationBranding(owner());
    clock.current = new Date('2026-10-08T09:00:00Z');
    await commands().update(owner(), { ...BRAND, primaryColor: '#1a1a2e' });
    await commands().update(owner(), { ...BRAND, primaryColor: '#1a1a2e' });
    const second = await queries().organizationBranding(owner());
    expect(second?.id).toBe(first?.id);
    expect(second).toMatchObject({ primaryColor: '#1a1a2e', updatedAt: clock.now() });
    expect(payloads().at(-1)).toEqual({ memberId: null, fields: ['primaryColor'] });
    expect(outbox.events).toHaveLength(2);
  });

  it('sin marca, la configuración la ve vacía', async () => {
    expect(await queries().organizationBranding(owner())).toBeNull();
    expect(await queries().organizationLogo(owner())).toBeNull();
  });
});

describe('ADR-066 · el logo, aparte del texto', () => {
  it('un PNG entero queda registrado como logo de la marca; el texto no se toca', async () => {
    await commands().update(owner(), BRAND);
    expect(isOk(await commands().replaceLogo(owner(), LOGO))).toBe(true);
    const saved = await queries().organizationBranding(owner());
    expect(saved).toMatchObject(BRAND);
    const stored = files.stored.get(saved?.logoFileId ?? '');
    expect(stored).toMatchObject({ mimeType: 'image/png', purpose: 'BRANDING_LOGO' });
    expect(await queries().organizationLogo(owner())).toEqual({
      content: Buffer.from(LOGO),
      mimeType: 'image/png',
    });
    expect(payloads().at(-1)).toEqual({ memberId: null, fields: ['logo'] });
  });

  it('un JPEG también sirve; reemplazarlo deja el nuevo y guardar el texto después lo conserva', async () => {
    await commands().replaceLogo(owner(), LOGO);
    await commands().replaceLogo(owner(), JPEG_BASELINE);
    await commands().update(owner(), BRAND);
    const saved = await queries().organizationBranding(owner());
    expect(files.stored.get(saved?.logoFileId ?? '')?.mimeType).toBe('image/jpeg');
    expect(saved?.displayName).toBe('Consultorio Demo');
  });

  it.each([
    ['un PDF', Buffer.from('%PDF-1.7\n'), 'NC-TEN-040'],
    ['un PNG cortado', LOGO.subarray(0, LOGO.length - 20), 'NC-TEN-040'],
    ['un PNG de 2001 px de ancho', pngImage({ width: 2001, height: 1 }), 'NC-TEN-041'],
    ['más de 1 MB', Buffer.concat([LOGO, Buffer.alloc(1024 * 1024)]), 'NC-TEN-042'],
  ])('%s no se guarda ni se escribe', async (_, content, code) => {
    const result = await commands().replaceLogo(owner(), content);
    expect(isErr(result) && result.error.code).toBe(code);
    expect(files.stored.size).toBe(0);
    expect(store.brandings.size).toBe(0);
    expect(outbox.events).toHaveLength(0);
  });

  it('quitar el logo deja la marca sin él; sin logo, no hay nada que quitar', async () => {
    await commands().replaceLogo(owner(), LOGO);
    expect(isOk(await commands().removeLogo(owner()))).toBe(true);
    expect((await queries().organizationBranding(owner()))?.logoFileId).toBeNull();
    expect(await queries().organizationLogo(owner())).toBeNull();
    expect(isOk(await commands().removeLogo(owner()))).toBe(true);
    expect(outbox.events.map(({ event }) => event.payload)).toEqual([
      { memberId: null, fields: ['logo'] },
      { memberId: null, fields: ['logo'] },
    ]);
  });
});
