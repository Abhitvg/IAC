import { describe, expect, it } from 'vitest';
import { generateTailoredArtifacts } from '../packages/cloud-core/src/evaluation/tailoring-engine';
import type { JobPosting } from '../packages/cloud-core/src/plugins';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';
import type { SprintContract } from '../packages/cloud-core/src/contract';

describe('M4: Resume and Cover Letter Tailoring Engine', () => {
  const confirmedFacts: CandidateFact[] = [
    {
      factKey: 'profile.headline',
      category: 'profile',
      payload: {
        headline: 'Staff Engineer',
        summary: 'Distributed systems architect',
        location: 'Remote',
      },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
    {
      factKey: 'experience.stripe-staff-engineer',
      category: 'experience',
      payload: {
        company: 'Stripe',
        role: 'Staff Software Engineer',
        startDate: '2021',
        endDate: null,
        isCurrent: true,
        achievements: ['Architected distributed ledger handling 100k writes/sec'],
        technologies: ['TypeScript', 'Go'],
      },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
    {
      factKey: 'skill.typescript',
      category: 'skill',
      payload: { name: 'TypeScript', category: 'language' },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
    {
      factKey: 'education.mit-bs',
      category: 'education',
      payload: {
        institution: 'MIT',
        degree: 'Bachelor of Science in Computer Science',
        endDate: '2020',
      },
      source: { kind: 'document' },
      suggestedConfidence: 1.0,
    },
  ];

  const contract: SprintContract = {
    version: 1,
    roles: ['Staff Software Engineer'],
    seniority: ['staff'],
    locations: ['Remote'],
    remotePreference: 'remote',
    salaryFloor: { amount: 200000, currency: 'USD' },
    workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
    blocklist: { companies: [], industries: [] },
    enabledChannels: ['ats', 'email'],
    dailyCaps: { applications: 20, emails: 10, assistQueueItems: 5, calendarEvents: 2 },
    defaultAnswers: {},
    allowedFactIds: [],
    tone: 'professional',
    senderIdentity: { name: 'Alice Smith', email: 'alice@example.com' },
    jurisdiction: ['US'],
    outreachConsent: true,
    consentTextVersion: 'v1.0',
    startsAt: '2026-11-12T00:00:00.000Z',
    endsAt: '2026-11-16T00:00:00.000Z',
  };

  const job: JobPosting = {
    sourceId: 'src-1',
    platform: 'greenhouse',
    company: 'Anthropic',
    title: 'Staff Systems Engineer',
    location: 'Remote',
    remoteType: 'remote',
    url: 'https://example.com/job/1',
    externalId: '1',
    descriptionText: 'Build scalable distributed infrastructure.',
  };

  it('generates compilable sb2nov LaTeX resume containing candidate confirmed facts', () => {
    const artifacts = generateTailoredArtifacts(job, confirmedFacts, contract);

    expect(artifacts.tailoredResumeLatex).toContain('\\documentclass[letterpaper,11pt]{article}');
    expect(artifacts.tailoredResumeLatex).toContain('\\end{document}');
    expect(artifacts.tailoredResumeLatex).toContain('Alice Smith');
    expect(artifacts.tailoredResumeLatex).toContain('Stripe');
    expect(artifacts.tailoredResumeLatex).toContain('Staff Software Engineer');
    expect(artifacts.tailoredResumeLatex).toContain('100k writes/sec');
    expect(artifacts.tailoredResumeLatex).toContain('MIT');
    expect(artifacts.tailoredResumeLatex).toContain('TypeScript');
    expect(artifacts.usedFactKeys).toContain('experience.stripe-staff-engineer');
  });

  it('generates high-impact cover letter with clear sender identity and opt-out per H4', () => {
    const artifacts = generateTailoredArtifacts(job, confirmedFacts, contract);

    expect(artifacts.tailoredCoverLetterText).toContain('Dear Anthropic Hiring Team');
    expect(artifacts.tailoredCoverLetterText).toContain('Staff Systems Engineer');
    expect(artifacts.tailoredCoverLetterText).toContain('Stripe');
    expect(artifacts.tailoredCoverLetterText).toContain('Alice Smith');
    expect(artifacts.tailoredCoverLetterText).toContain('alice@example.com');
    // H4 requirement: clear opt-out statement
    expect(artifacts.tailoredCoverLetterText).toContain('opt-out');
  });
});
