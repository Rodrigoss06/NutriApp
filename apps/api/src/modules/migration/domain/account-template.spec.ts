import { describe, expect, it } from 'vitest';
import {
  parseEvaluationRow,
  parseMeasurementRow,
  parsePatientRow,
  parsePlanRow,
  type Cells,
  type RowResult,
} from './account-template.js';

const TODAY = '2026-11-14';

const patient = (cells: Partial<Record<string, string>> = {}): Cells => ({
  id_origen: 'NP-1',
  nombres: 'Zoila',
  apellidos: 'Prueba',
  sexo: 'F',
  fecha_nacimiento: '1990-05-12',
  tipo_documento: 'DNI',
  numero_documento: '70000001',
  telefono: '987000111',
  correo: 'zoila@demo.test',
  poblacion: '',
  activo: '',
  consentimiento_datos_salud: '2024-03-01',
  ...cells,
});

const messagesOf = (result: RowResult<unknown>): readonly string[] =>
  result.ok ? [] : result.messages;

describe('RF-40 · RN-I05 · pacientes.csv', () => {
  it('una fila completa: el documento, la población vacía como ADULTO (como el alta) y activo por defecto', () => {
    expect(parsePatientRow(2, patient(), TODAY)).toEqual({
      ok: true,
      value: {
        row: 2,
        externalId: 'NP-1',
        firstName: 'Zoila',
        lastName: 'Prueba',
        sex: 'F',
        birthDate: '1990-05-12',
        document: { type: 'DNI', number: '70000001' },
        phone: '987000111',
        email: 'zoila@demo.test',
        population: 'ADULT',
        active: true,
        healthDataConsentDate: '2024-03-01',
      },
    });
  });

  it('sin documento, teléfono, correo ni consentimiento; inactivo; población en español', () => {
    const parsed = parsePatientRow(
      3,
      patient({
        tipo_documento: '',
        numero_documento: '',
        telefono: '',
        correo: '',
        poblacion: 'ADULTO_MAYOR',
        activo: 'NO',
        consentimiento_datos_salud: '',
      }),
      TODAY,
    );
    expect(parsed.ok && parsed.value).toMatchObject({
      document: null,
      phone: null,
      email: null,
      population: 'OLDER_ADULT',
      active: false,
      healthDataConsentDate: null,
    });
  });

  it('cada columna mala dice cuál es y qué espera; la fila no entra', () => {
    expect(
      messagesOf(
        parsePatientRow(
          4,
          patient({
            id_origen: 'NP 1',
            nombres: '',
            apellidos: 'x'.repeat(81),
            sexo: 'X',
            fecha_nacimiento: '1990-02-30',
            correo: 'sin-arroba',
            poblacion: 'GIMNASTA',
            activo: 'TAL VEZ',
            telefono: '9'.repeat(31),
          }),
          TODAY,
        ),
      ),
    ).toEqual([
      'id_origen: de 1 a 64 letras sin tildes, números, punto, guion o guion bajo.',
      'nombres: es obligatorio.',
      'apellidos: hasta 80 caracteres.',
      'sexo: F o M.',
      'fecha_nacimiento: una fecha AAAA-MM-DD.',
      'telefono: hasta 30 caracteres.',
      'correo: un correo válido.',
      'poblacion: ADULTO, DEPORTISTA, NINO, ADOLESCENTE, OBESIDAD, ADULTO_MAYOR o vacía (ADULTO).',
      'activo: SI o NO.',
    ]);
  });

  it('el documento va con su tipo y su número, y nunca es el id_origen', () => {
    expect(messagesOf(parsePatientRow(2, patient({ tipo_documento: '' }), TODAY))).toEqual([
      'tipo_documento: falta el tipo del documento.',
    ]);
    expect(messagesOf(parsePatientRow(2, patient({ numero_documento: '' }), TODAY))).toEqual([
      'numero_documento: falta el número del documento.',
    ]);
    expect(messagesOf(parsePatientRow(2, patient({ tipo_documento: 'RUC' }), TODAY))).toEqual([
      'tipo_documento: DNI, CE, PASAPORTE u OTRO.',
    ]);
    expect(
      messagesOf(parsePatientRow(2, patient({ numero_documento: '1'.repeat(21) }), TODAY)),
    ).toEqual(['numero_documento: hasta 20 caracteres.']);
    expect(messagesOf(parsePatientRow(2, patient({ id_origen: '70000001' }), TODAY))).toEqual([
      'id_origen: no puede ser el número de documento: usa el id del sistema anterior.',
    ]);
  });

  it('RN-B01: las fechas no pasan de hoy, el consentimiento no es anterior al nacimiento y OBESIDAD necesita consentimiento', () => {
    expect(
      messagesOf(
        parsePatientRow(
          2,
          patient({ fecha_nacimiento: '2027-01-01', consentimiento_datos_salud: '' }),
          TODAY,
        ),
      ),
    ).toEqual(['fecha_nacimiento: no puede ser posterior a hoy.']);
    expect(
      messagesOf(parsePatientRow(2, patient({ consentimiento_datos_salud: '1989-01-01' }), TODAY)),
    ).toEqual(['consentimiento_datos_salud: no puede ser anterior a la fecha de nacimiento.']);
    expect(
      messagesOf(
        parsePatientRow(
          2,
          patient({ poblacion: 'OBESIDAD', consentimiento_datos_salud: '' }),
          TODAY,
        ),
      ),
    ).toEqual([
      'poblacion: OBESIDAD es un dato de salud: necesita la fecha del consentimiento (RN-B01).',
    ]);
    const obesity = parsePatientRow(2, patient({ poblacion: 'OBESIDAD' }), TODAY);
    expect(obesity.ok && obesity.value.population).toBe('OBESITY');
  });
});

describe('RF-40 · evaluaciones.csv', () => {
  const evaluation = (cells: Partial<Record<string, string>> = {}): Cells => ({
    id_origen: 'EV-1',
    id_paciente: 'NP-1',
    fecha: '2025-02-10',
    nivel: 'BASICO',
    en_ayunas: '',
    actividad_intensa_24h: '',
    ...cells,
  });

  it('sin hora, las 09:00; las condiciones vacías son No, como en el formulario de la app', () => {
    expect(parseEvaluationRow(2, evaluation(), TODAY)).toEqual({
      ok: true,
      value: {
        row: 2,
        externalId: 'EV-1',
        patientExternalId: 'NP-1',
        localDate: '2025-02-10',
        minutesOfDay: 540,
        level: 'BASIC',
        fasting: false,
        intenseActivityLast24h: false,
      },
    });
  });

  it('con hora, en ayunas y con actividad intensa', () => {
    const parsed = parseEvaluationRow(
      2,
      evaluation({
        fecha: '2025-02-10 08:30',
        nivel: 'ISAK2',
        en_ayunas: 'SI',
        actividad_intensa_24h: 'SI',
      }),
      TODAY,
    );
    expect(parsed.ok && parsed.value).toMatchObject({
      minutesOfDay: 510,
      level: 'ISAK2',
      fasting: true,
      intenseActivityLast24h: true,
    });
  });

  it('la fecha, la hora y el nivel inválidos', () => {
    expect(messagesOf(parseEvaluationRow(2, evaluation({ fecha: '10/02/2025' }), TODAY))).toEqual([
      'fecha: una fecha AAAA-MM-DD, con la hora HH:MM opcional (2025-03-14 08:30).',
    ]);
    expect(
      messagesOf(parseEvaluationRow(2, evaluation({ fecha: '2025-02-10 24:10' }), TODAY)),
    ).toEqual(['fecha: la hora va de 00:00 a 23:59.']);
    expect(messagesOf(parseEvaluationRow(2, evaluation({ fecha: '2027-02-10' }), TODAY))).toEqual([
      'fecha: no puede ser posterior a hoy.',
    ]);
    expect(messagesOf(parseEvaluationRow(2, evaluation({ nivel: 'ISAK3' }), TODAY))).toEqual([
      'nivel: BASICO, ISAK1 o ISAK2.',
    ]);
  });
});

describe('RF-40 · tomas.csv', () => {
  const measurement = (cells: Partial<Record<string, string>> = {}): Cells => ({
    id_evaluacion: 'EV-1',
    sitio: 'SKF_TRICEPS',
    toma_1: '12.4',
    toma_2: '12.6',
    toma_3: '',
    lado: '',
    ...cells,
  });

  it('las tomas en orden y el lado derecho por defecto', () => {
    expect(parseMeasurementRow(2, measurement())).toEqual({
      ok: true,
      value: {
        row: 2,
        evaluationExternalId: 'EV-1',
        siteCode: 'SKF_TRICEPS',
        attempts: [12.4, 12.6],
        side: 'RIGHT',
      },
    });
    const left = parseMeasurementRow(2, measurement({ toma_3: '12.5', lado: 'IZQUIERDO' }));
    expect(left.ok && left.value).toMatchObject({ attempts: [12.4, 12.6, 12.5], side: 'LEFT' });
  });

  it('RN-C02: el decimal va con punto; las dos primeras tomas son obligatorias y la tercera pide la segunda', () => {
    expect(messagesOf(parseMeasurementRow(2, measurement({ toma_1: '12,4' })))).toEqual([
      'toma_1: el decimal va con punto, sin separador de miles (72.5).',
    ]);
    expect(messagesOf(parseMeasurementRow(2, measurement({ toma_1: '' })))).toEqual([
      'toma_1: es obligatoria.',
    ]);
    expect(messagesOf(parseMeasurementRow(2, measurement({ toma_2: '', toma_3: '12' })))).toEqual([
      'toma_2: es obligatoria: cada sitio va con dos tomas (RN-C02).',
      'toma_3: va solo si hay toma_2.',
    ]);
    expect(
      messagesOf(
        parseMeasurementRow(2, measurement({ sitio: 'triceps', toma_2: 'doce', lado: 'AMBOS' })),
      ),
    ).toEqual([
      'sitio: el código del sitio, como SKF_TRICEPS.',
      'toma_2: un número.',
      'lado: DERECHO, IZQUIERDO o vacío (DERECHO).',
    ]);
    expect(messagesOf(parseMeasurementRow(2, measurement({ toma_1: '1001' })))).toEqual([
      'toma_1: entre 0 y 1000.',
    ]);
  });
});

describe('RF-40 · planes.csv', () => {
  const plan = (cells: Partial<Record<string, string>> = {}): Cells => ({
    id_origen: 'PL-1',
    id_paciente: 'NP-1',
    desde: '2025-02-10',
    hasta: '2025-03-10',
    kcal: '1850',
    proteina_g: '110',
    grasa_g: '60',
    carbohidratos_g: '215.5',
    agua_ml: '2500',
    indicaciones: 'Cenar temprano',
    ...cells,
  });

  it('las metas y las indicaciones tal como venían', () => {
    expect(parsePlanRow(2, plan(), TODAY)).toEqual({
      ok: true,
      value: {
        row: 2,
        externalId: 'PL-1',
        patientExternalId: 'NP-1',
        validFrom: '2025-02-10',
        validTo: '2025-03-10',
        targetKcal: 1850,
        targetProteinG: 110,
        targetFatG: 60,
        targetChoG: 215.5,
        hydrationTargetMl: 2500,
        instructions: 'Cenar temprano',
      },
    });
  });

  it('cada meta puede faltar, pero no todas a la vez sin indicaciones', () => {
    const onlyText = parsePlanRow(
      2,
      plan({ hasta: '', kcal: '', proteina_g: '', grasa_g: '', carbohidratos_g: '', agua_ml: '' }),
      TODAY,
    );
    expect(onlyText.ok && onlyText.value).toMatchObject({ validTo: null, targetKcal: null });
    expect(
      messagesOf(
        parsePlanRow(
          2,
          plan({
            kcal: '',
            proteina_g: '',
            grasa_g: '',
            carbohidratos_g: '',
            agua_ml: '',
            indicaciones: '',
          }),
          TODAY,
        ),
      ),
    ).toEqual(['kcal: el plan necesita al menos una meta o sus indicaciones.']);
  });

  it('las fechas en orden, el agua entera y cada meta en su rango', () => {
    expect(messagesOf(parsePlanRow(2, plan({ hasta: '2025-01-01' }), TODAY))).toEqual([
      'hasta: no puede ser anterior a desde.',
    ]);
    expect(messagesOf(parsePlanRow(2, plan({ hasta: '2025-13-01' }), TODAY))).toEqual([
      'hasta: una fecha AAAA-MM-DD.',
    ]);
    expect(
      messagesOf(
        parsePlanRow(
          2,
          plan({ agua_ml: '2500.5', kcal: '0', indicaciones: 'x'.repeat(4001) }),
          TODAY,
        ),
      ),
    ).toEqual([
      'kcal: entre 1 y 15000.',
      'agua_ml: un número entero.',
      'indicaciones: hasta 4000 caracteres.',
    ]);
  });
});
