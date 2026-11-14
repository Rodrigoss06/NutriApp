import { describe, expect, it } from 'vitest';
import { archiveEntries, filePath, toCsv } from './patient-export-archive.js';

const decode = (entry: { content: Uint8Array } | undefined) =>
  new TextDecoder().decode(entry?.content ?? new Uint8Array());
const AT = new Date('2026-11-13T15:00:00Z');

describe('RN-B04 · el ZIP de la exportación', () => {
  it('el CSV sigue RFC 4180, con BOM, las columnas de todas las filas y JSON en las celdas', () => {
    const csv = toCsv([
      { id: 'a', note: 'Dolor, "leve"\nal subir', kcal: 1835.5, tags: ['x'] },
      { id: 'b', note: null, extra: true },
    ]);
    expect(csv).toBe(
      '﻿id,note,kcal,tags,extra\r\n' +
        'a,"Dolor, ""leve""\nal subir",1835.5,"[""x""]",\r\n' +
        'b,,,,true\r\n',
    );
    expect(toCsv([])).toBeNull();
  });

  it('un texto que empieza como fórmula lleva un apóstrofo; un número negativo, no', () => {
    expect(toCsv([{ a: '=HYPERLINK("x")', b: '-dolor', c: -1.5 }])).toBe(
      '﻿a,b,c\r\n"\'=HYPERLINK(""x"")",\'-dolor,-1.5\r\n',
    );
  });

  it('cada archivo va en la carpeta de su propósito, con el día y el id que nombran las tablas', () => {
    const base = { id: 'f1', mimeType: 'application/pdf', createdAt: AT };
    expect(filePath({ ...base, purpose: 'GENERATED_DOCUMENT' })).toBe('fichas/2026-11-13-f1.pdf');
    expect(filePath({ ...base, purpose: 'PROGRESS_PHOTO', mimeType: 'image/jpeg' })).toBe(
      'fotos-de-progreso/2026-11-13-f1.jpg',
    );
    expect(filePath({ ...base, purpose: 'RECORD_DOCUMENT', mimeType: 'image/png' })).toBe(
      'expediente/2026-11-13-f1.png',
    );
    expect(filePath({ ...base, purpose: 'NUEVO', mimeType: 'text/plain' })).toBe(
      'otros/2026-11-13-f1.bin',
    );
  });

  it('trae el LEEME, todas las tablas en datos.json, un CSV por tabla con filas, el índice y los archivos sin comprimir', () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 1]);
    const entries = archiveEntries({
      exportedAt: AT,
      patientId: 'p1',
      patientCode: 'P-0007',
      authorNotes: false,
      tables: [
        { table: 'clinical.patient', rows: [{ id: 'p1', first_name: 'Luis' }] },
        { table: 'scheduling.appointment', rows: [] },
      ],
      files: [
        {
          id: 'f1',
          purpose: 'PROGRESS_PHOTO',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sha256: new Uint8Array([0xab, 0x01]),
          createdAt: AT,
          content: photo,
        },
      ],
    });
    expect(entries.map((e) => [e.path, e.compress])).toEqual([
      ['LEEME.txt', true],
      ['datos.json', true],
      ['csv/clinical.patient.csv', true],
      ['archivos.csv', true],
      ['fotos-de-progreso/2026-11-13-f1.jpg', false],
    ]);
    const data = JSON.parse(decode(entries[1])) as { tables: Record<string, unknown[]> };
    expect(data.tables).toEqual({
      'clinical.patient': [{ id: 'p1', first_name: 'Luis' }],
      'scheduling.appointment': [],
    });
    expect(decode(entries[3])).toContain('fotos-de-progreso/2026-11-13-f1.jpg,f1,PROGRESS_PHOTO');
    expect(decode(entries[3])).toContain(',ab01,');
    expect(entries[4]?.content).toBe(photo);
    const readme = decode(entries[0]);
    expect(readme).toContain('P-0007');
    expect(readme).toContain('«Solo el autor» no van');
  });

  it('si la pidió un miembro del equipo, el LEEME dice que van sus notas «Solo el autor»', () => {
    const [readme] = archiveEntries({
      exportedAt: AT,
      patientId: 'p1',
      patientCode: 'P-0007',
      authorNotes: true,
      tables: [],
      files: [],
    });
    expect(decode(readme)).toContain('van solo si las escribió quien pidió esta exportación');
  });
});
