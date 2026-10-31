import { isErr, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeAudit,
  FakeClinical,
  FakeClock,
  FakeFiles,
  fakeIds,
  FakeOutbox,
  FakeUow,
  FUNCTIONAL_CATALOG,
  MemoryEvaluations,
  MemoryFunctionalEvaluations,
  staffContext,
} from './assessment-fakes.spec-support.js';
import { AssessmentApi } from './assessment-api.js';
import { FunctionalEvaluationCommands } from './commands/functional-evaluation.commands.js';
import { FunctionalEvaluationQueries } from './queries/functional-evaluation.queries.js';

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const OUTSIDER = '0192f0a0-0000-7000-8000-0000000000a2';
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const MEASURED_AT = '2026-10-20T14:00:00.000Z';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const LINK = 'https://videos.example.com/evidencia';

const responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
const outsider = staffContext('PROFESSIONAL', OUTSIDER);

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let evaluations: MemoryEvaluations;
let functional: MemoryFunctionalEvaluations;
let clinical: FakeClinical;
let files: FakeFiles;

const commands = () =>
  new FunctionalEvaluationCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    evaluations,
    functional,
    clinical.asApi(),
    files.asRegistry(),
  );
const queries = () =>
  new FunctionalEvaluationQueries(
    uow,
    audit,
    evaluations,
    functional,
    clinical.asApi(),
    files.asRegistry(),
  );

function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
const codeOf = <T>(result: Result<T, DomainError>) => (isErr(result) ? result.error.code : null);

const movementRow = (changes: object = {}) => ({
  rightScore: 2,
  leftScore: 2,
  pain: false,
  asymmetry: false,
  modality: 'IN_PERSON' as const,
  observation: null,
  actionNote: null,
  reliabilityNote: null,
  evidenceUrl: null,
  ...changes,
});
const physicalRow = (changes: object = {}) => ({
  value: 12,
  modality: 'IN_PERSON' as const,
  notes: null,
  evidenceUrl: null,
  ...changes,
});

const open = async (kind: 'MOVEMENT' | 'FITNESS' = 'MOVEMENT'): Promise<string> =>
  value(
    await commands().create(responsible, PATIENT, {
      kind,
      measuredAt: MEASURED_AT,
      moment: kind === 'FITNESS' ? 'BASELINE' : null,
      notes: null,
    }),
  ).id;
const versionOf = async (id: string): Promise<number> =>
  (await functional.find(id))?.version ?? Number.NaN;
const statusOf = async (id: string) => (await functional.find(id))?.status;
const saveMovement = async (id: string, code = 'PLANK', changes: object = {}) =>
  commands().saveMovementTest(responsible, id, code, await versionOf(id), movementRow(changes));
const savePhysical = async (id: string, code = 'PUSH_UPS', changes: object = {}) =>
  commands().savePhysicalResult(responsible, id, code, await versionOf(id), physicalRow(changes));
const close = async (id: string) => commands().close(responsible, id, await versionOf(id));
const attach = async (id: string, code = 'PLANK', content = PNG) =>
  commands().attachEvidence(responsible, id, code, await versionOf(id), content);

beforeEach(() => {
  clock = new FakeClock();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  evaluations = new MemoryEvaluations();
  functional = new MemoryFunctionalEvaluations(evaluations);
  uow = new FakeUow().track(evaluations, functional, outbox);
  clinical = new FakeClinical();
  files = new FakeFiles();
  clinical.add(
    {
      id: PATIENT,
      sex: 'F',
      birthDate: '1995-03-02',
      population: 'ADULT',
      timezone: 'America/Lima',
      status: 'ACTIVE',
    },
    RESPONSIBLE,
  );
});

describe('RF-41 · crear una evaluación funcional', () => {
  it('nace en borrador, evalúa quien la crea y guarda su fecha local y la edad al medir', async () => {
    const id = await open('FITNESS');

    expect(await functional.find(id)).toMatchObject({
      kind: 'FITNESS',
      moment: 'BASELINE',
      status: 'DRAFT',
      revision: 1,
      evaluatorMemberId: RESPONSIBLE,
      localDate: '2026-10-20',
      patientSnapshot: { sex: 'F', population: 'ADULT' },
    });
    expect(outbox.types()).toEqual(['assessment.evaluation.created']);
  });

  it('RN-A05 · RN-B01: exige escritura en el equipo y datos de salud', async () => {
    const input = { kind: 'MOVEMENT', measuredAt: MEASURED_AT, moment: null, notes: null } as const;
    expect(codeOf(await commands().create(outsider, PATIENT, input))).toBe('NC-CLI-020');
    expect(codeOf(await commands().create(responsible, 'no-existe', input))).toBe('NC-CLI-005');
    clinical.consented.delete(PATIENT);
    expect(codeOf(await commands().create(responsible, PATIENT, input))).toBe('NC-CLI-009');
  });

  it('sin miembro no hay evaluador, y sin organización no hay caso de uso', async () => {
    clinical.writers.get(PATIENT)?.add('');
    const input = { kind: 'MOVEMENT', measuredAt: MEASURED_AT, moment: null, notes: null } as const;

    const noMember = await commands().create({ ...responsible, memberId: null }, PATIENT, input);
    expect(isErr(noMember) && noMember.error.code).toMatch(/^NC-ASM-/);
    expect(() =>
      commands().create({ ...responsible, organizationId: null }, PATIENT, input),
    ).toThrow(/organización/);
  });
});

describe('RN-F15 · 07 §3.3 · cada prueba postural', () => {
  it('el motor decide el estado con su versión; volver a guardar reemplaza, no duplica', async () => {
    const id = await open();

    value(await saveMovement(id));
    expect(await functional.movementTests(id)).toMatchObject([
      { testCode: 'PLANK', status: 'FIT', ruleVersion: '1.0.0', evidenceFileId: null },
    ]);

    value(await saveMovement(id, 'PLANK', { leftScore: 1 }));
    expect(await functional.movementTests(id)).toMatchObject([{ status: 'CAUTION' }]);

    value(await saveMovement(id, 'PLANK', { leftScore: 0 }));
    expect(await functional.movementTests(id)).toMatchObject([{ status: 'MODIFY' }]);

    value(await saveMovement(id, 'PLANK', { leftScore: null }));
    expect(await functional.movementTests(id)).toMatchObject([{ status: 'PENDING' }]);

    // P-14: el dolor manda aunque falte un lado.
    value(await saveMovement(id, 'PLANK', { leftScore: null, pain: true }));
    expect(await functional.movementTests(id)).toMatchObject([{ status: 'REFER' }]);
    expect(await versionOf(id)).toBe(5);
    expect(outbox.types().filter((t) => t === 'assessment.functional.recorded')).toHaveLength(5);
  });

  it('una prueba que no es del catálogo, o de otra clase de evaluación, no se registra', async () => {
    const id = await open();

    expect(codeOf(await saveMovement(id, 'VOLAR'))).toBe('NC-ASM-023');
    expect(codeOf(await savePhysical(id))).toBe('NC-ASM-023');
    expect(await versionOf(id)).toBe(0);
  });

  it('RN-D08: solo en borrador y sobre la versión leída', async () => {
    const id = await open();
    value(await saveMovement(id));

    const stale = await commands().saveMovementTest(responsible, id, 'PLANK', 0, movementRow());
    expect(codeOf(stale)).toMatch(/^NC-ASM-/);
    value(await close(id));
    const closed = await saveMovement(id);
    expect(isErr(closed) && closed.error.code).toMatch(/^NC-ASM-/);
    expect(codeOf(closed)).not.toBe(codeOf(stale));
    expect(codeOf(await commands().close(outsider, id, 0))).toBe('NC-CLI-020');
    expect(
      codeOf(
        await commands().saveMovementTest(responsible, 'no-existe', 'PLANK', 0, movementRow()),
      ),
    ).toBe('NC-ASM-022');
  });

  it('si otro escribe entre la lectura y el guardado, gana el primero', async () => {
    const id = await open();
    const physicalId = await open('FITNESS');
    value(await saveMovement(id));
    value(await savePhysical(physicalId));
    evaluations.updateDraft = () => Promise.resolve(false);
    const conflict = (result: Result<unknown, DomainError>) => {
      expect(isErr(result)).toBe(true);
    };

    conflict(await saveMovement(id));
    conflict(await savePhysical(physicalId));
    conflict(await commands().removeTest(responsible, id, 'PLANK', await versionOf(id)));
    conflict(await attachWithImages(id));
    conflict(await commands().removeEvidence(responsible, id, 'PLANK', await versionOf(id)));
  });

  const attachWithImages = (id: string) => {
    clinical.images.add(PATIENT);
    return attach(id);
  };
});

describe('07 §4 · cada prueba física', () => {
  it('lleva la unidad del catálogo y se reemplaza', async () => {
    const id = await open('FITNESS');

    value(await savePhysical(id));
    value(await savePhysical(id, 'PUSH_UPS', { value: 14.5 }));

    expect(await functional.physicalResults(id)).toMatchObject([
      { testCode: 'PUSH_UPS', value: 14.5, unit: 'repeticiones' },
    ]);
  });

  it('una prueba que no es del catálogo, o de otra clase de evaluación, no se registra', async () => {
    const id = await open('FITNESS');

    expect(codeOf(await savePhysical(id, 'VOLAR'))).toBe('NC-ASM-023');
    expect(codeOf(await saveMovement(id))).toBe('NC-ASM-023');
  });
});

describe('quitar una prueba', () => {
  it('la saca de la evaluación y lo deja en la auditoría; si no estaba, nada cambia', async () => {
    const movementId = await open();
    const physicalId = await open('FITNESS');
    value(await saveMovement(movementId));
    value(await savePhysical(physicalId));

    value(await commands().removeTest(responsible, movementId, 'PLANK', 1));
    value(await commands().removeTest(responsible, physicalId, 'PUSH_UPS', 1));

    expect(await functional.movementTests(movementId)).toEqual([]);
    expect(await functional.physicalResults(physicalId)).toEqual([]);
    expect(outbox.types()).toContain('assessment.functional.removed');

    const missing = await commands().removeTest(responsible, movementId, 'PLANK', 2);
    expect(codeOf(missing)).toBe('NC-ASM-023');
    expect(await versionOf(movementId)).toBe(2);
  });
});

describe('07 §4 · RN-B01 · la evidencia', () => {
  it('un enlace exige el consentimiento de imágenes, en las dos clases de prueba', async () => {
    const movementId = await open();
    const physicalId = await open('FITNESS');

    expect(codeOf(await saveMovement(movementId, 'PLANK', { evidenceUrl: LINK }))).toBe(
      'NC-CLI-031',
    );
    expect(codeOf(await savePhysical(physicalId, 'PUSH_UPS', { evidenceUrl: LINK }))).toBe(
      'NC-CLI-031',
    );

    clinical.images.add(PATIENT);
    value(await saveMovement(movementId, 'PLANK', { evidenceUrl: LINK }));
    value(await savePhysical(physicalId, 'PUSH_UPS', { evidenceUrl: LINK }));

    expect(await functional.movementTests(movementId)).toMatchObject([{ evidenceUrl: LINK }]);
    expect(await functional.physicalResults(physicalId)).toMatchObject([{ evidenceUrl: LINK }]);
  });

  it('un archivo que no es PDF, PNG ni JPEG no se guarda', async () => {
    const id = await open();
    value(await saveMovement(id));
    clinical.images.add(PATIENT);

    expect(codeOf(await attach(id, 'PLANK', new Uint8Array([1, 2, 3])))).toBe('NC-ASM-025');
    expect(files.stored.size).toBe(0);
  });

  it('sin consentimiento, o sin la prueba, los bytes se descartan', async () => {
    const id = await open();
    value(await saveMovement(id));

    expect(codeOf(await attach(id))).toBe('NC-CLI-031');
    expect(files.discarded).toHaveLength(1);

    clinical.images.add(PATIENT);
    expect(codeOf(await attach(id, 'PELVIS'))).toBe('NC-ASM-023');
    expect(files.discarded).toHaveLength(2);
    expect(await versionOf(id)).toBe(1);
  });

  it('si falla el registro, los bytes se descartan y el error sube', async () => {
    const id = await open();
    value(await saveMovement(id));
    clinical.images.add(PATIENT);
    files.failOnRegister = true;

    await expect(attach(id)).rejects.toThrow('sin espacio');

    expect(files.discarded).toHaveLength(1);
    expect(await functional.movementTests(id)).toMatchObject([{ evidenceFileId: null }]);
  });

  it('se adjunta con su finalidad, sobrevive a corregir la prueba y se puede quitar', async () => {
    const id = await open();
    value(await saveMovement(id));
    clinical.images.add(PATIENT);

    value(await attach(id));
    const [saved] = await functional.movementTests(id);
    const fileId = saved?.evidenceFileId ?? '';
    expect(files.stored.get(fileId)?.purpose).toBe('ASSESSMENT_EVIDENCE');

    value(await saveMovement(id, 'PLANK', { leftScore: 1 }));
    expect(await functional.movementTests(id)).toMatchObject([{ evidenceFileId: fileId }]);

    value(await commands().removeEvidence(responsible, id, 'PLANK', await versionOf(id)));
    expect(await functional.movementTests(id)).toMatchObject([{ evidenceFileId: null }]);
    expect(
      codeOf(await commands().removeEvidence(responsible, id, 'PELVIS', await versionOf(id))),
    ).toBe('NC-ASM-023');
  });

  it('también en una prueba física', async () => {
    const id = await open('FITNESS');
    value(await savePhysical(id));
    clinical.images.add(PATIENT);

    expect(codeOf(await attach(id, 'WALK_6MIN'))).toBe('NC-ASM-023');
    value(await attach(id, 'PUSH_UPS'));

    const [saved] = await functional.physicalResults(id);
    expect(saved?.evidenceFileId).toEqual(expect.any(String));
    value(await savePhysical(id, 'PUSH_UPS', { value: 13 }));
    expect((await functional.physicalResults(id))[0]?.evidenceFileId).toBe(saved?.evidenceFileId);
  });
});

describe('RN-D08 · cerrar y enmendar', () => {
  it('no se cierra sin pruebas, en ninguna de las dos clases', async () => {
    expect(codeOf(await close(await open()))).toBe('NC-ASM-024');
    expect(codeOf(await close(await open('FITNESS')))).toBe('NC-ASM-024');
  });

  it('cerrada queda con su evento; si otro cerró antes, conflicto', async () => {
    const id = await open();
    value(await saveMovement(id));
    const realClose = evaluations.close.bind(evaluations);
    evaluations.close = () => Promise.resolve(false);
    expect(isErr(await close(id))).toBe(true);
    evaluations.close = realClose;

    value(await close(id));

    expect(await statusOf(id)).toBe('CLOSED');
    expect(outbox.types()).toContain('assessment.evaluation.closed');
  });

  it('se enmienda con las mismas pruebas; la anterior pasa a enmendada al cerrar la revisión', async () => {
    const id = await open();
    value(await saveMovement(id));
    value(await close(id));

    const revisionId = value(await commands().amend(responsible, id, 'Se anotó mal.')).id;

    expect(await functional.find(revisionId)).toMatchObject({
      status: 'DRAFT',
      revision: 2,
      amendsEvaluationId: id,
      amendReason: 'Se anotó mal.',
      closedAt: null,
      version: 0,
    });
    expect(await functional.movementTests(revisionId)).toMatchObject([{ testCode: 'PLANK' }]);
    expect(await statusOf(id)).toBe('CLOSED');

    value(await close(revisionId));

    expect(await statusOf(id)).toBe('AMENDED');
    expect(outbox.types()).toContain('assessment.evaluation.amended');
    expect(codeOf(await commands().amend(responsible, id, 'Otra vez.'))).toMatch(/^NC-ASM-/);
  });

  it('también copia los resultados de las pruebas físicas', async () => {
    const id = await open('FITNESS');
    value(await savePhysical(id));
    value(await close(id));

    const revisionId = value(await commands().amend(responsible, id, 'Se contó mal.')).id;

    expect(await functional.physicalResults(revisionId)).toMatchObject([{ testCode: 'PUSH_UPS' }]);
    expect(await functional.find(revisionId)).toMatchObject({ moment: 'BASELINE' });
  });

  it('solo se enmienda una vez, cerrada y con acceso de escritura', async () => {
    const draft = await open();
    expect(isErr(await commands().amend(responsible, draft, 'Motivo.'))).toBe(true);
    expect(codeOf(await commands().amend(responsible, 'no-existe', 'Motivo.'))).toBe('NC-ASM-022');
    value(await saveMovement(draft));
    value(await close(draft));
    expect(codeOf(await commands().amend(outsider, draft, 'Motivo.'))).toBe('NC-CLI-020');

    value(await commands().amend(responsible, draft, 'Motivo.'));
    expect(isErr(await commands().amend(responsible, draft, 'Motivo.'))).toBe(true);
  });

  it('si la original ya se enmendó, la revisión no se cierra', async () => {
    const id = await open();
    value(await saveMovement(id));
    value(await close(id));
    const revisionId = value(await commands().amend(responsible, id, 'Motivo.')).id;
    evaluations.markAmended = () => Promise.resolve(false);

    expect(isErr(await close(revisionId))).toBe(true);
    expect(await statusOf(revisionId)).toBe('DRAFT');
  });
});

describe('RF-41 · RN-B03 · las lecturas', () => {
  it('el catálogo no es de un paciente: no deja READ', async () => {
    expect(await queries().catalog(responsible)).toBe(FUNCTIONAL_CATALOG);
    expect(audit.entries).toEqual([]);
  });

  it('sin ver al paciente no hay nada que leer ni que auditar', async () => {
    const id = await open();
    value(await saveMovement(id));

    expect(await queries().list(responsible, 'no-existe', 'MOVEMENT')).toBeNull();
    expect(await queries().physicalSummary(responsible, 'no-existe')).toBeNull();
    expect(await queries().get(responsible, 'no-existe')).toBeNull();
    expect(await queries().evidence(responsible, 'no-existe', 'PLANK')).toBeNull();
    expect(audit.entries).toEqual([]);
  });

  it('la lista y el detalle dicen quién la enmendó, con sus pruebas y su READ', async () => {
    const id = await open();
    value(await saveMovement(id));
    value(await close(id));
    const revisionId = value(await commands().amend(responsible, id, 'Motivo.')).id;

    const list = await queries().list(responsible, PATIENT, 'MOVEMENT');
    expect(list?.find((e) => e.id === id)?.amendedByEvaluationId).toBe(revisionId);
    expect(list?.find((e) => e.id === revisionId)?.amendedByEvaluationId).toBeNull();

    const detail = await queries().get(responsible, id);
    expect(detail?.amendedByEvaluationId).toBe(revisionId);
    expect(detail?.movementTests).toHaveLength(1);
    expect(detail?.physicalResults).toEqual([]);

    expect(audit.entries).toMatchObject([
      { action: 'READ', resourceType: 'assessment.evaluation', patientId: PATIENT },
      { action: 'READ', resourceType: 'assessment.evaluation', resourceId: id, patientId: PATIENT },
    ]);
  });

  it('el resumen da cada prueba del catálogo, con solo lo cerrado', async () => {
    const closed = await open('FITNESS');
    value(await savePhysical(closed));
    value(await close(closed));
    const draft = await open('FITNESS');
    value(await savePhysical(draft, 'WALK_6MIN', { value: 500 }));

    const summary = await queries().physicalSummary(responsible, PATIENT);

    expect(summary).toMatchObject([
      { testCode: 'PUSH_UPS', baseline: 12, status: 'BASELINE_RECORDED' },
      { testCode: 'WALK_6MIN', baseline: null, status: 'PENDING' },
    ]);
    expect(audit.entries).toHaveLength(1);
  });

  it('la evidencia se baja auditada; sin archivo, nada', async () => {
    const movementId = await open();
    value(await saveMovement(movementId));
    const physicalId = await open('FITNESS');
    value(await savePhysical(physicalId));

    expect(await queries().evidence(responsible, movementId, 'PLANK')).toBeNull();
    expect(await queries().evidence(responsible, physicalId, 'PUSH_UPS')).toBeNull();
    expect(audit.entries).toEqual([]);

    clinical.images.add(PATIENT);
    value(await attach(movementId));

    const file = await queries().evidence(responsible, movementId, 'PLANK');
    expect(file?.mimeType).toBe('image/png');
    expect(audit.entries).toMatchObject([{ action: 'READ', resourceId: movementId }]);
  });
});

describe('AssessmentApi · lo que la seguridad lee de la postura', () => {
  it('las llaves y los códigos de las pruebas físicas', async () => {
    const api = new AssessmentApi(
      evaluations,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      functional,
    );
    const id = await open();
    value(await saveMovement(id, 'PLANK', { pain: true }));

    expect(await api.movementKeys(PATIENT)).toEqual({ evaluated: false, statuses: ['REFER'] });
    expect(await api.physicalTestCodes()).toEqual(['PUSH_UPS', 'WALK_6MIN']);
  });
});
