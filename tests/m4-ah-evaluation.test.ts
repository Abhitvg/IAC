import { describe, expect, it } from 'vitest';
import { evaluateJobFit } from '../packages/cloud-core/src/evaluation/ah-evaluation';
import type { JobPosting } from '../packages/cloud-core/src/plugins';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';
import type { SprintContract } from '../packages/cloud-core/src/contract';

describe('M4: A-H 1-5 Job Evaluation Engine', () => {
  const confirmedFacts: CandidateFact[] = [
    {
      factKey: 'experience.stripe-staff-engineer',
      category: 'experience',
      payload: {
        company: 'Stripe',
        role: 'Staff Software Engineer',
        startDate: '2021',
        endDate: null,
        isCurrent: true,
        achievements: [
          'Architected global ledger processing 100k writes/sec with 99.999% reliability',
          'Scaled distributed storage engine across multi-region Kubernetes clusters',
        ],
        technologies: ['TypeScript', 'Go', 'PostgreSQL', 'Kafka'],
      },
      source: { kind: 'document' },
      suggestedConfidence: 0.95,
    },
    {
      factKey: 'skill.typescript',
      category: 'skill',
      payload: { name: 'TypeScript', category: 'language', proficiency: 'expert' },
      source: { kind: 'document' },
      suggestedConfidence: 0.95,
    },
    {
      factKey: 'skill.go',
      category: 'skill',
      payload: { name: 'Go', category: 'language', proficiency: 'expert' },
      source: { kind: 'document' },
      suggestedConfidence: 0.9,
    },
    {
      factKey: 'skill.postgresql',
      category: 'skill',
      payload: { name: 'PostgreSQL', category: 'database', proficiency: 'expert' },
      source: { kind: 'document' },
      suggestedConfidence: 0.9,
    },
    {
      factKey: 'education.mit-bs',
      category: 'education',
      payload: { institution: 'MIT', degree: 'Bachelor of Science in CS', endDate: '2020' },
      source: { kind: 'document' },
      suggestedConfidence: 0.95,
    },
  ];

  const contract: SprintContract = {
    version: 1,
    roles: ['Staff Software Engineer', 'Systems Architect'],
    seniority: ['staff'],
    locations: ['Remote'],
    remotePreference: 'remote',
    salaryFloor: { amount: 200000, currency: 'USD' },
    workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
    blocklist: { companies: [], industries: [] },
    enabledChannels: ['ats'],
    dailyCaps: { applications: 20, emails: 0, assistQueueItems: 5, calendarEvents: 2 },
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

  it('generates high score and apply recommendation for matching distributed systems role', () => {
    const job: JobPosting = {
      sourceId: 'src-1',
      platform: 'greenhouse',
      company: 'Datadog',
      title: 'Staff Software Engineer - Distributed Systems',
      location: 'Remote - US',
      remoteType: 'remote',
      url: 'https://example.com/job/1',
      externalId: '1',
      descriptionText:
        'Build high throughput distributed storage with Go and TypeScript. Operate Kafka and PostgreSQL at scale.',
      compensation: { min: 220000, max: 260000, currency: 'USD', interval: 'year' },
    };

    const report = evaluateJobFit(job, confirmedFacts, contract);

    expect(report.score).toBeGreaterThanOrEqual(4.0);
    expect(report.recommendation).toBe('apply');
    expect(report.dimensions.A_core_competency.score).toBeGreaterThanOrEqual(4.0);
    expect(report.dimensions.B_seniority_scope.score).toBeGreaterThanOrEqual(4.5);
    expect(report.dimensions.C_scale_complexity.score).toBeGreaterThanOrEqual(4.5);
    expect(report.dimensions.D_tech_stack.score).toBeGreaterThanOrEqual(4.0);
    expect(report.matchedSkills).toContain('typescript');
    expect(report.matchedSkills).toContain('go');
  });

  it('recommends skip when remote preference conflicts with onsite requirement', () => {
    const onsiteJob: JobPosting = {
      sourceId: 'src-2',
      platform: 'lever',
      company: 'Acme',
      title: 'Staff Software Engineer',
      location: 'New York, NY',
      remoteType: 'onsite',
      url: 'https://example.com/job/2',
      externalId: '2',
      descriptionText: 'Must be on-site 5 days a week in New York headquarters.',
    };

    const report = evaluateJobFit(onsiteJob, confirmedFacts, contract);

    expect(report.dimensions.G_location_auth.score).toBe(1.0);
    expect(report.recommendation).toBe('skip');
    expect(report.identifiedGaps.some((g) => g.includes('Onsite location conflicts'))).toBe(true);
  });
});
