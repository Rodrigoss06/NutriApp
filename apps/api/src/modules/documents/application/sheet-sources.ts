import { Inject, Injectable } from '@nestjs/common';
import { canonicalJson, sha256Hex } from '@nutricoach/engine';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import { AssessmentApi } from '../../assessment/index.js';
import { ClinicalApi } from '../../clinical/index.js';
import { NutritionApi } from '../../nutrition/index.js';
import { TenancyApi } from '../../tenancy/index.js';
import { TrainingApi } from '../../training/index.js';
import {
  planSheetKind,
  resolveSheetBrand,
  type SheetBrand,
  type SheetKind,
  type SourceType,
} from '../domain/sheet.js';
import type { DocumentKey } from './ports/documents.ports.js';
import { anthropometrySheet } from './sheets/anthropometry-sheet.js';
import { menuSheet } from './sheets/menu-sheet.js';
import { exchangeDietSheet, sheetPatient, type SheetContent } from './sheets/sheet-content.js';
import { trainingSheet } from './sheets/training-sheet.js';

/** El origen de una ficha (RN-H02). */
export interface SheetSource {
  readonly type: SourceType;
  readonly id: string;
}

/** Una ficha lista para dibujar o para buscar si ya existe: su contenido, su marca y quién la firma. */
export interface PreparedSheet {
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly kind: SheetKind;
  readonly source: SheetSource;
  readonly content: SheetContent;
  readonly brand: SheetBrand;
  /** La fecha del origen (publicación o cierre): la del PDF, para que no dependa del reloj. */
  readonly issuedAt: Date;
  /** Quien publicó el plan o el programa, o hizo la evaluación: su marca propia manda (RN-H03). */
  readonly authorUserId: UserId;
}

export type SheetPreparation =
  | { readonly ok: true; readonly sheet: PreparedSheet }
  | {
      readonly ok: false;
      /** NOT_READY: una evaluación cerrada cuyos resultados el worker todavía calcula. */
      readonly reason: 'NOT_FOUND' | 'NOT_PUBLISHED' | 'NOT_READY';
    };

/** Lo que identifica el PDF de una ficha preparada con una versión de su plantilla (RN-H02). */
export function documentKey(sheet: PreparedSheet, templateVersion: string): DocumentKey {
  return {
    kind: sheet.kind,
    sourceType: sheet.source.type,
    sourceId: sheet.source.id,
    sourceHash: sha256Hex(canonicalJson(sheet.content)),
    templateVersion,
    brandingHash: sha256Hex(canonicalJson(sheet.brand)),
  };
}

/**
 * Arma una ficha desde su origen con las API públicas de assessment, nutrition, training, clinical y tenancy (02 §3), en la
 * transacción de quien llama: en la API, con la RLS del profesional (RN-A05); en el worker, con el contexto SYSTEM.
 */
@Injectable()
export class SheetSources {
  constructor(
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(NutritionApi) private readonly nutrition: NutritionApi,
    @Inject(TrainingApi) private readonly training: TrainingApi,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  async prepare(organizationId: OrganizationId, source: SheetSource): Promise<SheetPreparation> {
    switch (source.type) {
      case 'NUTRITION_PLAN':
        return this.#plan(organizationId, source);
      case 'EVALUATION':
        return this.#evaluation(organizationId, source);
      case 'TRAINING_PROGRAM':
        return this.#program(organizationId, source);
    }
  }

  /**
   * La rutina publicada (RN-H01), desde su snapshot (RN-F12). La firma quien la publicó (RN-H03); la edad es la del primer día del
   * programa, y la fecha del PDF, la de la publicación (RN-H02).
   */
  async #program(organizationId: OrganizationId, source: SheetSource): Promise<SheetPreparation> {
    const snapshot = await this.training.publishedProgram(source.id);
    if (!snapshot) {
      const draft = (await this.training.programStatus(source.id)) === 'DRAFT';
      return { ok: false, reason: draft ? 'NOT_PUBLISHED' : 'NOT_FOUND' };
    }
    const card = await this.clinical.patientCard(snapshot.patientId);
    if (!card) return { ok: false, reason: 'NOT_FOUND' };
    const author = snapshot.publishedBy as UserId;
    const branding = await this.tenancy.sheetBranding(organizationId, { userId: author });
    if (!branding) return { ok: false, reason: 'NOT_FOUND' };
    return {
      ok: true,
      sheet: {
        organizationId,
        patientId: snapshot.patientId,
        kind: 'TRAINING',
        source,
        content: trainingSheet(snapshot, sheetPatient(card, snapshot.startDate)),
        brand: resolveSheetBrand(branding.member, branding.organization, branding.organizationName),
        issuedAt: new Date(snapshot.publishedAt),
        authorUserId: author,
      },
    };
  }

  async #plan(organizationId: OrganizationId, source: SheetSource): Promise<SheetPreparation> {
    const plan = await this.nutrition.publishedPlan(source.id);
    if (!plan) {
      const draft = (await this.nutrition.planStatus(source.id)) === 'DRAFT';
      return { ok: false, reason: draft ? 'NOT_PUBLISHED' : 'NOT_FOUND' };
    }
    const { snapshot } = plan;
    const card = await this.clinical.patientCard(plan.patientId);
    if (!card) return { ok: false, reason: 'NOT_FOUND' };
    const author = snapshot.publishedBy as UserId;
    const branding = await this.tenancy.sheetBranding(organizationId, { userId: author });
    if (!branding) return { ok: false, reason: 'NOT_FOUND' };
    const patient = sheetPatient(card, snapshot.validFrom);
    const energy = await this.nutrition.energySummary(snapshot.energyPrescriptionId);
    return {
      ok: true,
      sheet: {
        organizationId,
        patientId: plan.patientId,
        kind: planSheetKind(snapshot.modality),
        source,
        content:
          snapshot.modality === 'EXCHANGES'
            ? exchangeDietSheet(snapshot, patient, energy)
            : menuSheet(snapshot, patient, energy),
        brand: resolveSheetBrand(branding.member, branding.organization, branding.organizationName),
        issuedAt: new Date(snapshot.publishedAt),
        authorUserId: author,
      },
    };
  }

  async #evaluation(
    organizationId: OrganizationId,
    source: SheetSource,
  ): Promise<SheetPreparation> {
    const data = await this.assessment.evaluationSheet(source.id);
    if (!data) return { ok: false, reason: 'NOT_FOUND' };
    const { evaluation } = data;
    if (evaluation.status === 'DRAFT' || !evaluation.closedAt) {
      return { ok: false, reason: 'NOT_PUBLISHED' };
    }
    if (data.results.status === 'PENDING') return { ok: false, reason: 'NOT_READY' };
    const card = await this.clinical.patientCard(evaluation.patientId);
    if (!card) return { ok: false, reason: 'NOT_FOUND' };
    const branding = await this.tenancy.sheetBranding(organizationId, {
      memberId: evaluation.evaluatorMemberId,
    });
    if (!branding) return { ok: false, reason: 'NOT_FOUND' };
    return {
      ok: true,
      sheet: {
        organizationId,
        patientId: evaluation.patientId,
        kind: 'ANTHROPOMETRY',
        source,
        content: anthropometrySheet(data, sheetPatient(card, evaluation.localDate)),
        brand: resolveSheetBrand(branding.member, branding.organization, branding.organizationName),
        issuedAt: evaluation.closedAt,
        authorUserId: evaluation.createdBy as UserId,
      },
    };
  }
}
