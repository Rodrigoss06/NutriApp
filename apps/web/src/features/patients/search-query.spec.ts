import { describe, expect, it } from 'vitest';
import { patientQuery } from './search-query';

describe('RF-08 · el buscador decide entre documento y nombre', () => {
  it('con dígitos busca el documento exacto; sin dígitos, el nombre', () => {
    expect(patientQuery(' 4567 8912 ')).toEqual({ documentNumber: '4567 8912' });
    expect(patientQuery('AB12345')).toEqual({ documentNumber: 'AB12345' });
    expect(patientQuery('josé quispe')).toEqual({ q: 'josé quispe' });
    expect(patientQuery('   ')).toBeNull();
  });
});
