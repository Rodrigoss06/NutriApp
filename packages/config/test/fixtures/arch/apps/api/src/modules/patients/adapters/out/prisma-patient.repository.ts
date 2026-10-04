import { Patient } from '../../domain/patient.ts';

export const patientRepository = { load: (): Patient => new Patient() };
