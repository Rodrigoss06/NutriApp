import type { RecordDocumentsResponse } from '@nutricoach/contracts';
import { Notice } from '@nutricoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MyRecordDocuments } from '@/features/record-documents/my-record-documents';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Documentos' };

/**
 * Tus documentos (P-31; RN-G21): lo que te pidió tu coach, para subirlo desde el celular, y lo que ya subiste. Un archivo PDF, JPEG
 * o PNG de hasta 5 MB o un enlace; los videos, siempre por enlace.
 */
export default async function Page() {
  const documents = await serverApi<RecordDocumentsResponse>('/me/record-documents');
  if (!documents.ok) {
    return <Notice tone="danger" title="No pudimos cargar tus documentos" />;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/mi/mas"
          className="flex min-h-touch items-center text-sm text-brand-text underline"
        >
          Volver a Más
        </Link>
        <h1 className="text-2xl font-semibold">Documentos</h1>
      </div>
      <MyRecordDocuments response={documents.data} />
    </div>
  );
}
