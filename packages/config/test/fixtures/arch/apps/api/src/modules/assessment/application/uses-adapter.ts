// Prohibido: application importa un adaptador.
import { evaluationsController } from '../adapters/in/evaluations.controller.ts';

export const handler = evaluationsController;
