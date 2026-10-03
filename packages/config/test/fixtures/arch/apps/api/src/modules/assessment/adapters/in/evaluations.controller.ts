// Prohibido: un adaptador importa el adaptador de otro módulo.
import { patientRepository } from '../../../patients/adapters/out/prisma-patient.repository.ts';

export const evaluationsController = patientRepository;
