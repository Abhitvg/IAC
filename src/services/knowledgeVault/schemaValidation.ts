/**
 * Runtime Schema Validation & Migration Engine (Zod)
 * Validates canonical candidate profile data, rejects malformed inputs,
 * enforces strict object models, and prevents forged verification statuses.
 */

import { z } from 'zod';
import { CanonicalCandidateProfile, createDefaultCanonicalProfile } from './canonicalProfile';
import { TrustedIndependentAuditService } from '../evidenceInspection';

export const EvidenceClassificationSchema = z.enum([
  'RESUME_REPORTED',
  'WEBSITE_REPORTED',
  'CANDIDATE_CONFIRMED',
  'REPOSITORY_SUPPORTED',
  'DOCUMENT_SUPPORTED',
  'INDEPENDENTLY_VERIFIED',
  'UNKNOWN',
  'PROPOSED_DESIGN',
  'CONTRADICTED',
  'EXPIRED',
]);

export const FactCategorySchema = z.enum([
  'identity',
  'education',
  'career',
  'skill',
  'experience',
  'project',
  'achievement',
  'preference',
  'declaration',
]);

export const UrlStringSchema = z
  .string()
  .refine((val) => !val || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val), {
    message: 'Invalid URL format; must begin with http:// or https://',
  });

export const DateStringSchema = z
  .string()
  .refine((val) => !val || /^\d{4}(-\d{2}(-\d{2}(T[^\s]+)?)?)?$/.test(val), {
    message: 'Invalid date format; expected YYYY, YYYY-MM, or YYYY-MM-DD',
  });

export const FactEditHistoryEntrySchema = z
  .object({
    timestamp: z.number().int().positive(),
    previousValue: z.any().optional(),
    updatedBy: z.enum(['candidate', 'ingestion', 'system']),
    reason: z.string().optional(),
    action: z.enum(['CREATED', 'UPDATED', 'DELETED', 'CONFIRMED']).optional(),
  })
  .strict();

export const CanonicalFactSchema = z
  .object({
    id: z.string().min(1),
    category: FactCategorySchema,
    field: z.string().min(1),
    value: z.any(),
    source: z.string().min(1),
    sourceUrlOrFile: UrlStringSchema.optional(),
    status: EvidenceClassificationSchema,
    confidence: z.number().min(0).max(1),
    candidateConfirmed: z.boolean(),
    confirmedAt: z.number().int().positive().optional(),
    createdAt: z.number().int().positive(),
    lastVerifiedAt: z.number().int().positive().optional(),
    isExpired: z.boolean().optional(),
    isDeleted: z.boolean().optional(),
    editHistory: z.array(FactEditHistoryEntrySchema),
  })
  .strict();

export const CandidateEducationSchema = z
  .object({
    id: z.string().min(1),
    institution: z.string(),
    degree: z.string(),
    fieldOfStudy: z.string().optional().default(''),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    grade: z.string().optional(),
    certifications: z.array(z.string()).optional(),
    status: EvidenceClassificationSchema,
    candidateConfirmed: z.boolean(),
  })
  .strict();

export const CandidateSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().optional(),
    proficiency: z
      .enum(['beginner', 'intermediate', 'advanced', 'expert', 'UNSPECIFIED'])
      .optional(),
    experienceType: z.enum(['theoretical', 'practical']),
    yearsUsed: z.number().min(0).max(100).optional(),
    lastUsed: z.union([DateStringSchema, z.number()]).optional(),
    projectReferences: z.array(z.string()),
    evidenceSource: z.string(),
    status: EvidenceClassificationSchema,
    candidateConfirmed: z.boolean(),
  })
  .strict();

export const CandidateWorkExperienceSchema = z
  .object({
    id: z.string().min(1),
    employer: z.string(),
    title: z.string(),
    startDate: DateStringSchema,
    endDate: DateStringSchema,
    isCurrent: z.boolean(),
    responsibilities: z.array(z.string()),
    personallyImplemented: z.array(z.string()),
    teamContributions: z.array(z.string()),
    leadershipResponsibilities: z.array(z.string()),
    outcomesAndMetrics: z.array(z.string()),
    technologiesUsed: z.array(z.string()),
    missingOrUncertainFacts: z.array(z.string()),
    status: EvidenceClassificationSchema,
    candidateConfirmed: z.boolean(),
  })
  .strict();

export const CandidateProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    projectUrl: UrlStringSchema.optional(),
    repositoryUrl: UrlStringSchema.optional(),
    ownership: z.enum(['SOLE_OWNER', 'PRIMARY_CONTRIBUTOR', 'COLLABORATOR', 'UNKNOWN']),
    exactContribution: z.string(),
    teamContributions: z.string().optional(),
    technologyStack: z.array(z.string()),
    architecture: z.string().optional(),
    deploymentStatus: z.enum([
      'deployed_production',
      'staging_demo',
      'prototype',
      'proposed_design',
      'unreleased',
      'UNKNOWN',
    ]),
    outcomes: z.array(z.string()),
    evidenceReferences: z.array(z.string()),
    status: EvidenceClassificationSchema,
    candidateConfirmed: z.boolean(),
    storedInspection: z.any().optional(),
    verificationRecord: z.any().optional(),
  })
  .strict();

export const CandidateAchievementSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: z.enum(['award', 'publication', 'certification', 'recommendation', 'outcome']),
    issuerOrPublisher: z.string().optional(),
    date: DateStringSchema.optional(),
    description: z.string().optional(),
    evidenceUrlOrRef: UrlStringSchema.optional(),
    status: EvidenceClassificationSchema,
    candidateConfirmed: z.boolean(),
  })
  .strict();

export const CandidatePreferencesSchema = z
  .object({
    answerLength: z.enum(['concise', 'balanced', 'detailed']),
    formality: z.enum(['conversational', 'professional', 'executive']),
    responsePerspective: z.enum(['first_person', 'neutral']),
    language: z.string().min(1),
    technicalDepth: z.enum(['conceptual', 'balanced', 'deep_code_and_architecture']),
    responseStyle: z.enum(['bullet_points', 'structured_paragraphs']),
    preferredCodingLanguage: z.string(),
    answerStructure: z.enum(['star', 'prep', 'direct_summary']),
  })
  .strict();

export const EmploymentDeclarationsSchema = z
  .object({
    workAuthorization: z
      .object({
        confirmed: z.boolean(),
        authorized: z.boolean().nullable(),
        jurisdictions: z.array(z.string()),
        notes: z.string().optional(),
        confirmedAt: z.number().int().positive().optional(),
      })
      .strict(),
    sponsorshipRequired: z
      .object({
        confirmed: z.boolean(),
        required: z.boolean().nullable(),
        visaType: z.string().optional(),
        notes: z.string().optional(),
        confirmedAt: z.number().int().positive().optional(),
      })
      .strict(),
    willingToRelocate: z
      .object({
        confirmed: z.boolean(),
        willing: z.boolean().nullable(),
        preferredLocations: z.array(z.string()),
        notes: z.string().optional(),
        confirmedAt: z.number().int().positive().optional(),
      })
      .strict(),
    securityClearance: z
      .object({
        confirmed: z.boolean(),
        active: z.boolean().nullable(),
        level: z.string().optional(),
        notes: z.string().optional(),
        confirmedAt: z.number().int().positive().optional(),
      })
      .strict(),
    otherDeclarations: z.record(
      z.string(),
      z
        .object({
          value: z.string(),
          confirmed: z.boolean(),
          confirmedAt: z.number().int().positive().optional(),
        })
        .strict()
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Cross-field invariant: A declaration cannot be confirmed while its answer remains null
    if (data.workAuthorization.confirmed && data.workAuthorization.authorized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workAuthorization', 'authorized'],
        message: 'Confirmed work authorization declaration cannot have a null value',
      });
    }
    if (data.sponsorshipRequired.confirmed && data.sponsorshipRequired.required === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sponsorshipRequired', 'required'],
        message: 'Confirmed sponsorship declaration cannot have a null value',
      });
    }
    if (data.willingToRelocate.confirmed && data.willingToRelocate.willing === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['willingToRelocate', 'willing'],
        message: 'Confirmed relocation declaration cannot have a null value',
      });
    }
    if (data.securityClearance.confirmed && data.securityClearance.active === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['securityClearance', 'active'],
        message: 'Confirmed security clearance declaration cannot have a null value',
      });
    }
  });

export const CanonicalCandidateProfileSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
    identity: z
      .object({
        fullName: z.string(),
        preferredName: z.string().optional(),
        email: z.string(),
        phone: z.string().optional(),
        location: z.string(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        preferredLanguage: z.string(),
        timeZone: z.string().optional(),
        links: z
          .object({
            github: UrlStringSchema.optional(),
            linkedin: UrlStringSchema.optional(),
            portfolio: UrlStringSchema.optional(),
            other: z.array(UrlStringSchema).optional(),
          })
          .strict(),
        candidateConfirmed: z.boolean(),
      })
      .strict(),
    education: z.array(CandidateEducationSchema),
    career: z
      .object({
        currentRole: z.string(),
        currentEmployer: z.string().optional(),
        totalExperienceYears: z.number().min(0).max(100).optional(),
        targetRoles: z.array(z.string()),
        preferredIndustries: z.array(z.string()),
        targetSeniority: z
          .enum(['junior', 'mid', 'senior', 'staff', 'lead', 'principal', 'executive', 'UNKNOWN'])
          .optional(),
        noticePeriod: z.string(),
        salaryExpectations: z.string().optional(),
        candidateConfirmed: z.boolean(),
      })
      .strict(),
    skills: z.array(CandidateSkillSchema),
    experience: z.array(CandidateWorkExperienceSchema),
    projects: z.array(CandidateProjectSchema),
    achievements: z.array(CandidateAchievementSchema),
    preferences: CandidatePreferencesSchema,
    declarations: EmploymentDeclarationsSchema,
    factsLedger: z.record(z.string(), CanonicalFactSchema),
  })
  .strict()
  .superRefine((profile, ctx) => {
    // Ledger key/field consistency and tombstone structure
    for (const [key, fact] of Object.entries(profile.factsLedger)) {
      if (fact.isDeleted) {
        const hasTombstone = (fact.editHistory || []).some((h) => h.action === 'DELETED');
        if (!hasTombstone) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['factsLedger', key, 'editHistory'],
            message: `Deleted fact "${key}" must record a DELETED edit history tombstone`,
          });
        }
      }
    }

    // Anti-forgery check: INDEPENDENTLY_VERIFIED project status must have a verifiable cryptographic seal
    for (let i = 0; i < profile.projects.length; i++) {
      const proj = profile.projects[i];
      if (proj.status === 'INDEPENDENTLY_VERIFIED') {
        const audit = proj.storedInspection;
        const sealValid =
          audit && typeof audit === 'object' && TrustedIndependentAuditService.verifySeal(audit);
        if (!sealValid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['projects', i, 'status'],
            message: `Project "${proj.name}" claims INDEPENDENTLY_VERIFIED without an authentic cryptographic audit seal`,
          });
        }
      }
    }
  });

export type ValidationOutcome =
  { success: true; profile: CanonicalCandidateProfile } | { success: false; errors: string[] };

/**
 * Validates a candidate profile against the rigorous canonical schema.
 * Rejects malformed JSON, prototype pollution, oversized payloads, and unauthorized data shapes.
 */
export function validateCanonicalProfile(data: unknown): ValidationOutcome {
  if (!data || typeof data !== 'object') {
    return { success: false, errors: ['Profile payload must be a non-null JSON object'] };
  }

  // 1. Prototype pollution protection
  try {
    const jsonStr = JSON.stringify(data);
    if (
      jsonStr.includes('__proto__') ||
      jsonStr.includes('constructor') ||
      jsonStr.includes('"prototype"')
    ) {
      return {
        success: false,
        errors: ['Prototype pollution or constructor override keys are strictly forbidden'],
      };
    }
    // 2. Oversized payload defense (> 5MB)
    if (jsonStr.length > 5 * 1024 * 1024) {
      return { success: false, errors: ['Payload exceeds maximum permitted size (5MB)'] };
    }
  } catch (err: any) {
    return { success: false, errors: [`Failed to parse or inspect payload: ${err.message}`] };
  }

  const rawObj = data as Record<string, any>;

  // 3. Strict version validation: only versions 1 and 2 are supported
  if (rawObj.version !== undefined) {
    if (
      typeof rawObj.version !== 'number' ||
      !Number.isInteger(rawObj.version) ||
      rawObj.version < 1 ||
      rawObj.version > 2
    ) {
      return {
        success: false,
        errors: [`Unsupported schema version: ${rawObj.version}. Supported versions are 1, 2`],
      };
    }
  }

  // 4. Sequential version migration
  let profileToValidate: any;
  try {
    profileToValidate = migrateProfileIfNeeded(rawObj);
  } catch (err: any) {
    return { success: false, errors: [`Migration failure: ${err.message}`] };
  }

  const result = CanonicalCandidateProfileSchema.safeParse(profileToValidate);
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { success: false, errors };
  }

  return { success: true, profile: result.data as CanonicalCandidateProfile };
}

/**
 * Explicit schema migrations for version upgrades (e.g. v1 -> v2)
 * Invariants:
 * - Migrations are explicit and sequential.
 * - Preserves complete provenance and audit history.
 * - Never upgrades evidence status during migration.
 * - Unknown or invalid versions are not migrated.
 */
export function migrateProfileIfNeeded(raw: Record<string, any>): Record<string, any> {
  const version = raw.version || 1;

  if (version === 1) {
    // Migration v1 -> v2:
    // Retain all existing fields without inventing data or upgrading evidence status
    const defaultProfile = createDefaultCanonicalProfile();

    return {
      ...defaultProfile,
      ...raw,
      version: 2,
      career: {
        ...defaultProfile.career,
        ...(raw.career || {}),
        targetSeniority: raw.career?.targetSeniority || 'UNKNOWN',
      },
      skills: (raw.skills || []).map((s: any) => ({
        ...s,
        proficiency: s.proficiency || 'UNSPECIFIED',
        experienceType: s.experienceType || 'theoretical',
        // Status is strictly preserved — never upgraded during migration
        status: s.status || 'UNKNOWN',
      })),
      projects: (raw.projects || []).map((p: any) => ({
        ...p,
        ownership: p.ownership || 'UNKNOWN',
        deploymentStatus: p.deploymentStatus || 'UNKNOWN',
        // Status is strictly preserved — never upgraded during migration
        status: p.status || 'UNKNOWN',
      })),
      factsLedger: raw.factsLedger || {},
    };
  }

  if (version === 2) {
    return raw;
  }

  throw new Error(`Unsupported schema version: ${version}. Supported versions are 1, 2`);
}
