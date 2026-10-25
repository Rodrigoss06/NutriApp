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
