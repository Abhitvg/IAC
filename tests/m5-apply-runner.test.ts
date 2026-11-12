import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AtsApplyRunner } from '../packages/cloud-core/src/apply/apply-runner';
import {
  AtsApplyWorker,
  type PlaywrightApplyDriver,
} from '../packages/cloud-core/src/apply/playwright-worker';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { CandidateConfirmedProfile } from '../packages/cloud-core/src/apply/answer-bank';
import type { JobPosting } from '../packages/cloud-core/src/plugins';

describe('Milestone M5 - ATS Apply Runner Orchestration', () => {
  const tenantId = randomUUID();
  const factId = randomUUID();

  const mockContract: SprintContract = {
    version: 1,
    roles: ['Backend Engineer'],
    seniority: ['senior'],
    locations: ['San Francisco, CA'],
    remotePreference: 'remote',
    salaryFloor: { amount: 170000, currency: 'USD' },
    workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
    blocklist: { companies: [], industries: [] },
    enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
    dailyCaps: { applications: 20, emails: 20, assistQueueItems: 10, calendarEvents: 5 },
    allowedFactIds: [factId],
    defaultAnswers: {},
    tone: 'professional',
    senderIdentity: { name: 'Bob Smith', email: 'bob@example.com' },
    jurisdiction: ['US'],
    outreachConsent: true,
    consentTextVersion: 'v1.0',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 3).toISOString(),
  };

  const mockProfile: CandidateConfirmedProfile = {
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@example.com',
    location: 'San Francisco, CA',
    experiences: [
      {
        company: 'Cloud Corp',
        role: 'Senior Engineer',
        startDate: '2020-01',
        endDate: null,
        isCurrent: true,
        achievements: ['Built cloud services'],
        technologies: ['Node.js'],
      },
    ],
  };

  const mockJob: JobPosting = {
    sourceId: 'job_123',
    platform: 'greenhouse',
    company: 'Vercel',
    title: 'Senior Backend Engineer',
    location: 'Remote',
    remoteType: 'remote',
    url: 'https://boards.greenhouse.io/vercel/jobs/12345',
    externalId: 'ext_12345',
    descriptionText: 'Looking for a senior backend engineer with Node.js experience.',
  };

  it('skips application when global kill switch is active', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({ html: '', fields: [] }),
      submitForm: async () => ({ success: true, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.5,
      isKillSwitchActive: () => true, // Kill switch engaged!
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('Tenant global kill switch is currently active');
  });

  it('skips application when ATS channel is paused', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({ html: '', fields: [] }),
      submitForm: async () => ({ success: true, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.5,
      isChannelPaused: (ch) => ch === 'ats',
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('ATS channel is paused');
  });

  it('skips application when evaluation score is below tenant threshold', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({ html: '', fields: [] }),
      submitForm: async () => ({ success: true, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 2.8, // Below 3.5 threshold
      scoreThreshold: 3.5,
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('below tenant threshold');
  });

  it('blocks application when tailored artifacts fail truthfulness gate (H3)', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({ html: '', fields: [] }),
      submitForm: async () => ({ success: true, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.2,
      tailoredCvText: 'Fabricated text claiming PhD in Quantum Computing from MIT',
      verifyTruthfulness: (_text) => ({
        passed: false,
        violations: ['Unverified degree: PhD in Quantum Computing from MIT'],
      }),
    });

    expect(result.status).toBe('blocked_truthfulness');
    expect(result.truthfulnessViolations).toContain(
      'Unverified degree: PhD in Quantum Computing from MIT'
    );
  });

  it('skips application when duplicate application was submitted within 90 days', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({ html: '', fields: [] }),
      submitForm: async () => ({ success: true, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.5,
      existingApplications: [
        {
          company: 'Vercel',
          role: 'Senior Backend Engineer',
          createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
        },
      ],
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('Duplicate application guard');
  });

  it('hands off to Assist Queue when bot challenge is detected on target form (H2)', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({
        html: '<html><body><div class="g-recaptcha" data-sitekey="xyz"></div></body></html>',
        fields: [],
      }),
      submitForm: async () => ({ success: false, submittedPayload: {}, htmlAfterSubmit: '' }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.5,
    });

    expect(result.status).toBe('assist_required');
    expect(result.assistQueueItem).toBeDefined();
    expect(result.assistQueueItem?.handOffReason).toBe('captcha_detected');
    expect(result.assistQueueItem?.company).toBe('Vercel');
  });

  it('successfully applies, generates proof with cryptographic SHA-256 payload digest', async () => {
    const mockDriver: PlaywrightApplyDriver = {
      extractFields: async () => ({
        html: '<html><body><form><input name="first_name" /><input name="last_name" /><input name="email" /></form></body></html>',
        fields: [
          { id: '1', name: 'first_name', label: 'First Name', type: 'text', required: true },
          { id: '2', name: 'last_name', label: 'Last Name', type: 'text', required: true },
          { id: '3', name: 'email', label: 'Email', type: 'email', required: true },
        ],
      }),
      submitForm: async (_url, answers) => ({
        success: true,
        confirmationNumber: 'VERCEL-APP-9988',
        screenshotUrl: 'https://s3.local/proofs/vercel.png',
        submittedPayload: answers,
        htmlAfterSubmit: '<html><body>Application Received!</body></html>',
      }),
    };

    const runner = new AtsApplyRunner(new AtsApplyWorker(mockDriver));
    const result = await runner.execute({
      tenantId,
      contract: mockContract,
      profile: mockProfile,
      job: mockJob,
      evaluationScore: 4.8,
    });

    expect(result.status).toBe('applied');
    expect(result.proof).toBeDefined();
    expect(result.proof?.confirmationNumber).toBe('VERCEL-APP-9988');
    expect(result.proof?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.proof?.proofUrl).toBe('https://s3.local/proofs/vercel.png');
  });
});

