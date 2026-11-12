import { z } from 'zod';

export const JobPlatformEnum = z.enum([
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'smartrecruiters',
  'workday',
  'custom',
]);

export type JobPlatform = z.infer<typeof JobPlatformEnum>;

export interface JobPosting {
  sourceId: string;
  platform: JobPlatform;
  company: string;
  title: string;
  location: string;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  url: string;
  externalId: string;
  descriptionText: string;
  postedAt?: string;
  updatedAt?: string;
  compensation?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: 'year' | 'month' | 'hour';
  };
  rawPayload?: Record<string, unknown>;
}

export interface JobSourceQuery {
  companySlugs?: string[];
  roles?: string[];
  locations?: string[];
  remoteOnly?: boolean;
  limit?: number;
}

/**
 * Plugin interface for discovering job postings from public boards or APIs.
 */
export interface JobSource {
  readonly id: string;
  readonly platform: JobPlatform;
  fetchPostings(query: JobSourceQuery): Promise<JobPosting[]>;
}

/**
 * Plugin interface for applying to employer ATS systems (used by M5 workers).
 */
export interface ApplyAdapter {
  readonly id: string;
  readonly platform: JobPlatform;
  canHandle(url: string): boolean;
}

/**
 * Plugin interface for outbound communication channels (email, assist queue, etc.).
 */
export interface MessageChannel {
  readonly id: string;
  readonly channelType: 'email' | 'linkedin_assist' | 'calendar';
  send(payload: unknown): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * Plugin interface for finding verified business contacts for outreach.
 */
export interface ContactSource {
  readonly id: string;
  findCompanyContacts(companyName: string, roleDomain?: string): Promise<unknown[]>;
}
