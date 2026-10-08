import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type SettingEditor = 'ORGANIZATION' | 'PLATFORM';

export interface IntegerSetting {
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  /** Quién la edita. La gracia de RN-A02 es solo de plataforma: si no, la organización nunca vencería. */
  readonly editor: SettingEditor;
}

/** Ajustes de tenancy.organization_setting registrados con su rango, su valor por defecto y su editor. */
export const ORGANIZATION_SETTINGS = {
  'invitation.ttl_days': { min: 1, max: 30, defaultValue: 7, editor: 'ORGANIZATION' },
  'subscription.grace_days': { min: 0, max: 30, defaultValue: 7, editor: 'PLATFORM' },
} as const satisfies Record<string, IntegerSetting>;

export type SettingKey = keyof typeof ORGANIZATION_SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(ORGANIZATION_SETTINGS, key);
}

export const INVALID_SETTING = (key: string): DomainError =>
  domainError({ code: 'NC-TEN-030', message: `El valor del ajuste «${key}» no es válido.` });

export const SETTING_NOT_EDITABLE = domainError({
  code: 'NC-TEN-031',
  message: 'Este ajuste solo lo cambia la plataforma.',
});

/** Valida un valor contra su registro; devuelve el error o null. */
export function checkSetting(
  key: SettingKey,
  value: unknown,
  editor: SettingEditor,
): DomainError | null {
  const setting: IntegerSetting = ORGANIZATION_SETTINGS[key];
  if (setting.editor === 'PLATFORM' && editor !== 'PLATFORM') return SETTING_NOT_EDITABLE;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < setting.min ||
    value > setting.max
  ) {
    return INVALID_SETTING(key);
  }
  return null;
}

/** El valor guardado si es válido; si no, el valor por defecto. */
export function settingValue(key: SettingKey, stored: unknown): number {
  const setting: IntegerSetting = ORGANIZATION_SETTINGS[key];
  return typeof stored === 'number' &&
    Number.isInteger(stored) &&
    stored >= setting.min &&
    stored <= setting.max
    ? stored
    : setting.defaultValue;
}
