'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  addRecordDocumentSchema,
  RECORD_DOCUMENT_CATEGORIES,
  RECORD_DOCUMENT_CATEGORY_LABELS,
  type CareTeamMember,
  type MemberResponse,
  type RecordDocument,
  type RecordDocumentsResponse,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextAreaField, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { useWritesRecord } from '@/features/patients/use-writes-record';
import { useCanWrite, usePanelSession } from '@/features/session/panel-session';
import { ContentFields, useContentChoice } from './content-fields';
import { DocumentItem } from './document-item';
import {
  addDocument,
  deleteDocument,
  reviewDocument,
  type DocumentContent,
  type DocumentInput,
} from './record-documents-api';
import { documentsByCategory } from './record-documents-view';

const formSchema = addRecordDocumentSchema.pick({ title: true, category: true });
const DEFAULTS: DocumentInput = { title: '', category: 'CLINICAL' };
const CATEGORY_OPTIONS = RECORD_DOCUMENT_CATEGORIES.map((category) => ({
  value: category,
  label: RECORD_DOCUMENT_CATEGORY_LABELS[category],
}));

/** Pedir un documento al alumno o agregarlo ya validado, con su archivo o su enlace (P-31; RN-G21). */
function AddDocumentForm({
  patientId,
  noun,
  imagesConsent,
  disabled,
}: {
  patientId: string;
  noun: string;
  imagesConsent: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const choice = useContentChoice('REQUEST');
  const form = useForm<DocumentInput>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });
  const add = useMutation({
    mutationFn: ({ input, content }: { input: DocumentInput; content: DocumentContent | null }) =>
      addDocument(`/patients/${patientId}/record-documents`, input, content),
    onSuccess: () => {
      form.reset(DEFAULTS);
      choice.reset();
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      aria-label="Pedir o agregar un documento"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={submitWith(
        form.handleSubmit(async (input) => {
          const content = await choice.resolve();
          if (content !== undefined) add.mutate({ input, content });
        }),
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <TextField
          label="Título"
          autoComplete="off"
          disabled={disabled}
          error={form.formState.errors.title?.message}
          {...form.register('title')}
        />
        <Controller
          control={form.control}
          name="category"
          render={({ field }) => (
            <Select
              label="Categoría"
              value={field.value}
              disabled={disabled}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              options={CATEGORY_OPTIONS}
            />
          )}
        />
      </div>
      <ContentFields
        choice={choice}
        imagesConsent={imagesConsent}
        requestLabel={`Pedírselo al ${noun}`}
        disabled={disabled}
      />
      <FormError error={add.error} title="No se guardó el documento" />
      {add.isSuccess ? (
        <Notice
          tone="success"
          title={add.data.status === 'PENDING' ? 'Documento pedido' : 'Documento agregado'}
        >
          {add.data.status === 'PENDING'
            ? `El ${noun} lo verá en su app para subirlo.`
            : 'Entra validado, porque lo agregaste tú.'}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" disabled={disabled || add.isPending}>
          {choice.kind === 'REQUEST' ? 'Pedir documento' : 'Agregar documento'}
        </Button>
      </div>
    </form>
  );
}

/** Validar o devolver con una nota lo que está por revisar, y borrar con confirmación. */
function StaffDocumentActions({
  document,
  disabled,
}: {
  document: RecordDocument;
  disabled: boolean;
}) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const refresh = () => {
    router.refresh();
  };
  const review = useMutation({
    mutationFn: (decision: { decision: 'VALIDATE' } | { decision: 'RETURN'; note: string }) =>
      reviewDocument(document.id, document.version, decision),
    onSuccess: () => {
      setReturning(false);
      setNote('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteDocument(`/record-documents/${document.id}`, document.version),
    onSuccess: refresh,
  });
  const busy = disabled || review.isPending || remove.isPending;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {document.status === 'IN_REVIEW' ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                review.mutate({ decision: 'VALIDATE' });
              }}
            >
              Validar<span className="sr-only"> «{document.title}»</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              aria-expanded={returning}
              onClick={() => {
                setReturning((open) => !open);
              }}
            >
              Devolver<span className="sr-only"> «{document.title}»</span>
            </Button>
          </>
        ) : null}
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={busy}>
              Borrar<span className="sr-only"> «{document.title}»</span>
            </Button>
          }
          title={`¿Borrar «${document.title}»?`}
          description="Su archivo se borra y no se puede recuperar. Queda registrado quién lo borró y cuándo."
          confirmLabel="Borrar"
          tone="danger"
          onConfirm={() => {
            remove.mutate();
          }}
        />
      </div>
      {returning ? (
        <form
          noValidate
          aria-label={`Devolver «${document.title}»`}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = note.trim();
            if (!text) {
              setNoteError('Escribe qué tiene que corregir.');
              return;
            }
            review.mutate({ decision: 'RETURN', note: text });
          }}
        >
          <TextAreaField
            label="Qué tiene que corregir"
            rows={2}
            maxLength={500}
            value={note}
            error={noteError ?? undefined}
            onChange={(event) => {
              setNote(event.currentTarget.value);
              setNoteError(null);
            }}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Devolver con esta nota
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setReturning(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      <FormError error={review.error ?? remove.error} title="No se guardó el cambio" />
    </div>
  );
}

/**
 * El expediente de documentos del alumno para su equipo (P14.5, PR 8b; P-31; RN-G21): pedir o agregar, y las 8 categorías de la
 * hoja con sus documentos. Lo cambia quien escribe en el expediente (RN-A05); la API decide.
 */
export function StaffRecordDocuments({
  patientId,
  response,
  careTeam,
  members,
  noun,
}: {
  patientId: string;
  response: RecordDocumentsResponse;
  careTeam: readonly CareTeamMember[];
  members: readonly MemberResponse[];
  noun: string;
}) {
  const { timezone } = usePanelSession();
  const canWrite = useCanWrite();
  const writes = useWritesRecord(careTeam, members);
  const { consents, documents } = response;
  const editable = canWrite && writes;
  const consentsHref = `/panel/pacientes/${patientId}/consentimientos`;
  return (
    <div className="flex flex-col gap-6">
      {consents.healthData ? (
        <>
          <AddDocumentForm
            patientId={patientId}
            noun={noun}
            imagesConsent={consents.images}
            disabled={!editable}
          />
          {consents.images ? null : (
            <p className="text-sm text-muted-foreground">
              Las fotos y los enlaces, donde van los videos, piden la autorización de imágenes:
              regístrala en{' '}
              <Link href={consentsHref} className="text-brand-text underline">
                Consentimientos
              </Link>
              . Los PDF no la piden.
            </p>
          )}
        </>
      ) : (
        <Notice tone="warning" title="Sin el consentimiento de datos de salud" rule="RN-B01">
          No se guardan documentos del {noun} hasta que lo registres en{' '}
          <Link href={consentsHref} className="text-brand-text underline">
            Consentimientos
          </Link>
          .
        </Notice>
      )}
      {documentsByCategory(documents).map((group) => (
        <section
          key={group.category}
          aria-labelledby={`categoria-${group.category}`}
          className="flex flex-col gap-2"
        >
          <h3 id={`categoria-${group.category}`} className="font-semibold">
            {group.label}{' '}
            <span className="font-normal text-muted-foreground">({group.documents.length})</span>
          </h3>
          {group.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin documentos.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={`Documentos de ${group.label}`}>
              {group.documents.map((document) => (
                <DocumentItem
                  key={document.id}
                  document={document}
                  audience="staff"
                  timezone={timezone}
                >
                  {editable ? <StaffDocumentActions document={document} disabled={false} /> : null}
                </DocumentItem>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
