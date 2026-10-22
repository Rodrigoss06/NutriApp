import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type SettingEditor = 'ORGANIZATION' | 'PLATFORM';

export interface IntegerSetting {
  readonly kind: 'INTEGER';
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  /** Quién la edita. La gracia de RN-A02 es solo de plataforma: si no, la organización nunca vencería. */
  readonly editor: SettingEditor;
}

/** Un valor de una lista cerrada, sin valor por defecto: hasta que la organización lo fija, vale null. */
export interface ChoiceSetting {
  readonly kind: 'CHOICE';
  readonly values: readonly number[];
  readonly defaultValue: null;
  readonly editor: SettingEditor;
}

export type OrganizationSetting = IntegerSetting | ChoiceSetting;

/** Ajustes de tenancy.organization_setting registrados con su rango o sus opciones, su valor por defecto y su editor. */
export const ORGANIZATION_SETTINGS = {
  'invitation.ttl_days': {
    kind: 'INTEGER',
    min: 1,
    max: 30,
    defaultValue: 7,
    editor: 'ORGANIZATION',
  },
  /** ⚠️ N22: caducidad del enlace de acceso del paciente (RN-A06), aparte de la del staff. */
  'patient_invitation.ttl_days': {
    kind: 'INTEGER',
    min: 1,
    max: 30,
    defaultValue: 7,
    editor: 'ORGANIZATION',
  },
  'subscription.grace_days': {
    kind: 'INTEGER',
    min: 0,
    max: 30,
    defaultValue: 7,
    editor: 'PLATFORM',
  },
  /**
   * RN-D11: coeficiente de grupo de referencia de Lee (0 blanco o hispano, −2.0 asiático, +1.1 afroamericano). El
   * motor no tiene valor por defecto: sin él, Lee no se calcula. La ficha del paciente no guarda ese dato (Ley 29733).
   */
  'assessment.lee_reference_group_coefficient': {
    kind: 'CHOICE',
    values: [0, -2, 1.1],
    defaultValue: null,
    editor: 'ORGANIZATION',
  },
  /** RN-E10: rango aceptable de la adecuación, 90 a 110 % por defecto. Cada borde, de su lado del 100. */
  'nutrition.adequacy_min_pct': {
    kind: 'INTEGER',
    min: 50,
    max: 100,
    defaultValue: 90,
    editor: 'ORGANIZATION',
  },
  'nutrition.adequacy_max_pct': {
    kind: 'INTEGER',
    min: 100,
    max: 150,
    defaultValue: 110,
    editor: 'ORGANIZATION',
  },
} as const satisfies Record<string, OrganizationSetting>;

export type SettingKey = keyof typeof ORGANIZATION_SETTINGS;

/** El tipo del valor de un ajuste: número, o número o null si no tiene valor por defecto. */
export type SettingValue<K extends SettingKey> =
  (typeof ORGANIZATION_SETTINGS)[K]['defaultValue'] extends null ? number | null : number;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(ORGANIZATION_SETTINGS, key);
}

export const INVALID_SETTING = (key: string): DomainError =>
  domainError({ code: 'NC-TEN-030', message: `El valor del ajuste «${key}» no es válido.` });

export const SETTING_NOT_EDITABLE = domainError({
  code: 'NC-TEN-031',
  message: 'Este ajuste solo lo cambia la plataforma.',
});

function isValid(setting: OrganizationSetting, value: unknown): value is number {
  if (typeof value !== 'number') return false;
  return setting.kind === 'CHOICE'
    ? setting.values.includes(value)
    : Number.isInteger(value) && value >= setting.min && value <= setting.max;
}

/** Valida un valor contra su registro; devuelve el error o null. */
export function checkSetting(
  key: SettingKey,
  value: unknown,
  editor: SettingEditor,
): DomainError | null {
  const setting: OrganizationSetting = ORGANIZATION_SETTINGS[key];
  if (setting.editor === 'PLATFORM' && editor !== 'PLATFORM') return SETTING_NOT_EDITABLE;
  return isValid(setting, value) ? null : INVALID_SETTING(key);
}

/** El valor guardado si es válido; si no, el valor por defecto. */
export function settingValue<K extends SettingKey>(key: K, stored: unknown): SettingValue<K> {
  const setting: OrganizationSetting = ORGANIZATION_SETTINGS[key];
  return (isValid(setting, stored) ? stored : setting.defaultValue) as SettingValue<K>;
}
