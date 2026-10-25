import { createRequire } from 'node:module';
import { brandTokens, DEFAULT_BRAND, formatNumber, type NumberKind } from '@nutricoach/contracts';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import type { SheetLogo } from '../../../application/ports/documents.ports.js';
import type { SheetBrand } from '../../../domain/sheet.js';

/**
 * Piezas comunes de las fichas PDF (RF-24): la página A4 con la marca arriba (RN-H03) y el contacto y la numeración
 * abajo, títulos, tablas y el formato de los números (RN-D09). Las plantillas se escriben con createElement: la API no
 * compila JSX (ADR-064). Nada aquí lee el reloj: la fecha del PDF es la del origen (RN-H02).
 */

const require = createRequire(import.meta.url);
const archivo = (weight: 400 | 600 | 700) =>
  require.resolve(`@fontsource/archivo/files/archivo-latin-${String(weight)}-normal.woff`);

// Archivo, la letra del panel (OFL), embebida en cada PDF: el subconjunto latino trae tildes, ñ, ¿, ¡, «», µ y ·.
Font.register({
  family: 'Archivo',
  fonts: [
    { src: archivo(400) },
    { src: archivo(600), fontWeight: 600 },
    { src: archivo(700), fontWeight: 700 },
  ],
});
// Sin cortar palabras con guiones: los nombres de alimentos y métodos se leen enteros.
Font.registerHyphenationCallback((word) => [word]);

const INK = '#1f2a27';
const MUTED = '#5b6763';
const RULE = '#d5dcd9';
const SURFACE = '#f3f6f5';

/** Los colores de la marca con contraste suficiente sobre el papel (ADR-027): lo no fijado, con la paleta provisional. */
export function sheetColors(brand: SheetBrand) {
  const primary = brandTokens(brand.primaryColor ?? DEFAULT_BRAND.primary);
  const secondary = brandTokens(brand.secondaryColor ?? DEFAULT_BRAND.secondary);
  return { primary, secondary };
}

export type SheetColors = ReturnType<typeof sheetColors>;

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Archivo',
    fontSize: 9.5,
    color: INK,
    paddingTop: 96,
    paddingBottom: 64,
    paddingHorizontal: 40,
  },
  header: {
    position: 'absolute',
    top: 28,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    borderBottomWidth: 2,
  },
  brandBlock: { flexDirection: 'row', alignItems: 'center', maxWidth: '55%' },
  logo: { maxHeight: 40, maxWidth: 120, marginRight: 10, objectFit: 'contain' },
  brandName: { fontSize: 12, fontWeight: 700 },
  titleBlock: { alignItems: 'flex-end', maxWidth: '45%' },
  title: { fontSize: 14, fontWeight: 700, textAlign: 'right' },
  subtitle: { fontSize: 8.5, color: MUTED, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    paddingTop: 6,
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
  footerText: { maxWidth: '80%' },
  // El interlineado va en el cuerpo, con su tamaño de letra: en la página, react-pdf saca de la hoja el pie con
  // posición absoluta, y sin tamaño lo calcula sobre los 18 pt por defecto.
  body: { fontSize: 9.5, lineHeight: 1.35 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, marginBottom: 6 },
  subTitle: { fontSize: 10, fontWeight: 600, marginBottom: 3 },
  note: { fontSize: 8, color: MUTED },
  muted: { color: MUTED },
  strong: { fontWeight: 600 },
  card: { backgroundColor: SURFACE, borderRadius: 4, padding: 8 },
  row: { flexDirection: 'row' },
  table: { borderTopWidth: 0.75, borderTopColor: RULE },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
    paddingVertical: 3.5,
  },
  tableHead: { fontWeight: 600, color: MUTED, fontSize: 8 },
  cell: { paddingRight: 6 },
  numeric: { textAlign: 'right' },
});

/** Un número clínico con el redondeo de RN-D09 y el formato es-PE. */
export const num = (value: number | null | undefined, kind: NumberKind): string =>
  formatNumber(value, kind);

/** Un número con decimales fijos, para lo que RN-D09 no nombra (PAL, g/kg). */
export const fixed = (value: number, digits: number): string =>
  new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

/** Una fecha local YYYY-MM-DD como «24 de octubre de 2026». */
export const longDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );

export function section(
  title: string,
  colors: SheetColors,
  ...children: ReactNode[]
): ReactElement {
  return h(
    View,
    { style: styles.section },
    h(
      Text,
      { style: [styles.sectionTitle, { color: colors.primary.text }], minPresenceAhead: 40 },
      title,
    ),
    ...children,
  );
}

export interface Column {
  readonly label: string;
  /** Proporción del ancho. */
  readonly flex: number;
  readonly numeric?: boolean;
}

/** Una tabla simple: encabezado y filas de texto, con las columnas numéricas a la derecha. */
export function table(
  columns: readonly Column[],
  rows: readonly (readonly ReactNode[])[],
): ReactElement {
  const cell = (column: Column, content: ReactNode, head: boolean, index: number) =>
    h(
      Text,
      {
        key: index,
        style: [
          styles.cell,
          { flex: column.flex },
          ...(column.numeric ? [styles.numeric] : []),
          ...(head ? [styles.tableHead] : []),
        ],
      },
      content,
    );
  return h(
    View,
    { style: styles.table },
    h(
      View,
      { style: styles.tableRow, fixed: false },
      ...columns.map((column, i) => cell(column, column.label, true, i)),
    ),
    ...rows.map((row, r) =>
      h(
        View,
        { key: r, style: styles.tableRow, wrap: false },
        ...columns.map((column, i) => cell(column, row[i] ?? '', false, i)),
      ),
    ),
  );
}

/** Texto con partes en negrita: [texto normal, fuerte, normal, …]. */
export function emphasis(...parts: readonly string[]): ReactElement[] {
  return parts.map((part, i) => h(Text, { key: i, style: i % 2 === 1 ? styles.strong : {} }, part));
}

export interface SheetFrame {
  readonly title: string;
  readonly subtitle: string;
  readonly brand: SheetBrand;
  readonly logo: SheetLogo | null;
  readonly colors: SheetColors;
  /** La fecha del origen: creación y modificación del PDF. */
  readonly issuedAt: Date;
}

const LOGO_FORMATS: Readonly<Record<string, 'png' | 'jpg'>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * El documento entero: metadatos con la fecha del origen (nunca el reloj), la marca arriba y, abajo, el contacto, el pie
 * de la marca y «Página N de M» en cada página.
 */
export function sheetDocument(
  frame: SheetFrame,
  ...body: ReactNode[]
): ReactElement<DocumentProps> {
  const { brand, colors, logo } = frame;
  const format = logo ? LOGO_FORMATS[logo.mimeType] : undefined;
  const contact = [brand.contact.phone, brand.contact.email, brand.contact.website].filter(
    (value): value is string => value !== null,
  );
  return h(
    Document,
    {
      title: frame.title,
      author: brand.displayName,
      creator: 'NutriCoach',
      producer: 'NutriCoach',
      language: 'es-PE',
      creationDate: frame.issuedAt,
      modificationDate: frame.issuedAt,
    },
    h(
      Page,
      { size: 'A4', style: styles.page, wrap: true },
      h(
        View,
        { style: [styles.header, { borderBottomColor: colors.primary.base }], fixed: true },
        h(
          View,
          { style: styles.brandBlock },
          logo && format
            ? h(Image, { style: styles.logo, src: { data: Buffer.from(logo.content), format } })
            : null,
          h(Text, { style: [styles.brandName, { color: colors.primary.text }] }, brand.displayName),
        ),
        h(
          View,
          { style: styles.titleBlock },
          h(Text, { style: styles.title }, frame.title),
          h(Text, { style: styles.subtitle }, frame.subtitle),
        ),
      ),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(
          Text,
          { style: styles.footerText },
          [contact.join(' · '), brand.footer].filter((part) => part).join('  ·  '),
        ),
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Página ${String(pageNumber)} de ${String(totalPages)}`,
        }),
      ),
      h(View, { style: styles.body }, ...body),
    ),
  );
}
