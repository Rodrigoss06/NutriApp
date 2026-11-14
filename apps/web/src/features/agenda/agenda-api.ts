import type {
  Appointment,
  AvailabilityResponse,
  ChangeAppointmentStatus,
  CreateAppointment,
  PatientListResponse,
  PutAvailability,
  UpdateAppointment,
} from '@nutricoach/contracts';
import { apiFetch } from '@/lib/api/client';

/** Crear una cita (RF-37). Un cruce con otra cita del profesional responde 422 con RN-J01. */
export function bookAppointment(input: CreateAppointment): Promise<Appointment> {
  return apiFetch<Appointment>('/appointments', { method: 'POST', body: input });
}

/** Reprogramar o cambiar sus datos, con la versión que se vio (If-Match). */
export function editAppointment(
  appointment: Pick<Appointment, 'id' | 'version'>,
  input: UpdateAppointment,
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${appointment.id}`, {
    method: 'PATCH',
    body: input,
    headers: { 'If-Match': String(appointment.version) },
  });
}

/** Confirmar, cancelar o validar la asistencia, con la versión que se vio (If-Match). */
export function changeAppointmentStatus(
  appointment: Pick<Appointment, 'id' | 'version'>,
  status: ChangeAppointmentStatus['status'],
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${appointment.id}/status`, {
    method: 'PUT',
    body: { status },
    headers: { 'If-Match': String(appointment.version) },
  });
}

export function saveAvailability(
  memberId: string,
  input: PutAvailability,
): Promise<AvailabilityResponse> {
  return apiFetch<AvailabilityResponse>(`/members/${memberId}/availability`, {
    method: 'PUT',
    body: input,
  });
}

/** Pacientes activos por nombre o documento, para elegir el de la cita. */
export function searchPatients(q: string): Promise<PatientListResponse> {
  return apiFetch<PatientListResponse>(`/patients?q=${encodeURIComponent(q)}&limit=8`);
}
