import { cm, kg, mm, type MethodCode, type Population, type Sex } from '@nutricoach/engine';

/** Lo que las ecuaciones necesitan del paciente al medir (patient_snapshot). */
export interface CalculationSubject {
  readonly sex: Sex;
  readonly ageYears: number;
  readonly population: Population;
}

export interface CalculationExtras {
  /** Masa grasa del método principal de % de grasa, para 4 componentes (De Rose y Guimarães). */
  readonly fat?: { readonly fatMassKg: number; readonly methodCode: MethodCode };
  /** RN-D11: coeficiente de grupo de referencia de Lee; null si nadie lo fijó (Lee no se calcula). */
  readonly referenceGroupCoefficient: number | null;
}

type Values = ReadonlyMap<string, number>;

/** El consolidado de un sitio; el plan ya verificó que se midió (RN-D04). */
const at = (values: Values, site: string): number => {
  const value = values.get(site);
  if (value === undefined) throw new Error(`Falta el consolidado de ${site}.`);
  return value;
};

/**
 * Insumos de cada método desde los consolidados de la evaluación (RN-C03), con unidades con marca. Lo que no es un
 * sitio sale del snapshot del paciente al medir y de la organización. Quedan guardados con su hash (RN-D01).
 */
export function inputsFor(
  methodCode: MethodCode,
  values: Values,
  subject: CalculationSubject,
  extras: CalculationExtras,
): Record<string, unknown> {
  const v = (site: string) => at(values, site);
  const weightKg = () => kg(v('BASIC_WEIGHT'));
  const heightCm = () => cm(v('BASIC_HEIGHT'));
  const fatSubject = () => ({
    sex: subject.sex,
    ageYears: subject.ageYears,
    population: subject.population,
    weightKg: weightKg(),
  });
  switch (methodCode) {
    case 'BMI':
      return { weightKg: weightKg(), heightCm: heightCm() };
    case 'WAIST_HEIGHT':
      return { waistCm: cm(v('GIRTH_WAIST')), heightCm: heightCm() };
    case 'WAIST_HIP':
      return { waistCm: cm(v('GIRTH_WAIST')), hipCm: cm(v('GIRTH_HIP')) };
    case 'FAT_DW1974_SIRI1961':
      return {
        ...fatSubject(),
        skinfoldsMm: {
          triceps: mm(v('SKF_TRICEPS')),
          biceps: mm(v('SKF_BICEPS')),
          subscapular: mm(v('SKF_SUBSCAPULAR')),
          iliacCrest: mm(v('SKF_ILIAC_CREST')),
        },
      };
    case 'FAT_JP1978_7':
      return {
        ...fatSubject(),
        skinfoldsMm: {
          chest: mm(v('SKF_CHEST')),
          midaxillary: mm(v('SKF_MIDAXILLARY')),
          triceps: mm(v('SKF_TRICEPS')),
          subscapular: mm(v('SKF_SUBSCAPULAR')),
          abdominal: mm(v('SKF_ABDOMINAL')),
          suprailiac: mm(v('SKF_SUPRAILIAC')),
          frontThigh: mm(v('SKF_FRONT_THIGH')),
        },
      };
    case 'FAT_FAULKNER1968':
      return {
        ...fatSubject(),
        skinfoldsMm: {
          triceps: mm(v('SKF_TRICEPS')),
          subscapular: mm(v('SKF_SUBSCAPULAR')),
          supraspinale: mm(v('SKF_SUPRASPINALE')),
          abdominal: mm(v('SKF_ABDOMINAL')),
        },
      };
    case 'FAT_YUHASZ1974':
      return {
        ...fatSubject(),
        skinfoldsMm: sixSkinfolds(v),
      };
    case 'COMP4_DEROSE_GUIMARAES': {
      if (!extras.fat)
        throw new Error('4 componentes necesita la masa grasa del método principal.');
      return {
        sex: subject.sex,
        weightKg: weightKg(),
        heightCm: heightCm(),
        wristBreadthCm: cm(v('BREADTH_WRIST')),
        femurBreadthCm: cm(v('BREADTH_FEMUR')),
        fatMassKg: kg(extras.fat.fatMassKg),
        fatMethodCode: extras.fat.methodCode,
      };
    }
    case 'MUSCLE_LEE2000':
      return {
        sex: subject.sex,
        ageYears: subject.ageYears,
        weightKg: weightKg(),
        heightCm: heightCm(),
        // Sin coeficiente, el motor responde el ERROR de RN-D11 y Lee no se calcula.
        referenceGroupCoefficient: extras.referenceGroupCoefficient ?? Number.NaN,
        girthsCm: {
          armRelaxed: cm(v('GIRTH_ARM_RELAXED')),
          thigh: cm(v('GIRTH_THIGH')),
          calf: cm(v('GIRTH_CALF')),
        },
        skinfoldsMm: {
          triceps: mm(v('SKF_TRICEPS')),
          frontThigh: mm(v('SKF_FRONT_THIGH')),
          medialCalf: mm(v('SKF_MEDIAL_CALF')),
        },
      };
    case 'COMP5_KERR1988':
      return {
        sex: subject.sex,
        ageYears: subject.ageYears,
        weightKg: weightKg(),
        heightCm: heightCm(),
        sittingHeightCm: cm(v('BASIC_SITTING_HEIGHT')),
        skinfoldsMm: sixSkinfolds(v),
        girthsCm: {
          head: cm(v('GIRTH_HEAD')),
          armRelaxed: cm(v('GIRTH_ARM_RELAXED')),
          forearm: cm(v('GIRTH_FOREARM')),
          chest: cm(v('GIRTH_CHEST')),
          waist: cm(v('GIRTH_WAIST')),
          thigh: cm(v('GIRTH_THIGH')),
          calf: cm(v('GIRTH_CALF')),
        },
        breadthsCm: {
          biacromial: cm(v('BREADTH_BIACROMIAL')),
          biiliocristal: cm(v('BREADTH_BIILIOCRISTAL')),
          humerus: cm(v('BREADTH_HUMERUS')),
          femur: cm(v('BREADTH_FEMUR')),
          transverseChest: cm(v('BREADTH_TRANSVERSE_CHEST')),
          apChestDepth: cm(v('BREADTH_AP_CHEST')),
        },
      };
    case 'CORMIC_INDEX':
    case 'MANOUVRIER_INDEX':
      return { heightCm: heightCm(), sittingHeightCm: cm(v('BASIC_SITTING_HEIGHT')) };
    case 'ACROMIOILIAC_INDEX':
      return {
        biiliocristalCm: cm(v('BREADTH_BIILIOCRISTAL')),
        biacromialCm: cm(v('BREADTH_BIACROMIAL')),
      };
    default:
      throw new Error(`${methodCode} no es un método de composición de assessment.`);
  }
}

function sixSkinfolds(v: (site: string) => number) {
  return {
    triceps: mm(v('SKF_TRICEPS')),
    subscapular: mm(v('SKF_SUBSCAPULAR')),
    supraspinale: mm(v('SKF_SUPRASPINALE')),
    abdominal: mm(v('SKF_ABDOMINAL')),
    frontThigh: mm(v('SKF_FRONT_THIGH')),
    medialCalf: mm(v('SKF_MEDIAL_CALF')),
  };
}
