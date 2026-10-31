import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { AthleteProfileInput } from '../../domain/athlete-profile.js';

export interface AthleteProfileRecord extends AthleteProfileInput {
  readonly id: string;
  readonly patientId: string;
  readonly revision: number;
  readonly recordedBy: UserId;
  readonly recordedAt: Date;
}

/** training.athlete_profile, con la transacción de quien llama: cada cambio es una revisión nueva. */
export interface AthleteProfileStore {
  latest(patientId: string): Promise<AthleteProfileRecord | null>;
  insert(profile: AthleteProfileRecord & { organizationId: OrganizationId }): Promise<void>;
}

export const ATHLETE_PROFILE_STORE = Symbol.for('nutricoach.training.AthleteProfileStore');
