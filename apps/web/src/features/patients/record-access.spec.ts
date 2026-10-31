import type { CareTeamMember, MemberResponse } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { managesPatient, memberIdOf, writesClinical, writesRecord } from './record-access';

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
