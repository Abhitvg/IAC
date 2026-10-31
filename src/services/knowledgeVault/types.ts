/**
 * Candidate Knowledge Vault Domain Model & Types
 * Defines the core entities, fine-grained evidence classifications, and semantic relationships
 * ensuring zero hallucination and complete provenance tracking.
 */

import { ExtractedClaim, SourceType } from '../ingestion/types';

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

export interface CandidateSource {
  sourceId: string;
  sourceType: SourceType | 'website_page' | 'github_repo' | 'manual_entry';
  title: string;
  urlOrPath: string;
  hash: string;
  addedAt: number;
  lastUpdatedAt: number;
  rawSnippetCount: number;
}

export interface EvidenceRecord {
  evidenceId: string;
  sourceId: string;
  sourceType: SourceType | 'website_page' | 'github_repo' | 'manual_entry';
  rawSnippet: string;
  contentHash: string;
  classification: EvidenceClassification;
  confidence: number;
  capturedAt: number;
  verifiedAt?: number;
  verificationNotes?: string;
}

export interface CandidateProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  links: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
    other?: string[];
  };
  summary?: string;
  evidenceIds: string[];
}

export type OwnershipLevel =
  | 'SOLE_OWNER'
  | 'PRIMARY_CONTRIBUTOR'
  | 'COLLABORATOR'
  | 'UNKNOWN';

export interface ProjectContribution {
  id: string;
  description: string;
  ownership: OwnershipLevel;
  evidenceId?: string;
}

export interface ProjectRecord {
  id: string;
  title: string;
  description: string;
  role?: string;
  technologies: string[];
  architecture?: string;
  contributions: ProjectContribution[];
  outcomes: string[];
  metrics: string[];
  repoUrl?: string;
  liveUrl?: string;
  startDate?: string;
  endDate?: string;
  evidenceIds: string[];
  status: EvidenceClassification;
}

export interface ExperienceRecord {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  durationMonths: number;
  location?: string;
  responsibilities: string[];
  technologies: string[];
  metrics: string[];
  associatedProjectIds: string[];
  evidenceIds: string[];
  status: EvidenceClassification;
}

export type TechCategory =
  | 'language'
  | 'framework'
  | 'database'
  | 'tool'
  | 'cloud'
  | 'architecture'
  | 'ai_ml'
  | 'other';

export interface TechnologyRecord {
  name: string;
  category: TechCategory;
  proficiency?: 'expert' | 'proficient' | 'familiar';
  experienceYears?: number;
  firstSeen?: string;
  lastSeen?: string;
  associatedProjectIds: string[];
  associatedExperienceIds: string[];
  evidenceIds: string[];
}

export type RelationType =
  | 'worked_at'
  | 'built'
  | 'used'
  | 'authored'
  | 'achieved'
  | 'sourced_from';

export interface KnowledgeRelationship {
  id: string;
  fromType: 'candidate' | 'experience' | 'project' | 'technology' | 'source';
  fromId: string;
  relation: RelationType;
  toType: 'candidate' | 'experience' | 'project' | 'technology' | 'source';
  toId: string;
  metadata?: Record<string, unknown>;
}

export interface CandidateKnowledgeVault {
  schemaVersion: number;
  profile: CandidateProfile;
  sources: CandidateSource[];
  experiences: ExperienceRecord[];
  projects: ProjectRecord[];
  technologies: TechnologyRecord[];
  evidenceRecords: EvidenceRecord[];
  relationships: KnowledgeRelationship[];
  unreviewedClaims: ExtractedClaim[];
  lastSavedAt: number;
}

export interface KnowledgeQueryOptions {
  query: string;
  filterEntity?: 'all' | 'project' | 'experience' | 'technology';
  technologies?: string[];
  minClassification?: EvidenceClassification;
  limit?: number;
}

export interface KnowledgeQueryResult {
  matchedProjects: ProjectRecord[];
  matchedExperiences: ExperienceRecord[];
  matchedTechnologies: TechnologyRecord[];
  relevantEvidence: EvidenceRecord[];
  confidenceScore: number;
  exactMatch: boolean;
}

