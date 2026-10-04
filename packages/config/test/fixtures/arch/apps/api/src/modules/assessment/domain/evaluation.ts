// Prohibido: el domain de un módulo importa el domain de otro (criterio de aceptación de P0).
import { Patient } from '../../patients/domain/patient.ts';

export class Evaluation {
  readonly patient = new Patient();
}
