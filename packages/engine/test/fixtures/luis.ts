import { cm, kg, mm } from '../../src/units.js';

/** Paciente ficticio de la guía de dominio y de los casos dorados de Notion 03. */
export const LUIS = {
  sex: 'M',
  ageYears: 28,
  weightKg: kg(80),
  heightCm: cm(175),
  sittingHeightCm: cm(91),
  skinfoldsMm: {
    triceps: mm(12),
    subscapular: mm(16),
    biceps: mm(6),
    iliacCrest: mm(22),
    supraspinale: mm(14),
    abdominal: mm(25),
    frontThigh: mm(18),
    medialCalf: mm(10),
  },
  girthsCm: {
    head: cm(57),
    armRelaxed: cm(33),
    forearm: cm(28),
    chest: cm(100),
    waist: cm(86),
    hip: cm(98),
    thigh: cm(55),
    calf: cm(37),
  },
  breadthsCm: {
    humerus: cm(7.0),
    wrist: cm(5.8),
    femur: cm(9.8),
    biacromial: cm(40),
    biiliocristal: cm(28.5),
    transverseChest: cm(30),
    apChestDepth: cm(20),
  },
} as const;

/** Pares de tomas de los pliegues de Luis (examples.ts). */
export const LUIS_SKINFOLD_PAIRS: [number, number][] = [
  [12.0, 12.4],
  [16.0, 15.6],
  [25.0, 26.0],
  [18.0, 17.6],
  [10.0, 10.2],
  [14.0, 14.4],
];
