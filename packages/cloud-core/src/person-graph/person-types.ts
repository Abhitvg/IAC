import { z } from 'zod';

export const RoleDomainEnum = z.enum([
  'recruiter',
  'hiring_manager',
  'peer_engineer',
  'alumni',
  'executive',
  'other',
]);
export type RoleDomain = z.infer<typeof RoleDomainEnum>;

export const RelationshipEnum = z.enum([
  '1st_degree',
  'alumni',
  'ex_colleague',
  'conference_speaker',
  'open_source',
  'cold',
]);
export type Relationship = z.infer<typeof RelationshipEnum>;

export const VerificationSourceEnum = z.enum([
  'licensed_provider',
  'public_company_page',
  'user_imported_connection',
]);
export type VerificationSource = z.infer<typeof VerificationSourceEnum>;

export const CrmStageEnum = z.enum([
  'lead',
  'contacted',
  'replied',
  'meeting_scheduled',
  'opted_out',
  'closed',
]);
export type CrmStage = z.infer<typeof CrmStageEnum>;

export interface Person {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  company: string;
  title: string;
  roleDomain: RoleDomain;
  relationship: Relationship;
  verificationSource: VerificationSource;
  timeZone: string;
  linkedinUrl?: string;
  lastContactedAt?: string;
  crmStage: CrmStage;
  notes?: string;
  howICanHelp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonRankingScore {
  personId: string;
  warmth: number;             // 0-100
  relevance: number;          // 0-100
  reachability: number;       // 0-100
  recencyActivity: number;    // 0-100
  reciprocityPotential: number; // 0-100
  compositeScore: number;     // 0-100
  explainableReason: string;
}
