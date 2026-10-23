// Sistema de diseño (02 §11). El gráfico se importa aparte: `@nutricoach/ui/chart`.
export { BrandStyle, type BrandStyleProps } from './brand/brand-style';
export {
  brandCss,
  brandSchema,
  brandTokens,
  brandVariables,
  contrastRatio,
  DARKEST_SURFACE,
  DEFAULT_BRAND,
  parseBrand,
  type Brand,
  type BrandColorTokens,
} from './brand/brand-tokens';
export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  CompositionBar,
  type CompositionBarProps,
  type CompositionSegment,
} from './components/composition-bar';
export {
  ContourBackground,
  contourLayers,
  type ContourBackgroundProps,
} from './components/contour-background';
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog';
export { DataTable, type DataTableColumn, type DataTableProps } from './components/data-table';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { describedBy, FieldMessages, Input, Label } from './components/field';
export { IndicatorCard, type IndicatorCardProps } from './components/indicator-card';
export { MethodBadge, type MethodBadgeProps } from './components/method-badge';
export {
  Notice,
  StatusBadge,
  type NoticeProps,
  type StatusBadgeProps,
  type Tone,
} from './components/notice';
export { NumberField, type MeasureUnit, type NumberFieldProps } from './components/number-field';
export {
  ReferenceRuler,
  rulerLayout,
  type ReferenceRulerProps,
  type RulerBand,
  type RulerLayout,
  type RulerTone,
} from './components/reference-ruler';
export { Select, type SelectOption, type SelectProps } from './components/select';
export { Steps, type Step, type StepsProps } from './components/steps';
export { formatNumber, NUMBER_KINDS, parseDecimal, type NumberKind } from './format/format-number';
export { cn } from './lib/cn';
export { enterStyle } from './lib/motion';
