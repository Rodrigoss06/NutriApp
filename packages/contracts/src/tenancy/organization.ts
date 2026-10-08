import { z } from 'zod';
import {
  emailSchema,
  MEMBER_ROLES,
  passwordInputSchema,
  secretTokenSchema,
} from '../iam/access.js';

const isoDate = z.iso.date();
export const PROFESSIONS = ['NUTRITIONIST', 'TRAINER', 'BOTH', 'OTHER'] as const;
export const ORGANIZATION_STATUSES = ['ACTIVE', 'READ_ONLY', 'SUSPENDED', 'CLOSED'] as const;

export const organizationResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  timezone: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  patientLabel: z.string(),
  patientVisibility: z.enum(['CARE_TEAM', 'ORGANIZATION']),
  version: z.number().int(),
});
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

/** Editar la organización (RF-02). La versión va en If-Match (06 §5). */
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    legalName: z.string().trim().max(200).nullable(),
    taxId: z
      .string()
      .trim()
      .regex(/^\d{11}$/, 'El RUC tiene 11 dígitos.')
      .nullable(),
    timezone: z.string().trim().min(3).max(64),
    patientLabel: z.string().trim().min(3).max(30),
    patientVisibility: z.enum(['CARE_TEAM', 'ORGANIZATION']),
  })
  .partial();
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string().nullable(),
  role: z.enum(MEMBER_ROLES),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  profession: z.enum(PROFESSIONS).nullable(),
});
export type MemberResponse = z.infer<typeof memberSchema>;
export const memberListResponseSchema = z.object({ members: z.array(memberSchema) });
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(MEMBER_ROLES),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    profession: z.enum(PROFESSIONS).nullable(),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, 'Indica qué cambia.');
export type UpdateMember = z.infer<typeof updateMemberSchema>;

export const subscriptionResponseSchema = z.object({
  subscription: z
    .object({
      planCode: z.string(),
      planName: z.string(),
      status: z.string(),
      startsOn: isoDate,
      endsOn: isoDate,
      maxActivePatients: z.number().int(),
      maxProfessionals: z.number().int(),
    })
    .nullable(),
  graceDays: z.number().int(),
  readOnlyFrom: isoDate.nullable(),
  usage: z.object({
    staff: z.number().int(),
    pendingInvitations: z.number().int(),
    activePatients: z.number().int(),
  }),
});
export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const settingsResponseSchema = z.object({
  'invitation.ttl_days': z.number().int(),
  'subscription.grace_days': z.number().int(),
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export const updateSettingSchema = z.object({ value: z.number().int() });

/** Invitaciones de staff (RN-A06 aplicado a profesionales). */
export const inviteStaffSchema = z.object({
  email: emailSchema,
  role: z.enum(MEMBER_ROLES),
});
export type InviteStaff = z.infer<typeof inviteStaffSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum([...MEMBER_ROLES, 'PATIENT']),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const invitationListResponseSchema = z.object({ invitations: z.array(invitationSchema) });
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/** El token llega en el cuerpo: la página lo lee del fragmento (#TOKEN) y lo borra de la barra. */
export const inspectInvitationSchema = z.object({ token: secretTokenSchema });
export const inspectInvitationResponseSchema = z.object({
  organizationName: z.string(),
  email: z.string(),
  role: z.enum(MEMBER_ROLES),
  /** true: entra con su contraseña actual; false: elige nombre y contraseña. */
  accountExists: z.boolean(),
});
export type InspectInvitationResponse = z.infer<typeof inspectInvitationResponseSchema>;

export const acceptInvitationSchema = z.object({
  token: secretTokenSchema,
  password: passwordInputSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
});
export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;

export const setActiveOrganizationSchema = z.object({ organizationId: z.uuid() });

/** Panel interno (RF-39): planes, organizaciones y suscripciones. */
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, 'Solo minúsculas, dígitos y guiones.'),
  timezone: z.string().trim().min(3).max(64).default('America/Lima'),
  planCode: z.string().trim().min(1),
  startsOn: isoDate,
  ownerEmail: emailSchema,
});
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;

export const changeSubscriptionSchema = z.object({
  planCode: z.string().trim().min(1),
  startsOn: isoDate,
  reason: z.string().trim().max(500).nullable().optional(),
});
export type ChangeSubscription = z.infer<typeof changeSubscriptionSchema>;

export const planSchema = z.object({
  code: z.string(),
  name: z.string(),
  maxActivePatients: z.number().int(),
  maxProfessionals: z.number().int(),
  durationMonths: z.number().int(),
  priceCents: z.number().int(),
  currency: z.string(),
  isActive: z.boolean(),
});
export const planListResponseSchema = z.object({ plans: z.array(planSchema) });
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

export const platformOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['ACTIVE', 'READ_ONLY', 'SUSPENDED', 'CLOSED']),
  timezone: z.string(),
  subscription: z.object({ planCode: z.string(), startsOn: isoDate, endsOn: isoDate }).nullable(),
});
export const platformOrganizationListResponseSchema = z.object({
  organizations: z.array(platformOrganizationSchema),
});
export type PlatformOrganizationListResponse = z.infer<
  typeof platformOrganizationListResponseSchema
>;

export const graceDaysSchema = z.object({ value: z.number().int() });
