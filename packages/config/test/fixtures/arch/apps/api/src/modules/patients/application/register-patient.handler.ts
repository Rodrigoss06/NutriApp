import type { Evaluation } from '../../assessment/index.ts';
import { Patient } from '../domain/patient.ts';

export const registerPatient = (): Patient | Evaluation => new Patient();
