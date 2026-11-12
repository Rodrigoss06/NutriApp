import {
  isErr,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONSENT_ALREADY_ACTIVE,
  CONSENT_DOCUMENT_NOT_CURRENT,
  CONSENT_NOT_FOUND,
  GUARDIAN_CONSENT_ON_PAPER,
  HEALTH_DATA_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
} from '../domain/clinical-rules.js';
import { PatientSelfService } from './patient-self-service.js';
import type { ClinicalRecordStore, ConsentStore, PatientStore } from './ports/clinical.ports.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const USER = '0192f0a0-0000-7000-8000-0000000000e1' as UserId;
const context: SecurityContext = {
  organizationId: ORG,
  userId: USER,
  role: 'PATIENT',
  patientId: PATIENT as SecurityContext['patientId'],
  memberId: null,
};
/** 10:00 en Lima, el 2 de noviembre de 2026. */
const NOW = new Date('2026-11-02T15:00:00.000Z');
const META = { ip: '203.0.113.7', userAgent: 'prueba' };
const DOCUMENT = {
  id: 'document-1',
  purpose: 'MENSTRUAL_TRACKING',
  version: '0.1-provisional',
  bodyMarkdown: 'Texto provisional.',
};
const NO_ANSWERS = {
  S01: false,
  S02: false,
  S03: false,
  S04: false,
  S05: false,
  S06: false,
  S07: false,
  S08: false,
};

interface Screening {
  status: string;
  review: unknown;
  answeredAt: Date;
}

let patient: { status: string; birthDate: string; timezone: string } | null;
let active: Map<string, { id: string; grantedAt: Date }>;
let inserted: Record<string, unknown>[];
let documents: (typeof DOCUMENT)[];
let revokeWorks: boolean;
let screenings: Screening[];
let events: DomainEvent[];

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => NOW };
const ids = { newId: () => '0192f0a0-0000-7000-8000-0000000000f1' as never };
const outbox = {
  append: (appended: readonly DomainEvent[]) => {
    events.push(...appended);
    return Promise.resolve();
  },
};
const patients = { find: () => Promise.resolve(patient) } as unknown as PatientStore;
const consents = {
  currentDocuments: () => Promise.resolve(documents),
  active: (_patientId: string, purpose: string) => Promise.resolve(active.get(purpose) ?? null),
  insert: (consent: Record<string, unknown>) => {
    inserted.push(consent);
    return Promise.resolve();
  },
  revoke: () => Promise.resolve(revokeWorks),
} as unknown as ConsentStore;
const records = {
  screenings: () => Promise.resolve(screenings),
  insertScreening: (screening: Screening) => {
    screenings.unshift(screening);
    return Promise.resolve();
  },
} as unknown as ClinicalRecordStore;

const service = () => new PatientSelfService(uow, clock, ids, outbox, patients, consents, records);
const grant = () => service().grant(context, 'MENSTRUAL_TRACKING', META);
const codeOf = (result: Awaited<ReturnType<typeof grant>>) =>
  isErr(result) ? result.error.code : null;

beforeEach(() => {
  patient = { status: 'ACTIVE', birthDate: '1996-04-12', timezone: 'America/Lima' };
  active = new Map([['HEALTH_DATA', { id: 'health', grantedAt: NOW }]]);
  inserted = [];
  documents = [DOCUMENT];
  revokeWorks = true;
  screenings = [];
  events = [];
});

describe('RN-G17 · autorizar MENSTRUAL_TRACKING desde la app', () => {
  it('con el texto vigente y por el canal APP; deja su evento, sin nada del ciclo', async () => {
    const result = await grant();

    expect(isErr(result)).toBe(false);
    expect(inserted[0]).toMatchObject({
      patientId: PATIENT,
      purpose: 'MENSTRUAL_TRACKING',
      consentDocumentId: 'document-1',
      channel: 'APP',
      grantedByUserId: USER,
      grantedAt: NOW,
      evidenceFileId: null,
    });
    expect(events.map((event) => event.type)).toEqual(['clinical.consent.granted']);
  });

  it('ADR-042: un menor de 14 solo en papel firmado: desde la app se rechaza', async () => {
    patient = { status: 'ACTIVE', birthDate: '2012-11-03', timezone: 'America/Lima' };

    expect(codeOf(await grant())).toBe(GUARDIAN_CONSENT_ON_PAPER.code);
    expect(inserted).toEqual([]);
  });

  it('ADR-042: desde el día que cumple 14, lo autoriza él mismo', async () => {
    patient = { status: 'ACTIVE', birthDate: '2012-11-02', timezone: 'America/Lima' };

    expect(codeOf(await grant())).toBeNull();
    expect(inserted).toHaveLength(1);
  });

  it('no se autoriza dos veces, sin texto vigente, archivado ni sin expediente', async () => {
    active.set('MENSTRUAL_TRACKING', { id: 'vigente', grantedAt: NOW });
    expect(codeOf(await grant())).toBe(CONSENT_ALREADY_ACTIVE.code);
    active.delete('MENSTRUAL_TRACKING');

    documents = [];
    expect(codeOf(await grant())).toBe(CONSENT_DOCUMENT_NOT_CURRENT.code);
    documents = [DOCUMENT];

    patient = { status: 'ARCHIVED', birthDate: '1996-04-12', timezone: 'America/Lima' };
    expect(codeOf(await grant())).toBe(PATIENT_ARCHIVED.code);

    patient = null;
    expect(codeOf(await grant())).toBe(PATIENT_NOT_FOUND.code);
    expect(inserted).toEqual([]);
  });

  it('muestra si está vigente, desde cuándo y el texto que autorizaría', async () => {
    expect(await service().myConsents(context)).toEqual([
      {
        purpose: 'MENSTRUAL_TRACKING',
        active: false,
        grantedAt: null,
        document: {
          id: 'document-1',
          version: '0.1-provisional',
          bodyMarkdown: 'Texto provisional.',
        },
      },
      // Las fotos de progreso también se autorizan desde la app (RN-G20); sin su texto en la prueba, sin documento.
      { purpose: 'PROGRESS_PHOTOS', active: false, grantedAt: null, document: null },
    ]);

    documents = [];
    active.set('MENSTRUAL_TRACKING', { id: 'vigente', grantedAt: NOW });
    expect(await service().myConsents(context)).toEqual([
      { purpose: 'MENSTRUAL_TRACKING', active: true, grantedAt: NOW, document: null },
      { purpose: 'PROGRESS_PHOTOS', active: false, grantedAt: null, document: null },
    ]);
  });
});

describe('RN-B02 · retirar la autorización', () => {
  it('deja su evento; sin una vigente, o si ya no se puede retirar, no existe', async () => {
    const none = await service().revoke(context, 'MENSTRUAL_TRACKING');
    expect(isErr(none) ? none.error.code : null).toBe(CONSENT_NOT_FOUND.code);

    active.set('MENSTRUAL_TRACKING', { id: 'vigente', grantedAt: NOW });
    revokeWorks = false;
    const lost = await service().revoke(context, 'MENSTRUAL_TRACKING');
    expect(isErr(lost) ? lost.error.code : null).toBe(CONSENT_NOT_FOUND.code);
    expect(events).toEqual([]);

    revokeWorks = true;
    const revoked = await service().revoke(context, 'MENSTRUAL_TRACKING');
    expect(isErr(revoked)).toBe(false);
    expect(events.map((event) => event.type)).toEqual(['clinical.consent.revoked']);
  });
});

describe('RN-F15 · 07 §3.2 · el cribado desde la app', () => {
  const answer = (answers: object = NO_ANSWERS) =>
    service().answerScreening(context, { ...NO_ANSWERS, ...answers });
  const latest = () => service().screening(context);

  it('sin responder no hay cribado; en verde no espera revisión', async () => {
    expect(await latest()).toBeNull();

    await answer();

    expect(await latest()).toEqual({ answeredAt: NOW, awaitingReview: false });
    expect(screenings[0]).toMatchObject({ status: 'GREEN', answeredBy: USER, review: null });
    expect(events.map((event) => event.type)).toEqual(['clinical.screening.recorded']);
  });

  it('una crítica en sí da rojo, una de revisión da ámbar, y los dos esperan al coach', async () => {
    await answer({ S05: true });
    expect(screenings[0]?.status).toBe('AMBER');
    expect((await latest())?.awaitingReview).toBe(true);

    await answer({ S01: true });
    expect(screenings[0]?.status).toBe('RED');
    expect((await latest())?.awaitingReview).toBe(true);
  });

  it('con la decisión del coach ya no espera', async () => {
    screenings = [{ status: 'RED', review: { decision: 'LIMIT' }, answeredAt: NOW }];
    expect((await latest())?.awaitingReview).toBe(false);
  });

  it('RN-B01: sin HEALTH_DATA, archivado o sin expediente no se responde', async () => {
    active.delete('HEALTH_DATA');
    const noConsent = await answer();
    expect(isErr(noConsent) ? noConsent.error.code : null).toBe(HEALTH_DATA_REQUIRED.code);

    patient = { status: 'ARCHIVED', birthDate: '1996-04-12', timezone: 'America/Lima' };
    const archived = await answer();
    expect(isErr(archived) ? archived.error.code : null).toBe(PATIENT_ARCHIVED.code);

    patient = null;
    const unknown = await answer();
    expect(isErr(unknown) ? unknown.error.code : null).toBe(PATIENT_NOT_FOUND.code);
    expect(screenings).toEqual([]);
  });
});
