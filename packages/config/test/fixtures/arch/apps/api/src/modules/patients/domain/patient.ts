import type { EngineVersion } from '../../../../../../packages/engine/src/index.ts';
import { Entity } from '../../../../../../packages/shared-kernel/src/index.ts';
import { PatientName } from './patient-name.ts';

export class Patient extends Entity {
  readonly name = new PatientName();
  readonly engineVersion: EngineVersion = '1.0.0';
}
