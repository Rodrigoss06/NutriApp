import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { AssessmentApi, type CompositionBasis } from '../../../assessment/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import {
  EnergyPrescriptionCommands,
  type CalculatedPrescription,
  type PrescriptionInput,
} from '../commands/energy-prescription.commands.js';
import { bodyCompositionOf } from '../energy-basis.js';
import { rmrOptions } from '../energy-calculation.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  type EnergyPrescriptionRecord,
  type EnergyPrescriptionStore,
} from '../ports/nutrition.ports.js';

export interface EnergyBasisView {
  readonly basis: CompositionBasis;
  readonly rmrOptions: ReturnType<typeof rmrOptions>;
  readonly preferredRmrMethodCode: string | null;
}

/**
 * Lecturas de energía (RF-17): la base de la prescripción con las cinco TMR (RN-E01), la vista previa sin guardar y
 * las prescripciones guardadas. Leen datos de salud: cada lectura deja un READ (RN-B03).
 */
@Injectable()
export class EnergyPrescriptionQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(EnergyPrescriptionCommands) private readonly commands: EnergyPrescriptionCommands,
  ) {}

  /** null si no se ve al paciente; 'NO_EVALUATION' si no tiene una evaluación cerrada con peso y talla. */
  async basis(
    context: SecurityContext,
    patientId: string,
    evaluationId: string | null,
  ): Promise<EnergyBasisView | 'NO_EVALUATION' | null> {
    const view = await this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return null;
      const basis = await this.assessment.compositionBasis(patientId, evaluationId);
      if (!basis) return 'NO_EVALUATION' as const;
      return {
        basis,
        rmrOptions: rmrOptions(bodyCompositionOf(basis)),
        preferredRmrMethodCode: await this.assessment.preferredRmrMethod(
          patientId,
          patient.population,
        ),
      };
    });
    if (view === null) return null;
    await this.#audited(context, 'nutrition.energy_basis', patientId, patientId);
    return view;
  }

  /** Calcula como si se guardara, sin guardar; null si no se ve al paciente. */
  async preview(
    context: SecurityContext,
    patientId: string,
    input: PrescriptionInput,
  ): Promise<Result<CalculatedPrescription, DomainError> | null> {
    const result = await this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      return patient ? this.commands.calculate(context, patient, input) : null;
    });
    if (result === null) return null;
    await this.#audited(context, 'nutrition.energy_basis', patientId, patientId);
    return result;
  }

  async get(context: SecurityContext, id: string): Promise<EnergyPrescriptionRecord | null> {
    const record = await this.uow.query(context, () => this.prescriptions.find(id));
    if (!record) return null;
    await this.#audited(context, 'nutrition.energy_prescription', id, record.patientId);
    return record;
  }

  async list(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly EnergyPrescriptionRecord[] | null> {
    const records = await this.uow.query(context, async () =>
      (await this.clinical.patientRef(patientId))
        ? this.prescriptions.listByPatient(patientId)
        : null,
    );
    if (!records) return null;
    await this.#audited(context, 'nutrition.energy_prescription', patientId, patientId);
    return records;
  }

  async #audited(
    context: SecurityContext,
    resourceType: string,
    resourceId: string,
    patientId: string,
  ): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType,
      resourceId: resourceId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}
