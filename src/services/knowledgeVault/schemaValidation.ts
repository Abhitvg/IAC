/**
 * Runtime Schema Validation & Migration Engine (Zod)
 * Validates canonical candidate profile data, rejects malformed inputs,
 * and performs versioned migrations.
 */

import { z } from 'zod';
import { CanonicalCandidateProfile, createDefaultCanonicalProfile } from './canonicalProfile';

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

export const FactEditHistoryEntrySchema = z.object({
  timestamp: z.number().int().positive(),
  previousValue: z.any().optional(),
  updatedBy: z.enum(['candidate', 'ingestion', 'system']),
  reason: z.string().optional(),
  action: z.enum(['CREATED', 'UPDATED', 'DELETED', 'CONFIRMED']).optional(),
});

export const CanonicalFactSchema = z.object({
  id: z.string().min(1),
  category: FactCategorySchema,
  field: z.string().min(1),
  value: z.any(),
  source: z.string().min(1),
  sourceUrlOrFile: z.string().optional(),
  status: EvidenceClassificationSchema,
  confidence: z.number().min(0).max(1),
  candidateConfirmed: z.boolean(),
  confirmedAt: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  lastVerifiedAt: z.number().int().positive().optional(),
  isExpired: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  editHistory: z.array(FactEditHistoryEntrySchema),
});

export const CandidateEducationSchema = z.object({
  id: z.string().min(1),
  institution: z.string(),
  degree: z.string(),
  fieldOfStudy: z.string().optional().default(''),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  grade: z.string().optional(),
  certifications: z.array(z.string()).optional(),
  status: EvidenceClassificationSchema,
  candidateConfirmed: z.boolean(),
});

export const CandidateSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'UNSPECIFIED']).optional(),
  experienceType: z.enum(['theoretical', 'practical']),
  yearsUsed: z.number().nonnegative().optional(),
  lastUsed: z.union([z.string(), z.number()]).optional(),
  projectReferences: z.array(z.string()),
  evidenceSource: z.string(),
  status: EvidenceClassificationSchema,
  candidateConfirmed: z.boolean(),
});

export const CandidateWorkExperienceSchema = z.object({
  id: z.string().min(1),
  employer: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
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
});

export const CandidateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  projectUrl: z.string().optional(),
  repositoryUrl: z.string().optional(),
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
});

export const CandidateAchievementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['award', 'publication', 'certification', 'recommendation', 'outcome']),
  issuerOrPublisher: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  evidenceUrlOrRef: z.string().optional(),
  status: EvidenceClassificationSchema,
  candidateConfirmed: z.boolean(),
});

export const CandidatePreferencesSchema = z.object({
  answerLength: z.enum(['concise', 'balanced', 'detailed']),
  formality: z.enum(['conversational', 'professional', 'executive']),
  responsePerspective: z.enum(['first_person', 'neutral']),
  language: z.string().min(1),
  technicalDepth: z.enum(['conceptual', 'balanced', 'deep_code_and_architecture']),
  responseStyle: z.enum(['bullet_points', 'structured_paragraphs']),
  preferredCodingLanguage: z.string(),
  answerStructure: z.enum(['star', 'prep', 'direct_summary']),
});

export const EmploymentDeclarationsSchema = z.object({
  workAuthorization: z.object({
    confirmed: z.boolean(),
    authorized: z.boolean().nullable(),
    jurisdictions: z.array(z.string()),
    notes: z.string().optional(),
    confirmedAt: z.number().int().positive().optional(),
  }),
  sponsorshipRequired: z.object({
    confirmed: z.boolean(),
    required: z.boolean().nullable(),
    visaType: z.string().optional(),
    notes: z.string().optional(),
    confirmedAt: z.number().int().positive().optional(),
  }),
  willingToRelocate: z.object({
    confirmed: z.boolean(),
    willing: z.boolean().nullable(),
    preferredLocations: z.array(z.string()),
    notes: z.string().optional(),
    confirmedAt: z.number().int().positive().optional(),
  }),
  securityClearance: z.object({
    confirmed: z.boolean(),
    active: z.boolean().nullable(),
    level: z.string().optional(),
    notes: z.string().optional(),
    confirmedAt: z.number().int().positive().optional(),
  }),
  otherDeclarations: z.record(
    z.object({
      value: z.string(),
      confirmed: z.boolean(),
      confirmedAt: z.number().int().positive().optional(),
    })
  ),
});

export const CanonicalCandidateProfileSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  identity: z.object({
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
    links: z.object({
      github: z.string().optional(),
      linkedin: z.string().optional(),
      portfolio: z.string().optional(),
      other: z.array(z.string()).optional(),
    }),
    candidateConfirmed: z.boolean(),
  }),
  education: z.array(CandidateEducationSchema),
  career: z.object({
    currentRole: z.string(),
    currentEmployer: z.string().optional(),
    totalExperienceYears: z.number().nonnegative().optional(),
    targetRoles: z.array(z.string()),
    preferredIndustries: z.array(z.string()),
    targetSeniority: z.enum([
      'junior',
      'mid',
      'senior',
      'staff',
      'lead',
      'principal',
      'executive',
      'UNKNOWN',
    ]).optional(),
    noticePeriod: z.string(),
    salaryExpectations: z.string().optional(),
    candidateConfirmed: z.boolean(),
  }),
  skills: z.array(CandidateSkillSchema),
  experience: z.array(CandidateWorkExperienceSchema),
  projects: z.array(CandidateProjectSchema),
  achievements: z.array(CandidateAchievementSchema),
  preferences: CandidatePreferencesSchema,
  declarations: EmploymentDeclarationsSchema,
  factsLedger: z.record(CanonicalFactSchema),
});

export type ValidationOutcome =
  | { success: true; profile: CanonicalCandidateProfile }
  | { success: false; errors: string[] };

/**
 * Validates a candidate profile against the rigorous canonical schema.
 * Rejects malformed JSON and unauthorized data shapes.
 */
export function validateCanonicalProfile(data: unknown): ValidationOutcome {
  if (!data || typeof data !== 'object') {
    return { success: false, errors: ['Profile payload must be a non-null JSON object'] };
  }

  // Handle versioned migrations
  const rawObj = data as Record<string, any>;
  const migrated = migrateProfileIfNeeded(rawObj);

  const result = CanonicalCandidateProfileSchema.safeParse(migrated);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { success: false, errors };
  }

  return { success: true, profile: result.data as CanonicalCandidateProfile };
}

/**
 * Explicit schema migrations for version upgrades (e.g. v1 -> v2)
 */
export function migrateProfileIfNeeded(raw: Record<string, any>): Record<string, any> {
  const defaultProfile = createDefaultCanonicalProfile();
  const version = raw.version || 1;

  if (version === 1) {
    // Migration v1 -> v2
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
      })),
      projects: (raw.projects || []).map((p: any) => ({
        ...p,
        ownership: p.ownership || 'UNKNOWN',
        deploymentStatus: p.deploymentStatus || 'UNKNOWN',
      })),
      factsLedger: raw.factsLedger || {},
    };
  }

  return raw;
}
