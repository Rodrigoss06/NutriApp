import {
  BIA_METRIC_LABELS,
  FAMILY_LABELS,
  formatReading,
  KIND_LABELS,
  LEVEL_LABELS,
  methodLabel,
  METRIC_LABELS,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  PURPOSE_LABELS,
  SITE_NUMBER_KINDS,
  type BiaUnit,
  type MethodPurpose,
} from '@nutricoach/contracts';
import { Text, View, type DocumentProps } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type {
  AnthropometrySheet,
  SheetInterpretation,
} from '../../../application/sheets/anthropometry-sheet.js';
import { patientLine } from './plan-parts.js';
import {
  longDate,
  num,
  section,
  sheetDocument,
  styles,
  table,
  type SheetFrame,
} from './sheet-kit.js';

/**
 * Ficha de resultados antropométricos, versión 1.0.0 (RF-15, RF-24, RN-H01): las condiciones de la medición (RN-C09),
 * cada resultado vigente con su método al lado del número (RN-D02, RN-H04: «% de grasa (Durnin & Womersley (1974) +
 * Siri)»), su interpretación con la fuente de la tabla (RN-D10) y los avisos de validez (RN-D06), las medidas que se
 * interpretan solas, las medidas consolidadas por familia (RN-C03) y la bioimpedancia como lectura del equipo (RN-C08).
 */

const yesNo = (value: boolean) => (value ? 'sí' : 'no');

/** Busca un código en una tabla de etiquetas: uno que la tabla no tiene vuelve como undefined, no se inventa. */
const lookup = <T>(table: Readonly<Record<string, T>>, code: string): T | undefined =>
  (table as Readonly<Record<string, T | undefined>>)[code];

/** El valor de un indicador con su redondeo (RN-D09) y su unidad. */
function metricValue(code: string, value: number, unit: string): string {
  const kind = lookup(METRIC_NUMBER_KINDS, code) ?? 'index';
  const label = lookup(METRIC_UNIT_LABELS, unit) ?? unit;
  return label ? `${num(value, kind)} ${label}` : num(value, kind);
}

/** «% de grasa (Durnin & Womersley (1974) + Siri)»; sin repetir cuando el método se llama como el indicador (IMC). */
function metricLabel(metricCode: string, methodCode: string): string {
  const metric = lookup(METRIC_LABELS, metricCode) ?? metricCode;
  const method = methodLabel(methodCode);
  return method === metric ? metric : `${metric} (${method})`;
}

function interpretationText(
  interpretation: SheetInterpretation | null,
  note: string | null,
): string {
  if (interpretation) return `${interpretation.label} · ${interpretation.source}`;
  return note ?? '';
}

function evaluationTitle(sheet: AnthropometrySheet): string {
  const { kind, level } = sheet.evaluation;
  if (level === null) return KIND_LABELS[kind];
  if (kind === 'ANTHROPOMETRY') return LEVEL_LABELS[level];
  return `${LEVEL_LABELS[level]} · ${KIND_LABELS[kind].toLowerCase()}`;
}

function conditions(sheet: AnthropometrySheet, frame: SheetFrame): ReactElement {
  const { evaluation } = sheet;
  const parts = [
    `En ayunas: ${yesNo(evaluation.fasting)}`,
    `actividad intensa en las 24 h previas: ${yesNo(evaluation.intenseActivityLast24h)}`,
  ];
  if (evaluation.hydration) parts.push(`hidratación: ${evaluation.hydration}`);
  return section(
    'Condiciones de la medición',
    frame.colors,
    h(Text, null, `${parts.join(' · ')}.`),
    sheet.populationNote
      ? h(View, { style: [styles.card, { marginTop: 6 }] }, h(Text, null, sheet.populationNote))
      : null,
  );
}

function results(sheet: AnthropometrySheet, frame: SheetFrame): ReactElement {
  return section(
    'Resultados',
    frame.colors,
    ...sheet.results.map((result, index) =>
      h(
        View,
        { key: index, style: [styles.card, { marginBottom: 6 }], wrap: false },
        h(
          Text,
          { style: [styles.subTitle, { color: frame.colors.primary.text }] },
          `${methodLabel(result.methodCode)} · versión ${result.methodVersion}`,
        ),
        result.principalFor.length > 0
          ? h(
              Text,
              { style: [styles.note, { marginBottom: 2 }] },
              `Método principal para ${result.principalFor
                .map((purpose) => PURPOSE_LABELS[purpose as MethodPurpose].toLowerCase())
                .join(' y ')} de este paciente.`,
            )
          : null,
        table(
          [
            { label: 'Indicador', flex: 3.2 },
            { label: 'Valor', flex: 1.2, numeric: true },
            { label: 'Interpretación', flex: 3 },
          ],
          result.metrics.map((metric) => [
            // El método va junto a cada número (RN-D02); en 4 componentes, cada masa con el suyo.
            metricLabel(metric.metricCode, metric.methodCode),
            metricValue(metric.metricCode, metric.value, metric.unit),
            interpretationText(metric.interpretation, metric.note),
          ]),
        ),
        ...result.warnings.map((warning, w) =>
          h(Text, { key: w, style: [styles.note, { marginTop: 2 }] }, `Aviso: ${warning.message}`),
        ),
      ),
    ),
  );
}

function siteInterpretations(sheet: AnthropometrySheet, frame: SheetFrame): ReactElement | null {
  if (sheet.siteInterpretations.length === 0) return null;
  return section(
    'Medidas con interpretación propia',
    frame.colors,
    table(
      [
        { label: 'Medida', flex: 3.2 },
        { label: 'Valor', flex: 1.2, numeric: true },
        { label: 'Interpretación', flex: 3 },
      ],
      sheet.siteInterpretations.map((site) => [
        site.name,
        `${num(site.value, SITE_NUMBER_KINDS[site.unit as 'kg' | 'cm' | 'mm'])} ${site.unit}`,
        interpretationText(site.interpretation, site.note),
      ]),
    ),
  );
}

function sites(sheet: AnthropometrySheet, frame: SheetFrame): ReactElement | null {
  if (sheet.sites.length === 0) return null;
  const families = [...new Set(sheet.sites.map((site) => site.family))];
  return section(
    'Medidas consolidadas',
    frame.colors,
    ...families.map((family, index) =>
      h(
        View,
        { key: index, style: { marginBottom: 6 }, wrap: false },
        h(Text, { style: styles.subTitle }, lookup(FAMILY_LABELS, family) ?? family),
        table(
          [
            { label: 'Sitio', flex: 3 },
            { label: 'Valor', flex: 1.2, numeric: true },
          ],
          sheet.sites
            .filter((site) => site.family === family)
            .map((site) => [
              site.name,
              `${num(site.value, SITE_NUMBER_KINDS[site.unit as 'kg' | 'cm' | 'mm'])} ${site.unit}`,
            ]),
        ),
      ),
    ),
  );
}

function bia(sheet: AnthropometrySheet, frame: SheetFrame): ReactElement | null {
  if (sheet.bia.length === 0) return null;
  return section(
    'Bioimpedancia',
    frame.colors,
    ...sheet.bia.map((reading, index) =>
      h(
        View,
        { key: index, style: { marginBottom: 6 }, wrap: false },
        h(
          Text,
          { style: styles.note },
          `Lectura del equipo ${reading.deviceBrand} ${reading.deviceModel}, cargada a mano: no se compara con los métodos antropométricos (RN-C08).`,
        ),
        table(
          [
            { label: 'Indicador', flex: 3 },
            { label: 'Valor', flex: 1.2, numeric: true },
          ],
          reading.readings.map((value) => [
            `${lookup(BIA_METRIC_LABELS, value.metric) ?? value.metric} (${value.deviceLabel})`,
            formatReading(value.value, value.unit as BiaUnit),
          ]),
        ),
      ),
    ),
  );
}

export function anthropometryV1(
  sheet: AnthropometrySheet,
  frame: SheetFrame,
): ReactElement<DocumentProps> {
  const engines = [...new Set(sheet.results.map((result) => result.engineVersion))];
  return sheetDocument(
    frame,
    patientLine(sheet.patient),
    conditions(sheet, frame),
    results(sheet, frame),
    siteInterpretations(sheet, frame),
    sites(sheet, frame),
    bia(sheet, frame),
    h(
      View,
      { style: styles.section, wrap: false },
      h(
        Text,
        { style: styles.note },
        `Cada número lleva su método; las interpretaciones usan las tablas vigentes el día de la medición. ${
          engines.length > 0 ? `Motor ${engines.join(', ')}.` : ''
        }`,
      ),
    ),
  );
}

export function anthropometryTitles(sheet: AnthropometrySheet): {
  title: string;
  subtitle: string;
} {
  const revision =
    sheet.evaluation.revision > 1 || sheet.evaluation.amended
      ? ` · revisión ${String(sheet.evaluation.revision)}${sheet.evaluation.amended ? ', enmendada' : ''}`
      : '';
  return {
    title: 'Resultados antropométricos',
    subtitle: `${evaluationTitle(sheet)} · medida el ${longDate(sheet.evaluation.measuredOn)}${revision}`,
  };
}
