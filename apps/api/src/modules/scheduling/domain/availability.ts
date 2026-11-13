import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

/** Una franja semanal de la disponibilidad: 1 es lunes y 7 domingo, con horas HH:MM de la organización (RN-J03). */
export interface AvailabilitySlot {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
}

export const AVAILABILITY_OVERLAP = domainError({
  code: 'NC-SCH-010',
  message: 'Dos franjas del mismo día se cruzan: júntalas o sepáralas.',
});

/**
 * Las franjas de un día no se cruzan (ADR-125). La disponibilidad orienta la agenda: una cita fuera de ella se puede poner, y la
 * pantalla la marca.
 */
export function checkSlots(
  slots: readonly AvailabilitySlot[],
): Result<AvailabilitySlot[], DomainError> {
  const sorted = [...slots].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1] as AvailabilitySlot;
    const slot = sorted[index] as AvailabilitySlot;
    if (previous.dayOfWeek === slot.dayOfWeek && slot.startTime < previous.endTime) {
      return err(AVAILABILITY_OVERLAP);
    }
  }
  return ok(sorted);
}
