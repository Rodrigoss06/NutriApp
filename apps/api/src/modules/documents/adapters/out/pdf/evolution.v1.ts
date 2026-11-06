import {
  BIA_METRIC_LABELS,
  CONDITION_DIFFERENCE_LABELS,
  formatReading,
  methodLabel,
  METRIC_LABELS,
  METRIC_NUMBER_KINDS,
  METRIC_UNIT_LABELS,
  SIGNIFICANCE_LABELS,
  SITE_NUMBER_KINDS,
  type BiaUnit,
} from '@nutricoach/contracts';
import { Text, View, type DocumentProps } from '@react-pdf/renderer';
import { createElement as h, type ReactElement } from 'react';
import type {
  EvolutionSheet,
  EvolutionSheetSeries,
} from '../../../application/sheets/evolution-sheet.js';
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
 * Ficha de evolución, versión 1.0.0 (RF-35, RF-24, RN-H01, ADR-091): las evaluaciones cerradas vigentes hasta la de origen con lo
 * que cambió en sus condiciones (RN-C09); cada medida con su primer y último valor y el cambio frente al CMD95 del evaluador
 * (RN-C06); cada indicador por método, con el método al lado del número (RN-D02, RN-D03, RN-H04); y la bioimpedancia por equipo
 * (RN-C08).
 */

/** Busca un código en una tabla de etiquetas: uno que la tabla no tiene vuelve como undefined, no se inventa. */
const lookup = <T>(labels: Readonly<Record<string, T>>, code: string): T | undefined =>
  (labels as Readonly<Record<string, T | undefined>>)[code];

type Format = (value: number) => string;

const siteFormat =
  (unit: string): Format =>
  (value) =>
    `${num(value, lookup(SITE_NUMBER_KINDS, unit) ?? 'length')} ${unit}`;

const metricFormat =
  (metricCode: string, unit: string): Format =>
  (value) => {
    const kind = lookup(METRIC_NUMBER_KINDS, metricCode) ?? 'index';
    const label = lookup(METRIC_UNIT_LABELS, unit) ?? unit;
    return label ? `${num(value, kind)} ${label}` : num(value, kind);
  };

/** «−6.9 mm»: el cambio con su signo y su unidad. */
const signed = (format: Format, change: number): string =>
  change > 0 ? `+${format(change)}` : change < 0 ? `−${format(-change)}` : format(0);

const first = (series: EvolutionSheetSeries) => series.points[0];
const last = (series: EvolutionSheetSeries) => series.points.at(-1);

/** Una fila de una serie: el primer valor, el último y el cambio entre los dos. */
function seriesRow(
  name: string,
  series: EvolutionSheetSeries,
  format: Format,
  measured: boolean,
): string[] {
  const start = first(series);
  const end = last(series);
  const overall = series.overall;
  return [
    name,
    start ? `${format(start.value)} (${longDate(start.measuredOn)})` : '—',
    end ? `${format(end.value)} (${longDate(end.measuredOn)})` : '—',
    overall ? signed(format, overall.change) : '—',
    ...(measured ? [overall?.significance ? SIGNIFICANCE_LABELS[overall.significance] : '—'] : []),
  ];
}

function evaluations(sheet: EvolutionSheet, frame: SheetFrame): ReactElement {
  return section(
    'Evaluaciones',
    frame.colors,
    table(
      [
        { label: 'Fecha', flex: 2 },
        { label: 'Frente a la anterior', flex: 5 },
      ],
      sheet.evaluations.map((evaluation, index) => [
        longDate(evaluation.measuredOn),
        index === 0
          ? 'Primera evaluación'
          : evaluation.conditionDifferences.length === 0
            ? 'Mismas condiciones y evaluador'
            : `Atención: ${evaluation.conditionDifferences
                .map((code) => lookup(CONDITION_DIFFERENCE_LABELS, code) ?? code)
                .join(', ')}`,
      ]),
    ),
  );
}

function measurements(sheet: EvolutionSheet, frame: SheetFrame): ReactElement | null {
  const rows = [
    ...(sheet.skinfoldSum6 && sheet.skinfoldSum6.points.length > 1
      ? [seriesRow('Suma de 6 pliegues', sheet.skinfoldSum6, siteFormat('mm'), true)]
      : []),
    ...sheet.sites.map((site) => seriesRow(site.name, site, siteFormat(site.unit), true)),
  ];
  if (rows.length === 0) return null;
  return section(
    'Medidas',
    frame.colors,
    h(
      Text,
      { style: [styles.note, { marginBottom: 4 }] },
      'Valores consolidados de las tomas. Un cambio que no supera el CMD95 del evaluador es «sin cambio significativo» (RN-C06).',
    ),
    table(
      [
        { label: 'Medida', flex: 2.4 },
        { label: 'Primera', flex: 2.2, numeric: true },
        { label: 'Última', flex: 2.2, numeric: true },
        { label: 'Cambio', flex: 1.2, numeric: true },
        { label: 'Frente al CMD95', flex: 2 },
      ],
      rows,
    ),
  );
}

function methods(sheet: EvolutionSheet, frame: SheetFrame): ReactElement | null {
  if (sheet.metrics.length === 0) return null;
  return section(
    'Indicadores por método',
    frame.colors,
    h(
      Text,
      { style: [styles.note, { marginBottom: 4 }] },
      'Cada serie es de un solo método: métodos distintos no se comparan (RN-D03). El CMD95 no se traslada a los números derivados (RN-C05).',
    ),
    table(
      [
        { label: 'Indicador y método', flex: 3.4 },
        { label: 'Primera', flex: 2.2, numeric: true },
        { label: 'Última', flex: 2.2, numeric: true },
        { label: 'Cambio', flex: 1.2, numeric: true },
      ],
      sheet.metrics.map((metric) => {
        const name = lookup(METRIC_LABELS, metric.metricCode) ?? metric.metricCode;
        const method = methodLabel(metric.methodCode);
        const label =
          method === name || method.startsWith(`${name} `) ? method : `${name} (${method})`;
        return seriesRow(label, metric, metricFormat(metric.metricCode, metric.unit), false);
      }),
    ),
  );
}

/** El indicador de la bioimpedancia con el nombre que le da el equipo, sin repetirlo si coinciden. */
function biaName(metric: string, deviceLabel: string): string {
  const name = lookup(BIA_METRIC_LABELS, metric) ?? metric;
  return name.toLowerCase() === deviceLabel.toLowerCase() ? name : `${name} (${deviceLabel})`;
}

function bia(sheet: EvolutionSheet, frame: SheetFrame): ReactElement | null {
  if (sheet.bia.length === 0) return null;
  const devices = [...new Set(sheet.bia.map((reading) => reading.device))];
  return section(
    'Bioimpedancia',
    frame.colors,
    ...devices.map((device, index) =>
      h(
        View,
        { key: index, style: { marginBottom: 6 }, wrap: false },
        h(
          Text,
          { style: styles.note },
          `Lecturas del equipo ${device}, cargadas a mano: no se comparan con los métodos antropométricos (RN-C08).`,
        ),
        table(
          [
            { label: 'Indicador', flex: 3.4 },
            { label: 'Primera', flex: 2.2, numeric: true },
            { label: 'Última', flex: 2.2, numeric: true },
            { label: 'Cambio', flex: 1.2, numeric: true },
          ],
          sheet.bia
            .filter((reading) => reading.device === device)
            .map((reading) =>
              seriesRow(
                biaName(reading.metric, reading.deviceLabel),
                reading,
                (value) => formatReading(value, reading.unit as BiaUnit),
                false,
              ),
            ),
        ),
      ),
    ),
  );
}

export function evolutionV1(sheet: EvolutionSheet, frame: SheetFrame): ReactElement<DocumentProps> {
  return sheetDocument(
    frame,
    patientLine(sheet.patient),
    evaluations(sheet, frame),
    measurements(sheet, frame),
    methods(sheet, frame),
    bia(sheet, frame),
    h(
      View,
      { style: styles.section, wrap: false },
      h(
        Text,
        { style: styles.note },
        'Cada número lleva su método. El CMD95 es el del evaluador de la última medición, con su ETM vigente ese día.',
      ),
    ),
  );
}

export function evolutionTitles(sheet: EvolutionSheet): { title: string; subtitle: string } {
  const start = sheet.evaluations[0]?.measuredOn;
  const end = sheet.evaluations.at(-1)?.measuredOn;
  const count = sheet.evaluations.length;
  return {
    title: 'Evolución antropométrica',
    subtitle:
      start && end && count > 1
        ? `${String(count)} evaluaciones · del ${longDate(start)} al ${longDate(end)}`
        : end
          ? `1 evaluación · el ${longDate(end)}`
          : 'Sin evaluaciones',
  };
}
