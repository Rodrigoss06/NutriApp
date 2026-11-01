'use client';

import type {
  CareTeamMember,
  MemberResponse,
  ProgramDetail,
  SaveProgramWeek,
  TrainingSafetyResponse,
} from '@nutricoach/contracts';
import { EmptyState, Notice, StatusBadge } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CareTeamNotice } from '@/features/patients/record-write-gate';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import {
  sameDraft,
  weekBodyOf,
  weekDraftOf,
  weeksOfDocument,
  type WeekDraft,
} from './program-draft';
import { ProgramHeader } from './program-header';
import { ProgramMacrocycle } from './program-macrocycle';
import { ProgramPublishPanel, WeekSaveBar } from './program-publish';
import { DuplicateWeek, MesocycleManager, WeekNav } from './program-structure';
import { ProgramWeekView, WeekMuscleSets, WeekPlan } from './program-week-view';
import { WeekEditor } from './program-week-editor';
import { ProposalBlocks } from './proposal-blocks';
import { useEditsRecord } from './use-edits-record';
import { useProgram } from './use-program';

/**
 * Un programa de entrenamiento (RF-26): en borrador se arma de a una semana y se publica; publicado o sin permiso de escritura, se lee. Los
 * cambios de la semana viven aquí hasta guardarse: mientras haya, no se cambia de semana, ni se aprueba, ni se publica.
 */
export function ProgramEditor({
  initial,
  patientId,
  safety,
  formulaFixed,
  careTeam,
  members,
  archived,
  base,
}: {
  initial: ProgramDetail;
  patientId: string;
  safety: TrainingSafetyResponse;
  /** Tiene otro programa: la fórmula de 1RM es siempre la misma (RN-F04). */
  formulaFixed: boolean;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  archived: boolean;
  base: string;
}) {
  const router = useRouter();
  const { program, write } = useProgram(initial);
  const writes = useWritesRecord(careTeam, members);
  const editsRecord = useEditsRecord(careTeam, members, archived);
  const isDraft = program.status === 'DRAFT';
  const editable = editsRecord && isDraft;
  const { document } = program;

  const weeks = weeksOfDocument(document);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const week = weeks.find(({ id }) => id === selectedId) ?? weeks[0];
  const saved = useMemo(() => (week ? weekDraftOf(week) : null), [week]);
  const [edited, setEdited] = useState<WeekDraft | null>(null);
  const draft = edited ?? saved;
  const parsed = useMemo(() => (draft ? weekBodyOf(draft) : null), [draft]);
  const dirty = edited !== null && saved !== null && !sameDraft(edited, saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  const save = useMutation({
    mutationFn: ({ weekId, body }: { weekId: string; body: SaveProgramWeek }) =>
      write(`/weeks/${weekId}`, { method: 'PUT', body }),
    onSuccess: () => {
      setEdited(null);
    },
  });
  const publish = useMutation({
    mutationFn: () => write('/publish', { method: 'POST' }),
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={base} className="text-sm text-brand-text underline">
          Volver a los programas
        </Link>
      </div>
      <ProgramHeader
        program={program}
        editable={editable}
        canRevise={editsRecord}
        formulaFixed={formulaFixed}
        write={write}
        base={base}
      />
      {isDraft && !writes ? (
        <CareTeamNotice patientId={patientId} action="editar este programa" />
      ) : null}
      {editable && program.origin === 'PROPOSAL' && safety.blocked ? (
        <Notice tone="danger" title="Una llave de seguridad sigue cerrada" rule="RN-F15">
          La propuesta no se publica hasta que se abra.{' '}
          <Link
            href={`/panel/pacientes/${patientId}/entrenamiento`}
            className="underline underline-offset-4"
          >
            Ver las llaves
          </Link>
        </Notice>
      ) : null}
      {editable ? (
        <ProgramPublishPanel
          versionNo={program.versionNo}
          dirty={dirty}
          problems={program.publishProblems}
          closedKey={program.origin === 'MANUAL' && safety.blocked}
          publishing={publish.isPending}
          error={publish.error}
          onPublish={() => {
            publish.mutate();
          }}
        />
      ) : null}
      {editable && program.origin === 'PROPOSAL' ? (
        <ProposalBlocks document={document} locked={dirty} write={write} />
      ) : null}
      <ProgramMacrocycle program={program} defaultOpen={!isDraft} />
      {editable && program.origin === 'MANUAL' ? (
        <MesocycleManager document={document} locked={dirty} write={write} />
      ) : null}
      {weeks.length > 0 ? (
        <WeekNav
          document={document}
          selectedId={week?.id}
          locked={dirty}
          onSelect={(id) => {
            setSelectedId(id);
            setEdited(null);
            save.reset();
          }}
        />
      ) : editable ? null : (
        <EmptyState
          icon={Dumbbell}
          title="Este programa todavía no tiene semanas"
          description="Se arman en el borrador."
        />
      )}
      {week ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Semana {week.weekNo}</h3>
            {editable ? (
              <p role="status" className="text-sm">
                {dirty ? (
                  <StatusBadge tone="warning">Cambios sin guardar</StatusBadge>
                ) : (
                  <StatusBadge tone="success">Guardado</StatusBadge>
                )}
              </p>
            ) : null}
          </div>
          {editable && draft ? (
            <>
              <WeekEditor
                key={week.id}
                weekNo={week.weekNo}
                draft={draft}
                origin={program.origin}
                saving={save.isPending}
                onChange={(next) => {
                  setEdited(saved && sameDraft(next, saved) ? null : next);
                }}
              />
              {dirty ? (
                <WeekSaveBar
                  weekNo={week.weekNo}
                  problems={parsed && !parsed.ok ? parsed.problems : []}
                  saving={save.isPending}
                  error={save.error}
                  onSave={() => {
                    if (parsed?.ok) save.mutate({ weekId: week.id, body: parsed.body });
                  }}
                  onDiscard={() => {
                    setEdited(null);
                    save.reset();
                  }}
                />
              ) : null}
              {dirty ? (
                <p className="text-sm text-muted-foreground">
                  El plan y las series por grupo muscular se actualizan al guardar.
                </p>
              ) : null}
              {week.sessions.length > 0 ? <WeekPlan week={week} /> : null}
              <WeekMuscleSets week={week} document={document} />
              <DuplicateWeek
                key={`duplicar-${week.id}`}
                week={week}
                document={document}
                locked={dirty}
                write={write}
              />
            </>
          ) : (
            <ProgramWeekView week={week} document={document} />
          )}
        </div>
      ) : null}
    </div>
  );
}
