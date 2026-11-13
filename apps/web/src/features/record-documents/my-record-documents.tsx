'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  addRecordDocumentSchema,
  RECORD_DOCUMENT_CATEGORIES,
  RECORD_DOCUMENT_CATEGORY_LABELS,
  type RecordDocument,
  type RecordDocumentsResponse,
} from '@nutricoach/contracts';
import { Button, ConfirmDialog, Notice, Select } from '@nutricoach/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitWith, TextField } from '@/features/forms/fields';
import { FormError } from '@/features/forms/form-error';
import { newActionKey } from '@/features/patient-app/records';
import { ContentFields, useContentChoice } from './content-fields';
import { DocumentItem } from './document-item';
import {
  addDocument,
  deleteDocument,
  replaceDocumentContent,
  type DocumentContent,
  type DocumentInput,
} from './record-documents-api';
import {
  patientCanDelete,
  patientCanReplace,
  pendingDocuments,
  uploadedDocuments,
} from './record-documents-view';

const formSchema = addRecordDocumentSchema.pick({ title: true, category: true });
const DEFAULTS: DocumentInput = { title: '', category: 'CLINICAL' };
const CATEGORY_OPTIONS = RECORD_DOCUMENT_CATEGORIES.map((category) => ({
  value: category,
  label: RECORD_DOCUMENT_CATEGORY_LABELS[category],
}));

/** Cada escritura de la app lleva su Idempotency-Key (06 §5): la misma en los reintentos de una acción. */
const keyed = (key: string) => ({ 'Idempotency-Key': `doc:${key}` });

/** Subir el archivo o el enlace de un documento: completar un pedido o reemplazar lo que está por revisar. */
function UploadContent({
  document,
  imagesConsent,
  label,
  onDone,
}: {
  document: RecordDocument;
  imagesConsent: boolean;
  label: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const choice = useContentChoice('FILE');
  const upload = useMutation({
    mutationFn: ({ content, key }: { content: DocumentContent; key: string }) =>
      replaceDocumentContent(
        `/me/record-documents/${document.id}/content`,
        document.version,
        content,
        keyed(key),
      ),
    retry: 2,
    onSuccess: () => {
      choice.reset();
      onDone?.();
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      aria-label={`${label} «${document.title}»`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void choice.resolve().then((content) => {
          if (content) upload.mutate({ content, key: newActionKey() });
        });
      }}
    >
      <ContentFields choice={choice} imagesConsent={imagesConsent} touch />
      <FormError error={upload.error} title="No se subió el documento" />
      <div>
        <Button type="submit" size="touch" disabled={upload.isPending}>
          {upload.isPending ? 'Subiendo…' : label}
        </Button>
      </div>
    </form>
  );
}

/** Un documento propio que todavía no está validado: reemplazarlo y, si lo subió el alumno, borrarlo. */
function OwnDocumentActions({
  document,
  imagesConsent,
}: {
  document: RecordDocument;
  imagesConsent: boolean;
}) {
  const router = useRouter();
  const [replacing, setReplacing] = useState(false);
  const remove = useMutation({
    mutationFn: (key: string) =>
      deleteDocument(`/me/record-documents/${document.id}`, document.version, keyed(key)),
    retry: 2,
    onSuccess: () => {
      router.refresh();
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="touch"
          aria-expanded={replacing}
          onClick={() => {
            setReplacing((open) => !open);
          }}
        >
          Reemplazar<span className="sr-only"> «{document.title}»</span>
        </Button>
        {patientCanDelete(document) ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="touch" disabled={remove.isPending}>
                Borrar<span className="sr-only"> «{document.title}»</span>
              </Button>
            }
            title={`¿Borrar «${document.title}»?`}
            description="Se borra ahora y tu coach ya no lo verá."
            confirmLabel="Borrar"
            tone="danger"
            onConfirm={() => {
              remove.mutate(newActionKey());
            }}
          />
        ) : null}
      </div>
      {replacing ? (
        <UploadContent
          document={document}
          imagesConsent={imagesConsent}
          label="Subir el nuevo"
          onDone={() => {
            setReplacing(false);
          }}
        />
      ) : null}
      <FormError error={remove.error} title="No se borró el documento" />
    </div>
  );
}

/** Agregar un documento nuevo, que queda por revisar. */
function AddMyDocument({ imagesConsent }: { imagesConsent: boolean }) {
  const router = useRouter();
  const choice = useContentChoice('FILE');
  const form = useForm<DocumentInput>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });
  const add = useMutation({
    mutationFn: ({
      input,
      content,
      key,
    }: {
      input: DocumentInput;
      content: DocumentContent;
      key: string;
    }) => addDocument('/me/record-documents', input, content, keyed(key)),
    retry: 2,
    onSuccess: () => {
      form.reset(DEFAULTS);
      choice.reset();
      router.refresh();
    },
  });
  return (
    <form
      noValidate
      aria-label="Agregar un documento"
      className="flex flex-col gap-3"
      onSubmit={submitWith(
        form.handleSubmit(async (input) => {
          const content = await choice.resolve();
          if (content) add.mutate({ input, content, key: newActionKey() });
        }),
      )}
    >
      <TextField
        label="Título"
        autoComplete="off"
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
            onValueChange={(value) => {
              field.onChange(value);
            }}
            options={CATEGORY_OPTIONS}
          />
        )}
      />
      <ContentFields choice={choice} imagesConsent={imagesConsent} touch />
      <FormError error={add.error} title="No se subió el documento" />
      {add.isSuccess ? (
        <Notice tone="success" title="Documento subido">
          Tu coach lo revisará.
        </Notice>
      ) : null}
      <div>
        <Button type="submit" size="touch" disabled={add.isPending}>
          {add.isPending ? 'Subiendo…' : 'Subir documento'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Tu expediente de documentos (P14.5, PR 8b; P-31; RN-G21): arriba lo que te pidió tu coach o te devolvió, para subirlo; después,
 * agregar uno nuevo; al final, lo que ya subiste. Lo validado ya no se cambia desde la app.
 */
export function MyRecordDocuments({ response }: { response: RecordDocumentsResponse }) {
  const { consents, documents } = response;
  const pending = pendingDocuments(documents);
  const uploaded = uploadedDocuments(documents);
  const canUpload = consents.healthData;
  return (
    <div className="flex flex-col gap-6">
      {canUpload ? null : (
        <Notice tone="warning" title="Todavía no puedes subir documentos" rule="RN-B01">
          Para guardarlos necesitas el consentimiento de datos de salud. Consulta a tu equipo.
        </Notice>
      )}
      {canUpload && !consents.images ? (
        <p className="text-sm text-muted-foreground">
          Puedes subir PDF. Para subir fotos o enlaces, como un video, tu coach tiene que registrar
          tu autorización de imágenes.
        </p>
      ) : null}
      <section aria-labelledby="documentos-pedidos" className="flex flex-col gap-2">
        <h2 id="documentos-pedidos" className="text-lg font-semibold">
          Lo que te pidió tu coach
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tienes documentos pendientes.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Documentos pendientes">
            {pending.map((document) => (
              <DocumentItem
                key={document.id}
                document={document}
                audience="patient"
                timezone={null}
                categoryLabel={RECORD_DOCUMENT_CATEGORY_LABELS[document.category]}
              >
                {canUpload ? (
                  <UploadContent
                    document={document}
                    imagesConsent={consents.images}
                    label="Subir"
                  />
                ) : null}
              </DocumentItem>
            ))}
          </ul>
        )}
      </section>
      {canUpload ? (
        <section aria-labelledby="documentos-agregar" className="flex flex-col gap-2">
          <h2 id="documentos-agregar" className="text-lg font-semibold">
            Agregar un documento
          </h2>
          <AddMyDocument imagesConsent={consents.images} />
        </section>
      ) : null}
      <section aria-labelledby="documentos-tuyos" className="flex flex-col gap-2">
        <h2 id="documentos-tuyos" className="text-lg font-semibold">
          Tus documentos
        </h2>
        {uploaded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay documentos subidos.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Tus documentos">
            {uploaded.map((document) => (
              <DocumentItem
                key={document.id}
                document={document}
                audience="patient"
                timezone={null}
                categoryLabel={RECORD_DOCUMENT_CATEGORY_LABELS[document.category]}
              >
                {canUpload && patientCanReplace(document) ? (
                  <OwnDocumentActions document={document} imagesConsent={consents.images} />
                ) : null}
              </DocumentItem>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
