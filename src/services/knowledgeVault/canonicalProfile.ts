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
 * Invariants:
 * 1. Merely having code in a repository does NOT establish personal authorship.
 * 2. Candidate confirmation alone is strictly CANDIDATE_REPORTED, never INDEPENDENTLY_VERIFIED.
 * 3. Must require valid project references and explicit personal contribution description.
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

  // Independent verification requires external cryptographic attestation or document audit
  if (project.status === 'INDEPENDENTLY_VERIFIED' && project.evidenceReferences && project.evidenceReferences.length > 0) {
    return {
      canClaim: true,
      tier: 'INDEPENDENTLY_VERIFIED',
      isIndependentlyVerified: true,
      isCandidateReportedOnly: false,
    };
  }

  // Repository-supported: repository exists with inspectable commit/PR evidence AND candidate confirmation
  const hasRepoEvidence = Boolean(
    project.repositoryUrl &&
    project.evidenceReferences &&
    project.evidenceReferences.some((ref) =>
      ref.toLowerCase().includes('github') || ref.toLowerCase().includes('repo') || ref.toLowerCase().includes('git:')
    )
  );

  if (hasRepoEvidence && (project.status === 'REPOSITORY_SUPPORTED' || project.status === 'DOCUMENT_SUPPORTED') && project.candidateConfirmed) {
    return {
      canClaim: true,
      tier: 'REPOSITORY_SUPPORTED_CONTRIBUTION',
      isIndependentlyVerified: false,
      isCandidateReportedOnly: false,
    };
  }

  // Candidate confirmation alone (without repository evidence) is strictly candidate-reported
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
 * Evaluates whether a skill qualifies for production implementation claims.
 *
 * Invariants:
 * 1. Resolves every project reference against registered projects.
 * 2. Requires evidence that the candidate used the skill in that project (in techStack or contribution).
 * 3. Does not infer production use merely from a skill appearing in a repository or resume.
 * 4. Theoretical knowledge cannot claim production implementation experience.
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

    // Technology must exist in technologyStack or exactContribution
    const techMatches = (matched.technologyStack || []).some(
      (t) => t.toLowerCase().trim() === skillLower || skillLower.includes(t.toLowerCase().trim()) || t.toLowerCase().trim().includes(skillLower)
    );
    const contributionMatches = (matched.exactContribution || '').toLowerCase().includes(skillLower);

    if (!techMatches && !contributionMatches) {
      return {
        canClaimProduction: false,
        tier: 'UNVERIFIED',
        reason: `Referenced project "${matched.name}" does not include skill "${skill.name}" in its technology stack or personal contribution`,
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

    resolvedProjects.push(matched);
  }

  // Distinguish independent verification from candidate confirmation
  const allIndependentlyVerified =
    skill.status === 'INDEPENDENTLY_VERIFIED' &&
    resolvedProjects.every((p) => p.status === 'INDEPENDENTLY_VERIFIED');

  if (allIndependentlyVerified) {
    return {
      canClaimProduction: true,
      tier: 'INDEPENDENTLY_VERIFIED',
      resolvedProjects,
      isIndependentlyVerified: true,
    };
  }

  const isCandidateReported =
    (skill.candidateConfirmed || skill.status === 'CANDIDATE_CONFIRMED') &&
    resolvedProjects.every((p) => p.candidateConfirmed || p.status === 'CANDIDATE_CONFIRMED' || p.status === 'DOCUMENT_SUPPORTED');

  if (isCandidateReported) {
    return {
      canClaimProduction: true,
      tier: 'CANDIDATE_REPORTED_PRACTICAL',
      reason: 'Validated by candidate-confirmed project implementation evidence',
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
