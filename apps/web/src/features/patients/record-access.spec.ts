import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  exportsPatient,
  managesPatient,
  memberIdOf,
  writesClinical,
  writesRecord,
} from './record-access';

const RESPONSIBLE = 'responsable';
const READER = 'lector';
const WRITER = 'colaborador';
const team = [
  { memberId: RESPONSIBLE, role: 'RESPONSIBLE', access: 'WRITE' },
  { memberId: READER, role: 'COLLABORATOR', access: 'READ' },
  { memberId: WRITER, role: 'COLLABORATOR', access: 'WRITE' },
] as unknown as CareTeamMember[];

describe('RN-A05 · lo que la interfaz ofrece, igual a lo que decide la API', () => {
  it('datos de salud: solo el equipo con WRITE, también frente al dueño', () => {
    expect(writesRecord(team, RESPONSIBLE)).toBe(true);
    expect(writesRecord(team, WRITER)).toBe(true);
    expect(writesRecord(team, READER)).toBe(false);
    expect(writesRecord(team, 'fuera')).toBe(false);
    expect(writesRecord(team, null)).toBe(false);
  });

  it('datos de la ficha y consentimientos: además, el dueño; el administrador no', () => {
    expect(writesClinical('OWNER', team, 'fuera')).toBe(true);
    expect(writesClinical('ADMIN', team, 'fuera')).toBe(false);
    expect(writesClinical('PROFESSIONAL', team, WRITER)).toBe(true);
    expect(writesClinical('PROFESSIONAL', team, READER)).toBe(false);
  });

  it('armar el equipo y archivar: el responsable, el dueño o un administrador', () => {
    expect(managesPatient('OWNER', RESPONSIBLE, 'fuera')).toBe(true);
    expect(managesPatient('ADMIN', RESPONSIBLE, 'fuera')).toBe(true);
    expect(managesPatient('PROFESSIONAL', RESPONSIBLE, RESPONSIBLE)).toBe(true);
    expect(managesPatient('PROFESSIONAL', RESPONSIBLE, WRITER)).toBe(false);
    expect(managesPatient('PROFESSIONAL', RESPONSIBLE, null)).toBe(false);
  });

  it('quien no es miembro de la organización no tiene id de miembro', () => {
    const members = [{ id: WRITER, userId: 'usuario' }] as unknown as MemberResponse[];
    expect(memberIdOf(members, 'usuario')).toBe(WRITER);
    expect(memberIdOf(members, 'otro')).toBeNull();
  });
});

describe('RN-B04 · quién pide la exportación del paciente (ADR-131)', () => {
  it('el responsable, sea cual sea su rol, y el dueño', () => {
    expect(exportsPatient('PROFESSIONAL', 'm-1', 'm-1')).toBe(true);
    expect(exportsPatient('ADMIN', 'm-1', 'm-1')).toBe(true);
    expect(exportsPatient('OWNER', 'm-1', 'm-9')).toBe(true);
  });

  it('del resto del equipo, nadie: tampoco el administrador', () => {
    expect(exportsPatient('PROFESSIONAL', 'm-1', 'm-2')).toBe(false);
    expect(exportsPatient('ADMIN', 'm-1', 'm-2')).toBe(false);
    expect(exportsPatient('ADMIN', 'm-1', null)).toBe(false);
  });
});
