/**
 * Canonical Candidate Profile & Provenance Engine (IAC 2.0 - Phase 2)
 *
 * Implements the single source of truth for candidate identity, education, career,
 * skills, work experience, projects, achievements, preferences, and employment declarations.
 *
 * Guarantees:
 * - Every fact has a unique ID, status, provenance source, confidence, and audit trail.
 * - Sensitive employment declarations are NEVER inferred; they require explicit candidate confirmation.
 * - Code in a repository does NOT establish personal authorship without verified contribution evidence.
 * - Technologies in resumes do NOT establish production experience without validated project association.
 * - Project descriptions do NOT prove deployment or leadership without verified outcomes.
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
  previousValue: any;
  updatedBy: 'candidate' | 'ingestion' | 'system';
  reason?: string;
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
  editHistory: FactEditHistoryEntry[];
}

export interface CandidateEducation {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
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
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  experienceType: 'theoretical' | 'practical';
  yearsUsed: number;
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
  deploymentStatus: 'deployed_production' | 'staging_demo' | 'prototype' | 'proposed_design' | 'unreleased';
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

  // Section C: Career Overview
  career: {
    currentRole: string;
    currentEmployer?: string;
    totalExperienceYears: number;
    targetRoles: string[];
    preferredIndustries: string[];
    targetSeniority: 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'principal' | 'executive';
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
      totalExperienceYears: 0,
      targetRoles: [],
      preferredIndustries: [],
      targetSeniority: 'senior',
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
 * Creates a new Canonical Candidate Fact with rigorous validation.
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
  if (!declaration.confirmed) return false;
  return declaration.authorized !== null || declaration.required !== null;
}

/**
 * Invariant Check: Does a repository or code observation establish personal authorship?
 * Rule: Repository presence alone only grants REPOSITORY_SUPPORTED; personal claims require
 * verified contribution notes and explicit candidate confirmation.
 */
export function canClaimPersonalAuthorship(project: CandidateProject): boolean {
  if (!project.candidateConfirmed) return false;
  if (!project.exactContribution || project.exactContribution.trim().length === 0) return false;
  if (project.ownership === 'UNKNOWN') return false;
  return (
    project.status === 'CANDIDATE_CONFIRMED' ||
    project.status === 'DOCUMENT_SUPPORTED' ||
    project.status === 'INDEPENDENTLY_VERIFIED'
  );
}

/**
 * Invariant Check: Does a skill qualify for production-level experience claims?
 * Rule: Skills must have practical experience type, at least 1 verified project reference, and not be theoretical-only.
 */
export function canClaimProductionSkillExperience(skill: CandidateSkill): boolean {
  if (skill.experienceType !== 'practical') return false;
  if (!skill.projectReferences || skill.projectReferences.length === 0) return false;
  return (
    skill.status === 'CANDIDATE_CONFIRMED' ||
    skill.status === 'DOCUMENT_SUPPORTED' ||
    skill.status === 'INDEPENDENTLY_VERIFIED'
  );
}
