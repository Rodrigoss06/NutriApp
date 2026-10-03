// Prohibido: la raíz de la API importa un archivo interno de un módulo.
import { Patient } from './modules/patients/domain/patient.ts';

export const root = Patient;
