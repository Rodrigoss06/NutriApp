import { needsGuardian } from './clinical-rules.js';

/**
 * El consentimiento de datos de salud de un paciente importado (RF-40, RN-B01; ADR-135):
 * - MIGRATED: lo dio en el sistema anterior en esa fecha y entra como tal, sin evidencia;
 * - NOT_GIVEN: la plantilla no trae la fecha, así que entra sin él;
 * - MINOR: tenía menos de 14 años en esa fecha. Solo vale el papel firmado por su padre, madre o tutor, así que tampoco se migra: el
 *   profesional lo registra en la app con el escaneo.
 */
export type MigratedConsent = 'MIGRATED' | 'NOT_GIVEN' | 'MINOR';

export function migratedConsentOf(birthDate: string, consentDate: string | null): MigratedConsent {
  if (consentDate === null) return 'NOT_GIVEN';
  return needsGuardian(birthDate, consentDate) ? 'MINOR' : 'MIGRATED';
}

/**
 * El instante que se guarda para una fecha sin hora del sistema anterior: el mediodía UTC, que cae ese mismo día en cualquier zona
 * de América y de Europa (de UTC-11 a UTC+11).
 */
export const noonUtcOf = (localDate: string): Date => new Date(`${localDate}T12:00:00.000Z`);
