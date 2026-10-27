import { Injectable, Logger } from '@nestjs/common';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { PdfRenderer, SheetRender } from '../../../application/ports/documents.ports.js';
import type { AnthropometrySheet } from '../../../application/sheets/anthropometry-sheet.js';
import type { MenuSheet } from '../../../application/sheets/menu-sheet.js';
import type { ExchangeDietSheet, SheetContent } from '../../../application/sheets/sheet-content.js';
import { anthropometryTitles, anthropometryV1 } from './anthropometry.v1.js';
import { exchangeDietTitles, exchangeDietV1 } from './exchange-diet.v1.js';
import { sheetColors, type SheetFrame } from './sheet-kit.js';
import { weeklyMenuTitles, weeklyMenuV1 } from './weekly-menu.v1.js';

type Template = (content: SheetContent, input: SheetRender) => ReactElement<DocumentProps>;

function frameOf(input: SheetRender, titles: { title: string; subtitle: string }): SheetFrame {
  return {
    ...titles,
    brand: input.brand,
    logo: input.logo,
    colors: sheetColors(input.brand),
    issuedAt: input.issuedAt,
  };
}

/** Una plantilla para un tipo de ficha: con otro contenido, falla en vez de dibujar algo que no corresponde. */
function template<C extends SheetContent>(
  kind: C['kind'],
  draw: (content: C, frame: SheetFrame) => ReactElement<DocumentProps>,
  titles: (content: C) => { title: string; subtitle: string },
): Template {
  return (content, input) => {
    if (content.kind !== kind)
      throw new Error(`La plantilla de ${kind} no dibuja ${content.kind}.`);
    const typed = content as C;
    return draw(typed, frameOf(input, titles(typed)));
  };
}

/**
 * Cada plantilla por tipo y versión (documents.template). Una versión publicada no se toca: un cambio visual es una
 * versión nueva, y la anterior se queda para volver a dibujar lo que ya se generó con ella (RN-H02).
 */
const TEMPLATES: Readonly<Record<string, Template>> = {
  'EXCHANGE_DIET@1.0.0': template<ExchangeDietSheet>(
    'EXCHANGE_DIET',
    exchangeDietV1,
    exchangeDietTitles,
  ),
  'WEEKLY_MENU@1.0.0': template<MenuSheet>('WEEKLY_MENU', weeklyMenuV1, weeklyMenuTitles),
  'ANTHROPOMETRY@1.0.0': template<AnthropometrySheet>(
    'ANTHROPOMETRY',
    anthropometryV1,
    anthropometryTitles,
  ),
};

/**
 * Las fichas con @react-pdf/renderer (ADR-064), en el worker. Con la misma entrada da los mismos bytes: la fecha del
 * PDF es la del origen y la versión de la biblioteca va fija en el catálogo. Mide cada ficha para RNF-04 (3 s o menos).
 */
@Injectable()
export class ReactPdfRenderer implements PdfRenderer {
  readonly #logger = new Logger(ReactPdfRenderer.name);

  async render(input: SheetRender): Promise<Uint8Array> {
    const template = TEMPLATES[`${input.content.kind}@${input.templateVersion}`];
    if (!template) {
      throw new Error(`No existe la plantilla ${input.content.kind} ${input.templateVersion}.`);
    }
    const started = performance.now();
    const pdf = await renderToBuffer(template(input.content, input));
    this.#logger.log(
      `Ficha ${input.content.kind} ${input.templateVersion}: ${String(Math.round(performance.now() - started))} ms, ${String(pdf.byteLength)} bytes`,
    );
    return new Uint8Array(pdf);
  }
}
