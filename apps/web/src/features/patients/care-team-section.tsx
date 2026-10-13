'use client';

import type { MemberResponse, PatientResponse, SetCareTeamMember } from '@nutricoach/contracts';
import { Button, ConfirmDialog, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/features/forms/form-error';
import { useCanWrite } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { CARE_TEAM_ACCESS_LABELS, CARE_TEAM_ROLE_LABELS, optionsOf } from './labels';

const ROLES = ['NUTRITION', 'TRAINING', 'COLLABORATOR'] as const;

/**
 * Equipo de atención (RN-A05): lo arman el responsable u OWNER; ADMIN, si ve al paciente. Con acceso READ se lee el
 * expediente; con WRITE, también se escribe. El responsable no se quita: primero se asigna otro.
 */
export function CareTeamSection({
  patient,
  members,
}: {
  patient: PatientResponse;
  members: readonly MemberResponse[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite() && patient.status === 'ACTIVE';
  const byId = new Map(members.map((m) => [m.id, m]));
  const candidates = members.filter(
    (m) => m.status === 'ACTIVE' && !patient.careTeam.some((t) => t.memberId === m.id),
  );
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<SetCareTeamMember['role']>('COLLABORATOR');
  const [access, setAccess] = useState<SetCareTeamMember['access']>('READ');
  const refresh = () => {
    router.refresh();
  };
  const put = useMutation({
    mutationFn: (input: { memberId: string } & SetCareTeamMember) =>
      apiFetch(`/patients/${patient.id}/care-team/${input.memberId}`, {
        method: 'PUT',
        body: { role: input.role, access: input.access },
      }),
    onSuccess: () => {
      setMemberId('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/patients/${patient.id}/care-team/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-col gap-4">
      <FormError error={put.error ?? remove.error} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {patient.careTeam.map((member) => {
          const name = byId.get(member.memberId)?.displayName ?? 'Miembro de la organización';
          return (
            <li
              key={member.memberId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-muted-foreground">
                  {CARE_TEAM_ROLE_LABELS[member.role]} · {CARE_TEAM_ACCESS_LABELS[member.access]}
                </span>
              </div>
              {member.role === 'RESPONSIBLE' ? null : (
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    label={`Acceso de ${name}`}
                    value={member.access}
                    disabled={!canWrite || put.isPending}
                    onValueChange={(value) => {
                      put.mutate({
                        memberId: member.memberId,
                        role: member.role as SetCareTeamMember['role'],
                        access: value as SetCareTeamMember['access'],
                      });
                    }}
                    options={optionsOf(CARE_TEAM_ACCESS_LABELS)}
                    className="sm:w-48"
                  />
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" disabled={!canWrite}>
                        Quitar
                      </Button>
                    }
                    title="¿Quitar del equipo de atención?"
                    description={`${name} deja de ver este expediente si la organización usa la visibilidad por equipo.`}
                    confirmLabel="Quitar"
                    tone="danger"
                    onConfirm={() => {
                      remove.mutate(member.memberId);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="Agregar a"
            value={memberId || undefined}
            placeholder="Elige un miembro"
            disabled={!canWrite}
            onValueChange={setMemberId}
            options={candidates.map((m) => ({ value: m.id, label: m.displayName }))}
            className="sm:flex-1"
          />
          <Select
            label="Rol en el equipo"
            value={role}
            disabled={!canWrite}
            onValueChange={(value) => {
              setRole(value as SetCareTeamMember['role']);
            }}
            options={ROLES.map((value) => ({ value, label: CARE_TEAM_ROLE_LABELS[value] }))}
            className="sm:w-44"
          />
          <Select
            label="Acceso"
            value={access}
            disabled={!canWrite}
            onValueChange={(value) => {
              setAccess(value as SetCareTeamMember['access']);
            }}
            options={optionsOf(CARE_TEAM_ACCESS_LABELS)}
            className="sm:w-48"
          />
          <Button
            disabled={!canWrite || !memberId || put.isPending}
            onClick={() => {
              put.mutate({ memberId, role, access });
            }}
          >
            Agregar al equipo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
