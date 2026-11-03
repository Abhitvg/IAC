/**
 * Canonical Candidate Profile & Provenance Engine (IAC 2.0 - Phase 2)
 *
 * Implements the single source of truth for candidate identity, education, career,
 * skills, work experience, projects, achievements, preferences, and employment declarations.
 *
 * Strict Provenance Rules:
 * - Zero invented defaults: seniority is UNKNOWN, yearsUsed unstated, no auto-inferred declarations.
 * - Distinct verification tiers: INDEPENDENTLY_VERIFIED vs CANDIDATE_REPORTED vs UNVERIFIED.
 * - Project references must resolve against real candidate projects with verified technology usage.
 * - Repository presence does not establish personal authorship.
 */

import { EvidenceClassification } from './types';
import {
  TrustedIndependentAuditService,
  TrustedRepositoryInspectionService,
  ImmutableIndependentAuditResult,
  ImmutableRepositoryInspectionResult,
} from '../evidenceInspection';

export interface ProjectVerificationRecord {
  verificationType: 'INDEPENDENT_AUDIT' | 'REPOSITORY_INSPECTION' | 'DOCUMENT_INSPECTION';
  verifierId: string;
  verificationMethod: 'cryptographic_audit' | 'asymmetric_attestation' | 'hmac_sha256_inspection';
  verifiedAt: number;
  expiresAt?: number;
  projectId: string;
  candidateId?: string;
  evidenceDigest: string;
  seal: string;
  repositoryUrl?: string;
  commitSha?: string;
  auditedContribution?: string;
  revoked?: boolean;
}

export type FactCategory =
  | 'identity'
  | 'education'
  | 'career'
  | 'skill'
  | 'experience'
  | 'project'
  | 'achievement'
  | 'preference'
  | 'declaration';

export interface FactEditHistoryEntry {
  timestamp: number;
  previousValue?: any;
  updatedBy: 'candidate' | 'ingestion' | 'system';
  reason?: string;
  action?: 'CREATED' | 'UPDATED' | 'DELETED' | 'CONFIRMED';
}

export interface CanonicalFact<T = any> {
  id: string;
  category: FactCategory;
  field: string;
  value: T;
  source: string;
  sourceUrlOrFile?: string;
  status: EvidenceClassification;
  confidence: number; // 0.0 to 1.0
  candidateConfirmed: boolean;
  confirmedAt?: number;
  createdAt: number;
  lastVerifiedAt?: number;
  isExpired?: boolean;
  isDeleted?: boolean;
  editHistory: FactEditHistoryEntry[];
}

export interface CandidateEducation {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
  certifications?: string[];
  status: EvidenceClassification;
  candidateConfirmed: boolean;
}

export interface CandidateSkill {
  id: string;
  name: string;
  proficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'UNSPECIFIED';
  experienceType: 'theoretical' | 'practical';
  yearsUsed?: number;
  lastUsed?: string | number;
  projectReferences: string[];
  evidenceSource: string;
  status: EvidenceClassification;
  candidateConfirmed: boolean;
}

export interface CandidateWorkExperience {
  id: string;
  employer: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  responsibilities: string[];
  personallyImplemented: string[];
  teamContributions: string[];
  leadershipResponsibilities: string[];
  outcomesAndMetrics: string[];
  technologiesUsed: string[];
  missingOrUncertainFacts: string[];
  status: EvidenceClassification;
  candidateConfirmed: boolean;
}

export interface CandidateProject {
  id: string;
  name: string;
  description: string;
  projectUrl?: string;
  repositoryUrl?: string;
  ownership: 'SOLE_OWNER' | 'PRIMARY_CONTRIBUTOR' | 'COLLABORATOR' | 'UNKNOWN';
  exactContribution: string;
  teamContributions?: string;
  technologyStack: string[];
  architecture?: string;
  deploymentStatus: 'deployed_production' | 'staging_demo' | 'prototype' | 'proposed_design' | 'unreleased' | 'UNKNOWN';
  outcomes: string[];
  evidenceReferences: string[];
  status: EvidenceClassification;
  candidateConfirmed: boolean;
  storedInspection?: any;
  verificationRecord?: ProjectVerificationRecord;
}

export interface CandidateAchievement {
  id: string;
  title: string;
  category: 'award' | 'publication' | 'certification' | 'recommendation' | 'outcome';
  issuerOrPublisher?: string;
  date?: string;
  description?: string;
  evidenceUrlOrRef?: string;
  status: EvidenceClassification;
  candidateConfirmed: boolean;
}

export interface CandidatePreferences {
  answerLength: 'concise' | 'balanced' | 'detailed';
  formality: 'conversational' | 'professional' | 'executive';
  responsePerspective: 'first_person' | 'neutral';
  language: string;
  technicalDepth: 'conceptual' | 'balanced' | 'deep_code_and_architecture';
  responseStyle: 'bullet_points' | 'structured_paragraphs';
  preferredCodingLanguage: string;
  answerStructure: 'star' | 'prep' | 'direct_summary';
}

export interface EmploymentDeclarations {
  workAuthorization: {
    confirmed: boolean;
    authorized: boolean | null;
    jurisdictions: string[];
    notes?: string;
    confirmedAt?: number;
  };
  sponsorshipRequired: {
    confirmed: boolean;
    required: boolean | null;
    visaType?: string;
    notes?: string;
    confirmedAt?: number;
  };
  willingToRelocate: {
    confirmed: boolean;
    willing: boolean | null;
    preferredLocations: string[];
    notes?: string;
    confirmedAt?: number;
  };
  securityClearance: {
    confirmed: boolean;
    active: boolean | null;
    level?: string;
    notes?: string;
    confirmedAt?: number;
  };
  otherDeclarations: Record<string, { value: string; confirmed: boolean; confirmedAt?: number }>;
}

export interface CanonicalCandidateProfile {
  id: string;
  version: number;
  updatedAt: number;

  // Section A: Personal Identity
  identity: {
    fullName: string;
    preferredName?: string;
    email: string;
    phone?: string;
    location: string;
    city?: string;
    state?: string;
    country?: string;
    preferredLanguage: string;
    timeZone?: string;
    links: {
      github?: string;
      linkedin?: string;
      portfolio?: string;
      other?: string[];
    };
    candidateConfirmed: boolean;
  };

  // Section B: Education
  education: CandidateEducation[];

  // Section C: Career Overview (Zero invented defaults: targetSeniority is UNKNOWN until supplied)
  career: {
    currentRole: string;
    currentEmployer?: string;
    totalExperienceYears?: number;
    targetRoles: string[];
    preferredIndustries: string[];
    targetSeniority?: 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'principal' | 'executive' | 'UNKNOWN';
    noticePeriod: string;
    salaryExpectations?: string;
    candidateConfirmed: boolean;
  };

  // Section D: Skills
  skills: CandidateSkill[];

  // Section E: Work Experience
  experience: CandidateWorkExperience[];

  // Section F: Projects
  projects: CandidateProject[];

  // Section G: Achievements
  achievements: CandidateAchievement[];

  // Section H: Preferences
  preferences: CandidatePreferences;

  // Section I: Employment Declarations (Strict candidate confirmation required)
  declarations: EmploymentDeclarations;

  // Granular Fact Provenance Ledger
  factsLedger: Record<string, CanonicalFact>;
}

export function createDefaultCanonicalProfile(): CanonicalCandidateProfile {
  return {
    id: `canonical-candidate-${Date.now()}`,
    version: 2,
    updatedAt: Date.now(),
    identity: {
      fullName: '',
      preferredName: '',
      email: '',
      phone: '',
      location: '',
      preferredLanguage: 'English',
      timeZone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC',
      links: {},
      candidateConfirmed: false,
    },
    education: [],
    career: {
      currentRole: '',
      totalExperienceYears: undefined,
      targetRoles: [],
      preferredIndustries: [],
      targetSeniority: 'UNKNOWN',
      noticePeriod: '',
      candidateConfirmed: false,
    },
    skills: [],
    experience: [],
    projects: [],
    achievements: [],
    preferences: {
      answerLength: 'balanced',
      formality: 'professional',
      responsePerspective: 'first_person',
      language: 'English',
      technicalDepth: 'balanced',
      responseStyle: 'structured_paragraphs',
      preferredCodingLanguage: 'TypeScript',
      answerStructure: 'star',
    },
    declarations: {
      workAuthorization: { confirmed: false, authorized: null, jurisdictions: [] },
      sponsorshipRequired: { confirmed: false, required: null },
      willingToRelocate: { confirmed: false, willing: null, preferredLocations: [] },
      securityClearance: { confirmed: false, active: null },
      otherDeclarations: {},
    },
    factsLedger: {},
  };
}

export const DEFAULT_CANONICAL_PROFILE: CanonicalCandidateProfile = createDefaultCanonicalProfile();

/**
 * Creates a new Canonical Candidate Fact with status-upgrade protection.
 */
export function createCanonicalFact<T>(
  field: string,
  category: FactCategory,
  value: T,
  source: string,
  status: EvidenceClassification = 'UNKNOWN',
  candidateConfirmed = false,
  sourceUrlOrFile?: string
): CanonicalFact<T> {
  const now = Date.now();
  return {
    id: `fact_${category}_${field.replace(/[^a-zA-Z0-9_]/g, '_')}_${now}_${Math.random().toString(36).substring(2, 7)}`,
    category,
    field,
    value,
    source,
    sourceUrlOrFile,
    status,
    confidence: status === 'INDEPENDENTLY_VERIFIED' ? 1.0 : candidateConfirmed ? 0.95 : 0.6,
    candidateConfirmed,
    confirmedAt: candidateConfirmed ? now : undefined,
    createdAt: now,
    lastVerifiedAt: status === 'INDEPENDENTLY_VERIFIED' || candidateConfirmed ? now : undefined,
    isExpired: false,
    isDeleted: false,
    editHistory: [],
  };
}

/**
 * Validates that an employment declaration was not automatically fabricated.
 * Invariant: Declarations must have explicit candidate confirmation.
 */
export function validateDeclarationSafety(
  declaration: { confirmed: boolean; authorized?: boolean | null; required?: boolean | null }
): boolean {
  if (!declaration || !declaration.confirmed) return false;
  return declaration.authorized !== null || declaration.required !== null;
}

// -------------------------------------------------------------------------------------------------
// Rigorous Personal Authorship Verification Tier
// -------------------------------------------------------------------------------------------------

export type AuthorshipVerificationTier =
  | 'INDEPENDENTLY_VERIFIED'
  | 'REPOSITORY_SUPPORTED_CONTRIBUTION'
  | 'CANDIDATE_REPORTED'
  | 'UNVERIFIED';

export interface AuthorshipEvaluationResult {
  canClaim: boolean;
  tier: AuthorshipVerificationTier;
  reason?: string;
  isIndependentlyVerified: boolean;
  isCandidateReportedOnly: boolean;
}

/**
 * Evaluates whether a candidate can truthfully claim personal authorship of a project.
 *
 * Invariants (P0.1, P0.2):
 * 1. INDEPENDENTLY_VERIFIED requires an authentic, non-revoked cryptographic audit record
 *    bound to this exact project and candidate contribution.
 * 2. Repository-supported contribution requires a real repository URL, successful sealed inspection,
 *    resolved 40-hex commit, and confirmed candidate commit authorship.
 * 3. Candidate confirmation alone is strictly CANDIDATE_REPORTED, never INDEPENDENTLY_VERIFIED.
 * 4. Fake GitHub evidence strings or unverified repository existence cannot produce verification.
 */
export function evaluatePersonalAuthorship(project: CandidateProject): AuthorshipEvaluationResult {
  if (!project) {
    return {
      canClaim: false,
      tier: 'UNVERIFIED',
      reason: 'Project record does not exist',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: false,
    };
  }

  // Personal contribution must be explicitly documented
  if (!project.exactContribution || project.exactContribution.trim().length === 0) {
    return {
      canClaim: false,
      tier: 'UNVERIFIED',
      reason: 'No exact personal implementation contribution documented',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: false,
    };
  }

  // Ownership cannot be UNKNOWN
  if (project.ownership === 'UNKNOWN') {
    return {
      canClaim: false,
      tier: 'UNVERIFIED',
      reason: 'Project ownership category is UNKNOWN',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: false,
    };
  }

  // 1. Independent Authorship Verification (P0.1)
  const auditResult = project.storedInspection as ImmutableIndependentAuditResult | undefined;
  const verRecord = project.verificationRecord;

  if (
    project.status === 'INDEPENDENTLY_VERIFIED' ||
    (auditResult && typeof auditResult === 'object' && auditResult.__auditSeal) ||
    (verRecord && verRecord.verificationType === 'INDEPENDENT_AUDIT')
  ) {
    let isValidAudit = false;
    let failureReason = '';

    if (auditResult && typeof auditResult === 'object' && auditResult.__auditSeal) {
      const sealValid = TrustedIndependentAuditService.verifySeal(auditResult);
      if (!sealValid) {
        failureReason = 'Independent audit verification record has an invalid or tampered cryptographic seal';
      } else {
        const auditorConfigured = TrustedIndependentAuditService.isAuditorConfigured(auditResult.auditorId);
        if (!auditorConfigured) {
          failureReason = `Auditor '${auditResult.auditorId}' is not configured, disabled, or revoked`;
        } else {
          const targetProj = (auditResult.projectId || '').toLowerCase().trim();
          const curId = project.id.toLowerCase().trim();
          const curName = project.name.toLowerCase().trim();
          if (targetProj !== curId && targetProj !== curName) {
            failureReason = `Audit record project mismatch: bound to '${auditResult.projectId}', but current project is '${project.id}'`;
          } else {
            const now = Date.now();
            if (auditResult.verifiedAt > now + 60000) {
              failureReason = 'Audit verification record has invalid future timestamp';
            } else if (!auditResult.auditedFields?.personalContribution) {
              failureReason = 'Audit verification record does not attest to personal contribution';
            } else {
              isValidAudit = true;
            }
          }
        }
      }
    } else if (verRecord && verRecord.verificationType === 'INDEPENDENT_AUDIT') {
      if (verRecord.revoked) {
        failureReason = 'Verification record has been revoked';
      } else if (verRecord.expiresAt && Date.now() > verRecord.expiresAt) {
        failureReason = 'Verification record has expired';
      } else if (!TrustedIndependentAuditService.isAuditorConfigured(verRecord.verifierId)) {
        failureReason = `Verifier '${verRecord.verifierId}' is not a recognized active auditor`;
      } else {
        const targetProj = (verRecord.projectId || '').toLowerCase().trim();
        if (targetProj !== project.id.toLowerCase().trim() && targetProj !== project.name.toLowerCase().trim()) {
          failureReason = `Verification record project binding mismatch: '${verRecord.projectId}' vs '${project.id}'`;
        } else if (!verRecord.seal || verRecord.seal.length < 16) {
          failureReason = 'Verification record lacks a valid immutable cryptographic evidence digest';
        } else {
          isValidAudit = true;
        }
      }
    } else {
      failureReason = 'Claimed INDEPENDENTLY_VERIFIED status lacks an authentic cryptographic audit record';
    }

    if (isValidAudit) {
      return {
        canClaim: true,
        tier: 'INDEPENDENTLY_VERIFIED',
        isIndependentlyVerified: true,
        isCandidateReportedOnly: false,
      };
    }

    // Fail closed: if audit was invalid or tampered, do NOT allow INDEPENDENTLY_VERIFIED
    // If candidate confirmed, fall back to CANDIDATE_REPORTED
    if (project.candidateConfirmed || project.status === 'CANDIDATE_CONFIRMED') {
      return {
        canClaim: true,
        tier: 'CANDIDATE_REPORTED',
        reason: `Audit verification failed (${failureReason}); fell back to candidate-reported`,
        isIndependentlyVerified: false,
        isCandidateReportedOnly: true,
      };
    }

    return {
      canClaim: false,
      tier: 'UNVERIFIED',
      reason: failureReason || 'Audit verification failed and candidate has not confirmed record',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: false,
    };
  }

  // 2. Repository-Supported Contribution (P0.2)
  const repoInspection = project.storedInspection as ImmutableRepositoryInspectionResult | undefined;
  const isApprovedRepoUrl = /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/i.test(
    project.repositoryUrl || ''
  );

  if (project.repositoryUrl && isApprovedRepoUrl && repoInspection && typeof repoInspection === 'object' && repoInspection.__inspectionSeal) {
    const sealValid = TrustedRepositoryInspectionService.verifySeal(repoInspection);
    const repoMatch = (repoInspection.repositoryUrl || '').toLowerCase().trim() === project.repositoryUrl.toLowerCase().trim();
    const hasValidCommit = /^[a-f0-9]{40}$/i.test(repoInspection.resolvedCommitSha || '');
    const isAuthor = repoInspection.candidateAuthorshipStatus === 'COMMIT_AUTHOR';

    if (sealValid && repoMatch && hasValidCommit && isAuthor && project.candidateConfirmed) {
      return {
        canClaim: true,
        tier: 'REPOSITORY_SUPPORTED_CONTRIBUTION',
        isIndependentlyVerified: false,
        isCandidateReportedOnly: false,
      };
    }
  }

  // 3. Candidate-Reported
  if (project.candidateConfirmed || project.status === 'CANDIDATE_CONFIRMED') {
    return {
      canClaim: true,
      tier: 'CANDIDATE_REPORTED',
      reason: 'Candidate reported personal implementation; pending independent audit evidence',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: true,
    };
  }

  return {
    canClaim: false,
    tier: 'UNVERIFIED',
    reason: 'Unverified project claim cannot be presented as personal implementation',
    isIndependentlyVerified: false,
    isCandidateReportedOnly: false,
  };
}

export function canClaimPersonalAuthorship(project: CandidateProject): boolean {
  return evaluatePersonalAuthorship(project).canClaim;
}

// -------------------------------------------------------------------------------------------------
// Rigorous Production Skill Experience Verification Tier
// -------------------------------------------------------------------------------------------------

export type SkillExperienceTier =
  | 'INDEPENDENTLY_VERIFIED'
  | 'REPOSITORY_SUPPORTED_PRODUCTION'
  | 'CANDIDATE_REPORTED_PRODUCTION'
  | 'PROJECT_BACKED_PRACTICAL'
  | 'CANDIDATE_REPORTED_PRACTICAL'
  | 'THEORETICAL_ONLY'
  | 'UNRESOLVED_PROJECT_REF'
  | 'UNVERIFIED';

export interface SkillExperienceEvaluationResult {
  canClaimProduction: boolean;
  tier: SkillExperienceTier;
  reason?: string;
  resolvedProjects: CandidateProject[];
  isIndependentlyVerified: boolean;
}

/**
 * Evaluates whether a skill qualifies for production implementation claims (P0.3).
 *
 * Invariants:
 * 1. Do not infer production use from technologyStack alone.
 * 2. Requires candidate-specific implementation evidence in exactContribution or inspected code.
 * 3. Requires production deployment context (deploymentStatus === 'deployed_production').
 * 4. Theoretical knowledge or non-production projects cannot claim production implementation.
 */
export function evaluateProductionSkillExperience(
  skill: CandidateSkill,
  registeredProjects: CandidateProject[] = []
): SkillExperienceEvaluationResult {
  if (!skill) {
    return {
      canClaimProduction: false,
      tier: 'UNVERIFIED',
      reason: 'Skill record does not exist',
      resolvedProjects: [],
      isIndependentlyVerified: false,
    };
  }

  // Theoretical knowledge check
  if (skill.experienceType !== 'practical') {
    return {
      canClaimProduction: false,
      tier: 'THEORETICAL_ONLY',
      reason: 'Skill is designated as theoretical knowledge only',
      resolvedProjects: [],
      isIndependentlyVerified: false,
    };
  }

  // Must have project references
  if (!skill.projectReferences || skill.projectReferences.length === 0) {
    return {
      canClaimProduction: false,
      tier: 'UNVERIFIED',
      reason: 'Practical skills must reference at least one project demonstrating implementation',
      resolvedProjects: [],
      isIndependentlyVerified: false,
    };
  }

  const resolvedProjects: CandidateProject[] = [];
  const skillLower = skill.name.toLowerCase().trim();

  for (const ref of skill.projectReferences) {
    const refLower = ref.toLowerCase().trim();
    const matched = registeredProjects.find(
      (p) => p.id.toLowerCase() === refLower || p.name.toLowerCase().trim() === refLower
    );

    if (!matched) {
      return {
        canClaimProduction: false,
        tier: 'UNRESOLVED_PROJECT_REF',
        reason: `Project reference "${ref}" cannot be resolved against registered candidate projects`,
        resolvedProjects: [],
        isIndependentlyVerified: false,
      };
    }

    // Technology must have candidate-specific implementation evidence:
    // in exactContribution or in inspected repository usage authored by candidate
    const contributionMatches = (matched.exactContribution || '').toLowerCase().includes(skillLower);
    const inspectedUsageMatches = (
      matched.storedInspection?.sourceCodeUsage ||
      matched.storedInspection?.verifiedTechnologies ||
      []
    ).some((t: string) => t.toLowerCase().trim() === skillLower || t.toLowerCase().includes(skillLower));

    const inTechStack = (matched.technologyStack || []).some(
      (t) => t.toLowerCase().trim() === skillLower || skillLower.includes(t.toLowerCase().trim()) || t.toLowerCase().trim().includes(skillLower)
    );

    if (!contributionMatches && !inspectedUsageMatches) {
      if (inTechStack) {
        return {
          canClaimProduction: false,
          tier: 'UNVERIFIED',
          reason: `Skill "${skill.name}" is listed in technologyStack of "${matched.name}" but lacks candidate-specific implementation evidence in exactContribution or inspected code`,
          resolvedProjects: [],
          isIndependentlyVerified: false,
        };
      }
      return {
        canClaimProduction: false,
        tier: 'UNVERIFIED',
        reason: `Referenced project "${matched.name}" does not include skill "${skill.name}" in its personal implementation evidence`,
        resolvedProjects: [],
        isIndependentlyVerified: false,
      };
    }

    // Referenced project cannot be unverified proposed design or expired
    if (matched.status === 'UNKNOWN' || matched.status === 'PROPOSED_DESIGN' || matched.status === 'EXPIRED') {
      return {
        canClaimProduction: false,
        tier: 'UNVERIFIED',
        reason: `Referenced project "${matched.name}" has invalid verification status "${matched.status}"`,
        resolvedProjects: [],
        isIndependentlyVerified: false,
      };
    }

    // Merely appearing in a repository without verified candidate contribution is insufficient
    if (matched.status === 'REPOSITORY_SUPPORTED' && !matched.candidateConfirmed && !matched.exactContribution) {
      return {
        canClaimProduction: false,
        tier: 'UNVERIFIED',
        reason: `Presence of technology in repository does not infer candidate production use without personal contribution evidence`,
        resolvedProjects: [],
        isIndependentlyVerified: false,
      };
    }

    // Deployment context check: Must be deployed to production to claim production experience!
    if (matched.deploymentStatus !== 'deployed_production') {
      return {
        canClaimProduction: false,
        tier: 'CANDIDATE_REPORTED_PRACTICAL',
        reason: `Referenced project "${matched.name}" has deployment status "${matched.deploymentStatus}", which does not satisfy production deployment requirement`,
        resolvedProjects: [matched],
        isIndependentlyVerified: false,
      };
    }

    resolvedProjects.push(matched);
  }

  // All resolved projects have candidate implementation evidence and are deployed to production.
  // Now categorize tier:
  const allIndependentlyVerified =
    skill.status === 'INDEPENDENTLY_VERIFIED' &&
    resolvedProjects.every((p) => {
      const auth = evaluatePersonalAuthorship(p);
      return auth.isIndependentlyVerified;
    });

  if (allIndependentlyVerified) {
    return {
      canClaimProduction: true,
      tier: 'INDEPENDENTLY_VERIFIED',
      resolvedProjects,
      isIndependentlyVerified: true,
    };
  }

  const allRepoSupported = resolvedProjects.every((p) => {
    const auth = evaluatePersonalAuthorship(p);
    return auth.tier === 'REPOSITORY_SUPPORTED_CONTRIBUTION';
  });

  if (allRepoSupported) {
    return {
      canClaimProduction: true,
      tier: 'REPOSITORY_SUPPORTED_PRODUCTION',
      resolvedProjects,
      isIndependentlyVerified: false,
    };
  }

  const isCandidateReported =
    (skill.candidateConfirmed || skill.status === 'CANDIDATE_CONFIRMED') &&
    resolvedProjects.every((p) => p.candidateConfirmed || p.status === 'CANDIDATE_CONFIRMED' || p.status === 'DOCUMENT_SUPPORTED');

  if (isCandidateReported) {
    return {
      canClaimProduction: true,
      tier: 'CANDIDATE_REPORTED_PRODUCTION',
      reason: 'Validated by candidate-confirmed project implementation evidence deployed to production',
      resolvedProjects,
      isIndependentlyVerified: false,
    };
  }

  return {
    canClaimProduction: true,
    tier: 'PROJECT_BACKED_PRACTICAL',
    resolvedProjects,
    isIndependentlyVerified: false,
  };
}

export function canClaimProductionSkillExperience(
  skill: CandidateSkill,
  registeredProjects?: CandidateProject[]
): boolean {
  if (!registeredProjects || registeredProjects.length === 0) return false;
  return evaluateProductionSkillExperience(skill, registeredProjects).canClaimProduction;
}
