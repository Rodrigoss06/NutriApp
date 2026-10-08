'use client';

import type { MemberListResponse } from '@nutricoach/contracts';
import { Button, ConfirmDialog, Select, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FormError } from '@/features/forms/form-error';
import { useCan, useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { apiFetch } from '@/lib/api/client';
import { PROFESSION_LABELS, ROLE_LABELS } from './labels';

type Member = MemberListResponse['members'][number];
type Change = { role?: Member['role']; status?: Member['status'] };

/** Miembros (RF-02, RN-A04). PROFESSIONAL ve la lista sin correos ni acciones; la API decide igual. */
export function MembersSection({ members }: { members: readonly Member[] }) {
  const router = useRouter();
  const { userId } = usePanelSession();
  const { manage, grantOwner } = useCan();
  const canWrite = useCanWrite();
  const change = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Change }) =>
      apiFetch(`/organization/members/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/organization/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      router.refresh();
    },
  });
  const roles = (Object.keys(ROLE_LABELS) as Member['role'][]).filter(
    (r) => grantOwner || r !== 'OWNER',
  );

  return (
    <div className="flex flex-col gap-3">
      <FormError error={change.error ?? remove.error} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.map((member) => {
          const self = member.userId === userId;
          const editable = manage && !self && (grantOwner || member.role !== 'OWNER');
          return (
            <li key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">
                  {member.displayName}
                  {self ? <span className="text-muted-foreground"> (tú)</span> : null}
                </span>
                {member.email ? (
                  <span className="truncate text-sm text-muted-foreground">{member.email}</span>
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {member.profession
                    ? PROFESSION_LABELS[member.profession]
                    : 'Profesión sin indicar'}
                </span>
              </div>
              {member.status === 'SUSPENDED' ? (
                <StatusBadge tone="warning">Suspendido</StatusBadge>
              ) : null}
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    label={<span className="sr-only">Rol de {member.displayName}</span>}
                    value={member.role}
                    disabled={!canWrite || change.isPending}
                    options={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
                    onValueChange={(role) => {
                      change.mutate({ id: member.id, body: { role: role as Member['role'] } });
                    }}
                    className="w-44"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canWrite || change.isPending}
                    onClick={() => {
                      change.mutate({
                        id: member.id,
                        body: { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
                      });
                    }}
                  >
                    {member.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" disabled={!canWrite}>
                        Quitar
                      </Button>
                    }
                    title={`¿Quitar a ${member.displayName}?`}
                    description="Pierde el acceso de inmediato. Su historial queda guardado."
                    confirmLabel="Quitar"
                    tone="danger"
                    onConfirm={() => {
                      remove.mutate(member.id);
                    }}
                  />
                </div>
              ) : (
                <span className="text-sm">{ROLE_LABELS[member.role]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
