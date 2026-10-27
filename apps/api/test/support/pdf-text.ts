import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** El texto de un PDF, página por página: las pruebas leen lo que la ficha dice de verdad (RN-D02, RN-H04). */
export async function pdfText(pdf: Uint8Array): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const document = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= document.numPages; n += 1) {
    const content = await (await document.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  await task.destroy();
  return pages.join('\n').replace(/\s+/g, ' ');
}

/** Un trozo de texto con su línea de base y su alto, en puntos desde abajo a la izquierda de la página. */
export interface PdfTextItem {
  readonly page: number;
  readonly text: string;
  readonly y: number;
  readonly height: number;
}

/** Cada trozo de texto con su posición: para ver que el encabezado y el pie no pisan el cuerpo (ADR-066). */
export async function pdfTextItems(pdf: Uint8Array): Promise<PdfTextItem[]> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const document = await task.promise;
  const items: PdfTextItem[] = [];
  for (let n = 1; n <= document.numPages; n += 1) {
    const content = await (await document.getPage(n)).getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim() !== '') {
        // transform es la matriz [a, b, c, d, e, f] del texto: f es la altura de su línea de base.
        const [, , , , , baseline = 0] = item.transform as readonly number[];
        items.push({ page: n, text: item.str.trim(), y: baseline, height: item.height });
      }
    }
  }
  await task.destroy();
  return items;
}
