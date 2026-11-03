/**
 * Document Ingestion & Structured Claim Types (IAC Multi-Source Ingestion Engine)
 */

export type SourceType =
  | 'resume_pdf'
  | 'resume_docx'
  | 'resume_text'
  | 'website_page'
  | 'github_repo'
  | 'linkedin_profile'
  | 'candidate_input'
  | 'document_attachment';

export type EvidenceClassification =
  | 'RESUME_REPORTED'
  | 'WEBSITE_REPORTED'
  | 'CANDIDATE_CONFIRMED'
  | 'REPOSITORY_SUPPORTED'
  | 'DOCUMENT_SUPPORTED'
  | 'INDEPENDENTLY_VERIFIED'
  | 'UNKNOWN'
  | 'PROPOSED_DESIGN'
  | 'CONTRADICTED'
  | 'EXPIRED';

export type ClaimReviewStatus =
  | 'pending_review'
  | 'confirmed'
  | 'rejected'
  | 'edited'
  | 'merged';

export interface SourceLocation {
  pageNumber?: number;
  sectionHeading?: string;
  lineStart?: number;
  lineEnd?: number;
  characterOffset?: number;
  url?: string;
}

export interface ExtractedClaim {
  claimId: string;
  candidateId: string;
  sourceId: string;
  sourceType: SourceType;
  fieldName: string; // e.g., 'employment.role', 'project.metric', 'education.degree', 'skill.item'
  entityContextId?: string; // Links claim to a specific employer or project id
  rawText: string;
  normalizedValue: any;
  sourceLocation: SourceLocation;
  extractionMethod: 'deterministic_parse' | 'heuristic_nlp' | 'llm_structured';
  extractionConfidence: number; // 0.0 to 1.0 (parsing fidelity, NOT factual verification)
  evidenceStatus: EvidenceClassification;
  reviewStatus: ClaimReviewStatus;
  createdAt: number;
  updatedAt: number;
  parserVersion: string;
}

export interface ExtractedPersonalProfile {
  fullName: string;
  headline?: string;
  email: string;
  phone: string;
  location: string;
  websites: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  otherLinks?: string[];
  professionalSummary?: string;
}

export interface ExtractedEducationRecord {
  id: string;
  institution: string;
  degree: string;
  department?: string;
  specialization?: string;
  startDate?: string;
  endDate?: string;
  gradeGpa?: string;
  thesisTitle?: string;
  relevantCoursework?: string[];
  academicAchievements?: string[];
  rawText: string;
}

export interface ExtractedEmploymentRecord {
  id: string;
  employer: string;
  role: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  isCurrentRole: boolean;
  responsibilities: string[];
  technologies: string[];
  metrics: string[];
  associatedProjectIds: string[];
  ownershipClaims?: string[];
  rawText: string;
}

export interface ExtractedProjectRecord {
  id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  contextType: 'employer' | 'personal' | 'client' | 'university' | 'open_source';
  associatedEmployerId?: string;
  candidateRole: 'contributor' | 'lead' | 'architect' | 'sole_author' | 'unknown';
  technologies: string[];
  architecture?: string;
  deploymentStatus?: 'deployed_production' | 'staging_demo' | 'prototype' | 'proposed_design' | 'unreleased' | 'UNKNOWN';
  outcomes: string[];
  metrics: string[];
  exactContribution?: string;
  limitations?: string[];
  projectUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  rawText: string;
}

export interface ExtractedSkillsInventory {
  languages: string[];
  frontend: string[];
  backend: string[];
  databases: string[];
  cloud: string[];
  devops: string[];
  aiMl: string[];
  testing: string[];
  security: string[];
  tools: string[];
  design: string[];
  softSkills: string[];
  domainKnowledge: string[];
  other: string[];
  // Backwards compatibility aliases
  frameworks?: string[];
  messaging?: string[];
  architecture?: string[];
}

export interface ExtractedAchievement {
  id: string;
  headline: string;
  metric?: string;
  context: string;
  rawText: string;
}

export interface ExtractedCertification {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
  credentialId?: string;
  url?: string;
  rawText: string;
}

export interface ExtractedPublication {
  id: string;
  title: string;
  publisher?: string;
  date?: string;
  url?: string;
  authors?: string[];
  rawText: string;
}

export interface ExtractedVolunteerRecord {
  id: string;
  organization: string;
  role: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  rawText: string;
}

export interface PageDiagnostic {
  pageNumber: number;
  wordCount: number;
  characterCount: number;
  ocrApplied: boolean;
  warnings: string[];
}

export interface ChronologyAlert {
  type: 'overlap' | 'impossible_dates' | 'missing_start' | 'future_date' | 'unexplained_gap';
  severity: 'info' | 'warning' | 'error';
  message: string;
  recordIds: string[];
}

export interface IngestionResult {
  sourceId: string;
  sourceType: SourceType;
  documentTitle: string;
  rawText: string;
  pageCount: number;
  pageDiagnostics?: PageDiagnostic[];
  isImageOnlyOrScanned: boolean;
  ocrRequired: boolean;
  personalProfile: ExtractedPersonalProfile;
  education: ExtractedEducationRecord[];
  employment: ExtractedEmploymentRecord[];
  projects: ExtractedProjectRecord[];
  skills: ExtractedSkillsInventory;
  achievements: ExtractedAchievement[];
  certifications?: ExtractedCertification[];
  publications?: ExtractedPublication[];
  volunteer?: ExtractedVolunteerRecord[];
  claims: ExtractedClaim[];
  chronologyAlerts: ChronologyAlert[];
  sectionsDetected?: string[];
  warnings: string[];
  ingestedAt: number;
}
