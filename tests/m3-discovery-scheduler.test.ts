import { describe, expect, it } from 'vitest';
import {
  computeJobFingerprint,
  deduplicatePostings,
  normalizeCompanyName,
  normalizeJobTitle,
} from '../packages/cloud-core/src/discovery/dedupe';
import {
  matchesSprintContract,
  runDiscoveryWave,
} from '../packages/cloud-core/src/discovery/scheduler';
import type { JobPosting, JobSource } from '../packages/cloud-core/src/plugins';
import type { SprintContract } from '../packages/cloud-core/src/contract';

describe('M3: Deduplication and Discovery Wave Scheduler', () => {
  const sampleContract: SprintContract = {
    version: 1,
    roles: ['Staff Software Engineer', 'Systems Architect'],
    seniority: ['staff', 'principal'],
    locations: ['San Francisco, CA'],
    remotePreference: 'remote',
    salaryFloor: { amount: 200000, currency: 'USD' },
    workAuthorization: {
      countries: ['US'],
      requiresSponsorship: false,
      confirmed: true,
    },
    blocklist: {
      companies: ['Competitor Corp', 'Spam Inc'],
      industries: ['Gambling'],
    },
    enabledChannels: ['ats'],
    dailyCaps: {
      applications: 20,
      emails: 0,
      assistQueueItems: 5,
      calendarEvents: 2,
    },
    defaultAnswers: {},
    allowedFactIds: [],
    tone: 'professional',
    senderIdentity: { name: 'Alice', email: 'alice@example.com' },
    jurisdiction: ['US'],
    outreachConsent: false,
    consentTextVersion: 'v1.0',
    startsAt: '2026-11-12T00:00:00.000Z',
    endsAt: '2026-11-16T00:00:00.000Z',
  };

  it('normalizes company names and job titles for stable deduplication', () => {
    expect(normalizeCompanyName('Stripe, Inc.')).toBe('stripe');
    expect(normalizeCompanyName('Google LLC')).toBe('google');
    expect(normalizeJobTitle('Staff Software Engineer (Remote)')).toBe('staff software engineer');
    expect(normalizeJobTitle('Staff Software Engineer - Remote [US]')).toBe(
      'staff software engineer'
    );
  });

  it('deduplicates postings across sources with identical fingerprint', () => {
    const jobA: JobPosting = {
      sourceId: 'greenhouse:stripe',
      platform: 'greenhouse',
      company: 'Stripe, Inc.',
      title: 'Staff Software Engineer (Remote)',
      location: 'Remote',
      remoteType: 'remote',
      url: 'https://boards.greenhouse.io/stripe/jobs/12345',
      externalId: '12345',
      descriptionText: 'Distributed systems engineering at Stripe.',
    };

    const jobB: JobPosting = {
      sourceId: 'lever:stripe',
      platform: 'lever',
      company: 'Stripe',
      title: 'Staff Software Engineer',
      location: 'Remote - US',
      remoteType: 'remote',
      url: 'https://jobs.lever.co/stripe/12345',
      externalId: '12345',
      descriptionText: 'Distributed systems engineering at Stripe.',
    };

    expect(computeJobFingerprint(jobA)).toBe(computeJobFingerprint(jobB));

    const deduplicated = deduplicatePostings([jobA, jobB]);
    expect(deduplicated).toHaveLength(1);
  });

  it('filters out jobs blocked by Sprint Contract (blocklist, salary floor, remote preference)', () => {
    const blockedCompanyJob: JobPosting = {
      sourceId: 'src-1',
      platform: 'greenhouse',
      company: 'Competitor Corp, Inc.',
      title: 'Staff Software Engineer',
      location: 'Remote',
      remoteType: 'remote',
      url: 'https://example.com/job/1',
      externalId: '1',
      descriptionText: 'Engineering role',
    };

    const onsiteJob: JobPosting = {
      sourceId: 'src-2',
      platform: 'greenhouse',
      company: 'Good Co',
      title: 'Staff Software Engineer',
      location: 'New York, NY',
      remoteType: 'onsite',
      url: 'https://example.com/job/2',
      externalId: '2',
      descriptionText: 'Must be in office 5 days a week',
    };

    const lowSalaryJob: JobPosting = {
      sourceId: 'src-3',
      platform: 'greenhouse',
      company: 'Good Co',
      title: 'Staff Software Engineer',
      location: 'Remote',
      remoteType: 'remote',
      url: 'https://example.com/job/3',
      externalId: '3',
      descriptionText: 'Remote engineering role',
      compensation: { min: 140000, max: 160000, currency: 'USD', interval: 'year' },
    };

    const matchingJob: JobPosting = {
      sourceId: 'src-4',
      platform: 'greenhouse',
      company: 'Good Co',
      title: 'Staff Software Engineer',
      location: 'Remote',
      remoteType: 'remote',
      url: 'https://example.com/job/4',
      externalId: '4',
      descriptionText: 'Remote engineering role',
      compensation: { min: 220000, max: 250000, currency: 'USD', interval: 'year' },
    };

    expect(matchesSprintContract(blockedCompanyJob, sampleContract)).toBe(false);
    expect(matchesSprintContract(onsiteJob, sampleContract)).toBe(false);
    expect(matchesSprintContract(lowSalaryJob, sampleContract)).toBe(false);
    expect(matchesSprintContract(matchingJob, sampleContract)).toBe(true);
  });

  it('runs a complete discovery wave across sources and dispatches credible matched jobs', async () => {
    const mockSource: JobSource = {
      id: 'mock-source',
      platform: 'greenhouse',
      fetchPostings: async () => [
        {
          sourceId: 'src-1',
          platform: 'greenhouse',
          company: 'Acme Cloud',
          title: 'Staff Software Engineer',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://example.com/acme/1',
          externalId: 'acme-1',
          descriptionText:
            'Lead distributed systems architecture with Go and TypeScript. Minimum 8 years experience.',
          postedAt: new Date().toISOString(),
        },
        {
          sourceId: 'src-2',
          platform: 'greenhouse',
          company: 'Scam Firm',
          title: 'Immediate Hire - Cashier Check Assistant',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://example.com/scam/2',
          externalId: 'scam-2',
          descriptionText: 'We send you a check for equipment. Contact via Telegram @fastcash.',
        },
        {
          sourceId: 'src-3',
          platform: 'greenhouse',
          company: 'Competitor Corp',
          title: 'Staff Software Engineer',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://example.com/comp/3',
          externalId: 'comp-3',
          descriptionText: 'Good engineering role at competitor.',
        },
      ],
    };

    const persisted: JobPosting[] = [];
    const dispatcher = {
      trackJob: async (job: JobPosting) => {
        persisted.push(job);
        return true;
      },
    };

    const summary = await runDiscoveryWave([mockSource], sampleContract, dispatcher);

    expect(summary.totalFetched).toBe(3);
    expect(summary.scamSkipped).toBe(1); // Scam Firm rejected
    expect(summary.blocklistSkipped).toBe(1); // Competitor Corp blocked
    expect(summary.matchedCount).toBe(1); // Acme Cloud approved
    expect(summary.persistedCount).toBe(1);
    expect(persisted[0].company).toBe('Acme Cloud');
  });
});
